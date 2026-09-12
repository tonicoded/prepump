import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Deposit = {
  wallet: string;
  lamports: number;
  signatures: string[];
};

export type Payout = {
  wallet: string;
  tokens: string;
  signature?: string;
  error?: string;
};

export type RoundRecord = {
  roundId: number;
  opensAt: string;
  closesAt: string;
  depositWallet: string;

  scannedAt?: string;
  deposits: Deposit[];
  totalLamports: number;

  token?: {
    name: string;
    ticker: string;
    tagline: string;
    description: string;
  };

  launch?: {
    mint: string;
    signature: string;
    metadataUri: string;
    imageUri: string;
    buySol: number;
    launchedAt: string;
  };

  distribution?: {
    startedAt: string;
    completedAt?: string;
    decimals: number;
    totalTokens: string;
    distributableTokens: string;
    payouts: Payout[];
  };
};

const DIR = path.join(process.cwd(), ".round");

export function roundFile(roundId: number) {
  return path.join(DIR, `round-${String(roundId).padStart(3, "0")}.json`);
}

export function loadRound(roundId: number): RoundRecord | null {
  try {
    return JSON.parse(readFileSync(roundFile(roundId), "utf8")) as RoundRecord;
  } catch {
    return null;
  }
}

export function saveRound(record: RoundRecord) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(roundFile(record.roundId), JSON.stringify(record, null, 2));
  return record;
}
