import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { RoundConfig } from "./config.ts";
import { LaunchError, confirmSignature, parseWallet } from "./pumpfun.ts";

export const PUMP_PROGRAM = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
);

/** Transfers per transaction, comfortably under the size cap. */
const BATCH = 8;

export type Holder = { owner: string; amount: bigint };
export type RewardPayout = {
  wallet: string;
  lamports: number;
  signature?: string;
  error?: string;
};

export function creatorVault(creator: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), creator.toBuffer()],
    PUMP_PROGRAM,
  )[0];
}

export function bondingCurve(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_PROGRAM,
  )[0];
}

/** What the vault holds beyond the rent it must keep to stay alive. */
export async function claimableLamports(
  connection: Connection,
  vault: PublicKey,
) {
  const info = await connection.getAccountInfo(vault);
  if (!info) return 0;
  const rent = await connection.getMinimumBalanceForRentExemption(
    info.data.length,
  );
  return Math.max(0, info.lamports - rent);
}

export async function collectCreatorFees(config: RoundConfig) {
  const wallet = parseWallet(config.walletSecret);
  const connection = new Connection(config.rpcUrl, "confirmed");

  const response = await fetch(config.pumpPortalUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      publicKey: wallet.publicKey.toBase58(),
      action: "collectCreatorFee",
      priorityFee: config.priorityFee,
    }),
  });

  if (!response.ok) {
    throw new LaunchError(
      `Fee collection failed (${response.status}): ${await response.text()}`,
    );
  }

  const transaction = VersionedTransaction.deserialize(
    new Uint8Array(await response.arrayBuffer()),
  );
  transaction.sign([wallet]);

  const signature = await connection.sendTransaction(transaction, {
    maxRetries: 3,
  });
  await confirmSignature(connection, signature);
  return signature;
}

/**
 * Every wallet holding the mint right now, minus the bonding curve that owns
 * the unsold supply and any address the caller wants left out.
 */
export async function snapshotHolders(
  connection: Connection,
  mint: PublicKey,
  tokenProgram: PublicKey,
  exclude: string[] = [],
): Promise<Holder[]> {
  const skip = new Set([
    bondingCurve(mint).toBase58(),
    ...exclude,
  ]);

  const accounts = await connection.getParsedProgramAccounts(tokenProgram, {
    filters: [{ memcmp: { offset: 0, bytes: mint.toBase58() } }],
  });

  const totals = new Map<string, bigint>();
  for (const account of accounts) {
    const data = account.account.data;
    if (!("parsed" in data)) continue;
    const info = data.parsed.info as {
      owner: string;
      tokenAmount: { amount: string };
    };
    const amount = BigInt(info.tokenAmount.amount);
    if (amount <= 0n || skip.has(info.owner)) continue;
    totals.set(info.owner, (totals.get(info.owner) ?? 0n) + amount);
  }

  return [...totals.entries()]
    .map(([owner, amount]) => ({ owner, amount }))
    .sort((a, b) => (b.amount > a.amount ? 1 : -1));
}

/** Splits lamports by token balance, dropping anything below the dust floor. */
export function allocateRewards(
  holders: Holder[],
  lamports: number,
  minLamports: number,
): RewardPayout[] {
  const supply = holders.reduce((sum, h) => sum + h.amount, 0n);
  if (supply === 0n || lamports <= 0) return [];

  return holders
    .map((holder) => ({
      wallet: holder.owner,
      lamports: Number((BigInt(lamports) * holder.amount) / supply),
    }))
    .filter((payout) => payout.lamports >= minLamports);
}

export async function sendRewards(
  connection: Connection,
  wallet: Keypair,
  payouts: RewardPayout[],
  onBatch?: (done: number, total: number) => void,
): Promise<RewardPayout[]> {
  const results = [...payouts];
  const pending = payouts.filter((payout) => !payout.signature);

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const transaction = new Transaction();

    for (const payout of batch) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: new PublicKey(payout.wallet),
          lamports: payout.lamports,
        }),
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
