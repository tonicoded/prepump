import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";

/**
 * A round's deposit wallet only ever receives SOL until the operator launches:
 * the first transaction it signs itself is the launch funding. Watching for
 * that closes the site the moment a launch starts, even when it runs early
 * from a machine the website cannot see.
 */
type Watch = { launched: boolean; checkedAt: number; seen: Set<string> };

const RECHECK_MS = 15_000;
const watches = new Map<string, Watch>();

export async function depositWalletLaunched(
  rpcUrl: string,
  address: string,
): Promise<boolean> {
  const watch = watches.get(address) ?? { launched: false, checkedAt: 0, seen: new Set() };
  watches.set(address, watch);
  // A launch cannot be undone, so a positive result never needs a recheck.
  if (watch.launched || Date.now() - watch.checkedAt < RECHECK_MS) return watch.launched;
  watch.checkedAt = Date.now();

  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const signatures = await connection.getSignaturesForAddress(new PublicKey(address), {
      limit: 25,
    });
    for (const { signature } of signatures) {
      if (watch.seen.has(signature)) continue;
      const transaction = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!transaction) continue; // not visible yet; look again next time
      const { message } = transaction.transaction;
      const signers = message.staticAccountKeys.slice(0, message.header.numRequiredSignatures);
      if (signers.some((key) => key.toBase58() === address)) {
        watch.launched = true;
        return true;
      }
      watch.seen.add(signature);
    }
  } catch {
    // RPC trouble must not lock a live round; the deposit window still applies.
  }
  return watch.launched;
}
