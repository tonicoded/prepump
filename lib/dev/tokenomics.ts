export const TOTAL_SUPPLY = 1_000_000_000;
export const DEV_ALLOCATION_PERCENT = 2;
export const HOLDER_ALLOCATION_PERCENT = 98;

export function calculatePoolShare(depositSol: number, totalSol: number) {
  if (!Number.isFinite(depositSol) || !Number.isFinite(totalSol) || totalSol <= 0) {
    return 0;
  }
  return Math.max(0, depositSol / totalSol);
}

export function calculateTokenAllocation(depositSol: number, totalSol: number) {
  const holderSupply = TOTAL_SUPPLY * (HOLDER_ALLOCATION_PERCENT / 100);
  return Math.floor(holderSupply * calculatePoolShare(depositSol, totalSol));
}


