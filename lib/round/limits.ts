/**
 * Smallest deposit a round accepts, per wallet, summed over the window.
 * Below this a buyer wallet cannot cover its own rent and fees, and spam bots
 * send 1-lamport "dust" to any active address. Both would stop a launch, so
 * they are left out of the round and listed for a manual refund instead.
 */
export const MIN_DEPOSIT_SOL = 0.05;
export const MIN_DEPOSIT_LAMPORTS = 50_000_000;
