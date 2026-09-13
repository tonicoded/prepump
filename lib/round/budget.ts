/**
 * Turns a gross round pool into the largest buy it can fund after fixed costs
 * and a fee charged as a percentage of the buy itself.
 */
export function netBuyLamports(
  grossLamports: number,
  fixedCostLamports: number,
  buyFeePercent: number,
) {
  if (
    !Number.isFinite(grossLamports) ||
    !Number.isFinite(fixedCostLamports) ||
    !Number.isFinite(buyFeePercent)
  ) {
    return 0;
  }

  const available = Math.max(0, grossLamports - fixedCostLamports);
  const multiplier = 1 + Math.max(0, buyFeePercent) / 100;
  return Math.floor(available / multiplier);
}
