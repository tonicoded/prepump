import { Connection, PublicKey } from "@solana/web3.js";
import type { Deposit } from "./store.ts";

/** Public RPCs rate limit hard; paid ones do not. Both survive this. */
const BATCH = 25;
const MAX_ATTEMPTS = 6;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRateLimited(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /429|too many requests|rate limit|503|service unavailable/i.test(message) ||
    (error as { code?: number })?.code === 429
  );
}

async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  let wait = 800;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt === MAX_ATTEMPTS || !isRateLimited(error)) {
        throw error instanceof Error
          ? new Error(`${label}: ${error.message}`)
          : error;
      }
      await sleep(wait);
      wait = Math.min(wait * 2, 12_000);
    }
  }
  throw new Error(`${label}: retries exhausted`);
}

export type ScanResult = {
  deposits: Deposit[];
  totalLamports: number;
  /** Credits we could not attribute to a signer, e.g. exchange withdrawals. */
  unattributedLamports: number;
  scanned: number;
};

/**
 * Reads every incoming SOL transfer to the deposit wallet inside the round
 * window and groups it by sender. Outgoing transactions and anything the
 * wallet signed itself are ignored.
 */
export async function scanDeposits(
  connection: Connection,
  wallet: PublicKey,
  opensAt: number,
  closesAt: number,
  onProgress?: (scanned: number) => void,
): Promise<ScanResult> {
  const address = wallet.toBase58();
  const openSeconds = Math.floor(opensAt / 1000);
  const closeSeconds = Math.floor(closesAt / 1000);

  // 1. Walk the signature history backwards until we pass the open time.
  const signatures: string[] = [];
  let before: string | undefined;
  let exhausted = false;

  while (!exhausted) {
    const page = await withRetry("reading signatures", () =>
      connection.getSignaturesForAddress(wallet, { limit: 1000, before }),
    );
    if (page.length === 0) break;

    for (const entry of page) {
      if (entry.err) continue;
      const time = entry.blockTime ?? 0;
      if (time && time < openSeconds) {
        exhausted = true;
        break;
      }
      if (time && time > closeSeconds) continue;
      signatures.push(entry.signature);
    }

    before = page[page.length - 1]?.signature;
    if (!before) break;
    onProgress?.(signatures.length);
  }

  // 2. Fetch them in batches and keep the ones that credited the wallet.
  const totals = new Map<string, { lamports: number; signatures: string[] }>();
  let unattributedLamports = 0;

  for (let i = 0; i < signatures.length; i += BATCH) {
    const batch = signatures.slice(i, i + BATCH);
    const transactions = await withRetry("reading transactions", () =>
      connection.getParsedTransactions(batch, {
        maxSupportedTransactionVersion: 0,
      }),
    );

    transactions.forEach((tx, index) => {
      if (!tx?.meta || tx.meta.err) return;

      const keys = tx.transaction.message.accountKeys;
      const ours = keys.findIndex((key) => key.pubkey.toBase58() === address);
      if (ours < 0) return;

      const credited = tx.meta.postBalances[ours] - tx.meta.preBalances[ours];
      if (credited <= 0) return;

      // Anything we signed ourselves is our own movement, not a deposit.
      if (keys[ours]?.signer) return;

      let sender: string | null = null;
      let spent = 0;
      keys.forEach((key, keyIndex) => {
        if (!key.signer) return;
        const delta =
          tx.meta!.postBalances[keyIndex] - tx.meta!.preBalances[keyIndex];
        if (delta < spent) {
          spent = delta;
          sender = key.pubkey.toBase58();
        }
      });

      if (!sender) {
        unattributedLamports += credited;
        return;
      }

      const current = totals.get(sender) ?? { lamports: 0, signatures: [] };
      current.lamports += credited;
      // Not batch[index]: the RPC may answer out of order.
      current.signatures.push(tx.transaction.signatures[0] ?? batch[index]);
      totals.set(sender, current);
    });

    onProgress?.(Math.min(i + BATCH, signatures.length));
    if (i + BATCH < signatures.length) await sleep(250);
  }

  const deposits: Deposit[] = [...totals.entries()]
    .map(([wallet, value]) => ({ wallet, ...value }))
    .sort((a, b) => b.lamports - a.lamports);

  return {
    deposits,
    totalLamports: deposits.reduce((sum, d) => sum + d.lamports, 0),
    unattributedLamports,
    scanned: signatures.length,
  };
}
