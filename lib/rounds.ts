import type { Round } from "./types";

/**
 * Single source of truth for round configuration.
 *
 * Nothing here is invented: PREPUMP has not launched, so there are no past
 * rounds, no committed SOL and no participants. When the program is deployed,
 * set `status` to "OPEN" and fill in `opensAt`, `closesAt` and `escrow` — the
 * whole interface follows from that.
 */

/**
 * Platform fee in basis points. `null` until it is decided and published —
 * the interface says "disclosed at launch" rather than guessing a number.
 */
export const PLATFORM_FEE_BPS: number | null = null;
export const NETWORK_FEE_LAMPORTS = 500_000n; // ~0.0005 SOL, Solana base fee

export const UPCOMING_ROUND: Round = {
  id: 1,
  status: "UPCOMING",
  opensAt: null,
  closesAt: null,
  totalCommittedLamports: 0n,
  participants: 0,
};

/** Rounds that have completed. Populated from chain once rounds exist. */
export const PAST_ROUNDS: Round[] = [];

export const roundLabel = (id: number) => `#${String(id).padStart(3, "0")}`;
