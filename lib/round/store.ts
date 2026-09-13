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

/**
 * Base folder for round data. ROUND_DATA_DIR points the tools at another
 * season, for example an archived set of test rounds.
 */
export function roundDataDir(configured = process.env.ROUND_DATA_DIR?.trim()) {
  return configured
    ? path.resolve(process.cwd(), configured)
    : path.join(process.cwd(), ".round");
}

export function roundFile(roundId: number, dataDir = roundDataDir()) {
  return path.join(dataDir, `round-${String(roundId).padStart(3, "0")}.json`);
}

export function loadRound(roundId: number, dataDir?: string): RoundRecord | null {
  try {
    return JSON.parse(readFileSync(roundFile(roundId, dataDir), "utf8")) as RoundRecord;
  } catch {
    return null;
  }
}

export function listRounds(): RoundRecord[] {
  const records: RoundRecord[] = [];
  try {
    for (const name of readdirSync(roundDataDir())) {
      if (!/^round-\d+\.json$/.test(name)) continue;
      try {
        records.push(
          JSON.parse(readFileSync(path.join(roundDataDir(), name), "utf8")) as RoundRecord,
        );
      } catch {
        // Ignore a damaged record; commands still work with every healthy one.
      }
    }
  } catch {
    // The directory does not exist before the first round.
  }
  return records.sort((a, b) => a.roundId - b.roundId);
}

/** Keep working on the highest unlaunched record, otherwise advance once. */
export function nextRoundId(minimum = 1) {
  const latest = listRounds().filter((record) => record.roundId >= minimum).at(-1);
  if (!latest) return minimum;
  return latest.launch ? latest.roundId + 1 : latest.roundId;
}

export function latestLaunchedRound() {
  return listRounds().filter((record) => record.launch).at(-1) ?? null;
}

export function latestUndistributedRound() {
  return (
    listRounds()
      .filter(
        (record) => record.launch && !record.distribution?.completedAt,
      )
      .at(-1) ?? null
  );
}

export function findRoundByMint(mint: string): RoundRecord | null {
  return listRounds().find((record) => record.launch?.mint === mint) ?? null;
}

/**
 * Deposits are single-use. Rolling scan windows can overlap, so collect every
 * transaction signature that an earlier round has already claimed.
 */
export function loadUsedDepositSignatures(excludeRoundId: number) {
  const signatures = new Set<string>();

  try {
    for (const name of readdirSync(roundDataDir())) {
      if (!/^round-\d+\.json$/.test(name)) continue;

      try {
        const record = JSON.parse(
          readFileSync(path.join(roundDataDir(), name), "utf8"),
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
  mkdirSync(roundDataDir(), { recursive: true });
  writeFileSync(roundFile(record.roundId), JSON.stringify(record, null, 2));
  return record;
}
