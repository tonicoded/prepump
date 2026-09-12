export type RoundStatus =
  | "UPCOMING"
  | "OPEN"
  | "LOCKED"
  | "LAUNCHING"
  | "CLAIMABLE"
  | "COMPLETE"
  | "REFUND";

export type Round = {
  id: number;
  /** null until the round has been scheduled. */
  opensAt: number | null;
  closesAt: number | null;
  status: RoundStatus;

  totalCommittedLamports: bigint;
  participants: number;

  /** Escrow PDA holding the round's committed SOL, once deployed. */
  escrow?: string;

  tokenMint?: string;
  tokenName?: string;
  tokenTicker?: string;
  tokenImage?: string;
  tokenDescription?: string;
  tokenTagline?: string;

  /** Total token supply earmarked for participant distribution. */
  distributableSupply?: bigint;

  launchedAt?: number;
  launchTx?: string;
  /** Published before close, revealed after. Commit/reveal integrity. */
  commitHash?: string;
  revealSeed?: string;
};

export type Commitment = {
  wallet: string;
  roundId: number;
  committedLamports: bigint;
  share: number;
  estimatedTokens?: bigint;
  claimedTokens?: bigint;
  claimTx?: string;
  commitTx?: string;
};

export type WalletId = "phantom" | "solflare" | "backpack";

export type WalletMeta = {
  id: WalletId;
  name: string;
  /** Brand colour, used as the only mark in the wallet list. */
  tint: string;
  /** Download page when the extension is absent. */
  url: string;
  detected: boolean;
};

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type TxPhase =
  | "idle"
  | "awaiting-signature"
  | "submitted"
  | "confirmed"
  | "failed";

export type TxState = {
  phase: TxPhase;
  signature?: string;
  error?: string;
  /** Human summary of what is being signed, shown before the request. */
  intent?: string;
};
