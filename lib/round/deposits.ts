import { Connection, PublicKey } from "@solana/web3.js";
import type { Deposit } from "./store.ts";

/** Public RPCs rate-limit transaction lookups especially aggressively. */
const REQUEST_DELAY_MS = 750;
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
  /** Deposit transactions skipped because an earlier round already used them. */
  excluded: number;
  /** Incoming transfers from PREPUMP's own generated owner wallets. */
  internalExcluded: number;
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
  onProgress?: (scanned: number, total?: number) => void,
  excludedSignatures: ReadonlySet<string> = new Set(),
  excludedSenders: ReadonlySet<string> = new Set(),
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
  }

  const excluded = signatures.filter((signature) =>
    excludedSignatures.has(signature),
  ).length;
  const pendingSignatures = signatures.filter(
    (signature) => !excludedSignatures.has(signature),
  );
  onProgress?.(0, pendingSignatures.length);

  // 2. Fetch transactions one at a time. getParsedTransactions turns a list
  // into an HTTP JSON-RPC batch, which the public mainnet endpoint frequently
  // rejects with 429 even for a modest wallet history.
  const totals = new Map<string, { lamports: number; signatures: string[] }>();
  let unattributedLamports = 0;
  let internalExcluded = 0;

  for (let index = 0; index < pendingSignatures.length; index++) {
    const signature = pendingSignatures[index];
    const tx = await withRetry("reading transaction", () =>
      connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      }),
    );

    if (tx?.meta && !tx.meta.err) {
      const keys = tx.transaction.message.accountKeys;
      const ours = keys.findIndex((key) => key.pubkey.toBase58() === address);
      if (ours >= 0) {
        const credited = tx.meta.postBalances[ours] - tx.meta.preBalances[ours];

        // Anything we signed ourselves is our own movement, not a deposit.
        if (credited > 0 && !keys[ours]?.signer) {
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
          } else if (excludedSenders.has(sender)) {
            // Creator-reward sweeps and other PREPUMP-internal transfers are
            // operational funds returning home, never participant deposits.
            internalExcluded += 1;
          } else {
            const current = totals.get(sender) ?? {
              lamports: 0,
              signatures: [],
            };
            current.lamports += credited;
            current.signatures.push(
              tx.transaction.signatures[0] ?? signature,
            );
            totals.set(sender, current);
          }
        }
      }
    }

    onProgress?.(index + 1, pendingSignatures.length);
    if (index + 1 < pendingSignatures.length) await sleep(REQUEST_DELAY_MS);
  }

  const deposits: Deposit[] = [...totals.entries()]
    .map(([wallet, value]) => ({ wallet, ...value }))
    .sort((a, b) => b.lamports - a.lamports);

  return {
    deposits,
    totalLamports: deposits.reduce((sum, d) => sum + d.lamports, 0),
    unattributedLamports,
    scanned: pendingSignatures.length,
    excluded,
    internalExcluded,
  };
}
