import type { Deposit } from "./store.ts";

/** Exact largest-remainder split: no floating point loss or unassigned lamports. */
export function proportionalCosts(deposits: Deposit[], cost: number) {
  const total = deposits.reduce((sum, d) => sum + d.lamports, 0);
  if (!Number.isSafeInteger(cost) || cost < 0 || !Number.isSafeInteger(total) ||
      total <= cost || deposits.some(d => !Number.isSafeInteger(d.lamports) || d.lamports <= 0) ||
      new Set(deposits.map(d => d.wallet)).size !== deposits.length) {
    throw new Error("Invalid deposits or insufficient pool for shared costs.");
  }
  const rows = deposits.map((d, index) => {
    const product = BigInt(d.lamports) * BigInt(cost);
    return { index, cost: Number(product / BigInt(total)), remainder: product % BigInt(total) };
  });
  let left = cost - rows.reduce((sum, r) => sum + r.cost, 0);
  const ordered = [...rows].sort((a, b) => a.remainder === b.remainder
    ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const row of ordered) { if (left-- <= 0) break; row.cost++; }
  return rows.map(r => r.cost);
}
