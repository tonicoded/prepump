import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Deposit, Payout } from "./store.ts";

/** Transfers per transaction. Keeps each one comfortably under the size cap. */
const BATCH = 5;

export type Allocation = { wallet: string; tokens: bigint };

/**
 * Splits the tokens the launch wallet received across depositors, in
 * proportion to what each of them sent. The dev cut is kept back first, and
 * integer division means a few base units may be left over.
 */
export function allocate(
  deposits: Deposit[],
  totalLamports: number,
  distributable: bigint,
): Allocation[] {
  if (totalLamports <= 0 || distributable <= 0n) return [];
  return deposits
    .map((deposit) => ({
      wallet: deposit.wallet,
      tokens:
        (distributable * BigInt(deposit.lamports)) / BigInt(totalLamports),
    }))
    .filter((allocation) => allocation.tokens > 0n);
}

/**
 * pump.fun mints with Token-2022, other launchpads with the classic program.
 * Every account and instruction below has to use whichever owns the mint.
 */
export async function resolveTokenProgram(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint ${mint.toBase58()} not found.`);
  return info.owner;
}

export async function readTokenBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  programId: PublicKey = TOKEN_PROGRAM_ID,
) {
  const ata = await getAssociatedTokenAddress(mint, owner, false, programId);
  const account = await getAccount(connection, ata, "confirmed", programId);
  return { ata, amount: account.amount };
}

/**
 * Sends every outstanding payout. Already-sent rows are skipped, so the
 * command can be re-run safely after a failure.
 */
export async function sendPayouts(
  connection: Connection,
  wallet: Keypair,
  mint: PublicKey,
  decimals: number,
  payouts: Payout[],
  programId: PublicKey = TOKEN_PROGRAM_ID,
  onBatch?: (done: number, total: number) => void,
): Promise<Payout[]> {
  const source = await getAssociatedTokenAddress(
    mint,
    wallet.publicKey,
    false,
    programId,
  );
  const pending = payouts.filter((payout) => !payout.signature);
  const results = [...payouts];

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const transaction = new Transaction();

    for (const payout of batch) {
      const owner = new PublicKey(payout.wallet);
      const destination = await getAssociatedTokenAddress(
        mint,
        owner,
        false,
        programId,
      );

      const exists = await connection.getAccountInfo(destination);
      if (!exists) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            destination,
            owner,
            mint,
            programId,
          ),
        );
      }

      transaction.add(
        createTransferCheckedInstruction(
          source,
          mint,
          destination,
          wallet.publicKey,
          BigInt(payout.tokens),
          decimals,
          [],
          programId,
        ),
      );
    }

    try {
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet],
        { commitment: "confirmed", maxRetries: 3 },
      );
      for (const payout of batch) {
        const row = results.find((entry) => entry.wallet === payout.wallet)!;
        row.signature = signature;
        delete row.error;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Transfer failed.";
      for (const payout of batch) {
        const row = results.find((entry) => entry.wallet === payout.wallet)!;
        row.error = message;
      }
    }

    onBatch?.(Math.min(i + BATCH, pending.length), pending.length);
  }

  return results;
}
