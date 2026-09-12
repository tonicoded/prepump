import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

  ownerWallet?: {
    address: string;
    keyFile: string;
    createdAt: string;
    fundingSignature?: string;
    fundedLamports?: number;
  };

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

export function findRoundByMint(mint: string): RoundRecord | null {
  try {
    for (const name of readdirSync(DIR)) {
      if (!/^round-\d+\.json$/.test(name)) continue;
      try {
        const record = JSON.parse(
          readFileSync(path.join(DIR, name), "utf8"),
        ) as RoundRecord;
        if (record.launch?.mint === mint) return record;
      } catch {
        // Ignore a damaged unrelated round record.
      }
    }
  } catch {
    // No rounds exist yet.
  }
  return null;
}

/**
 * Deposits are single-use. Rolling scan windows can overlap, so collect every
 * transaction signature that an earlier round has already claimed.
 */
export function loadUsedDepositSignatures(excludeRoundId: number) {
  const signatures = new Set<string>();

  try {
    for (const name of readdirSync(DIR)) {
      if (!/^round-\d+\.json$/.test(name)) continue;

      try {
        const record = JSON.parse(
          readFileSync(path.join(DIR, name), "utf8"),
        ) as RoundRecord;
        if (record.roundId === excludeRoundId) continue;

        for (const deposit of record.deposits ?? []) {
          for (const signature of deposit.signatures ?? []) {
            signatures.add(signature);
          }
        }
      } catch {
        // A damaged unrelated round file must not block the current round.
      }
    }
  } catch {
    // The directory does not exist before the first round.
  }

  return signatures;
}

export function saveRound(record: RoundRecord) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(roundFile(record.roundId), JSON.stringify(record, null, 2));
  return record;
}
