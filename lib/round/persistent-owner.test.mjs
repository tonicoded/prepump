import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Connection, Keypair } from "@solana/web3.js";
import { readRoundConfig } from "./config.ts";
import { saveRound } from "./store.ts";
import { runParticipantRound } from "./participant-execution.ts";

// The balance check runs before rent lookups; reaching one proves it passed.
const PAST_OWNER_CHECK = "past the owner balance check";

async function attempt(persistentOwner) {
  const directory = mkdtempSync(path.join(tmpdir(), "prepump-owner-"));
  const previous = process.env.ROUND_DATA_DIR;
  process.env.ROUND_DATA_DIR = directory;
  const owner = Keypair.generate();
  const deposit = Keypair.generate();
  const record = {
    roundId: 7, opensAt: new Date(1000).toISOString(), closesAt: new Date(2000).toISOString(),
    depositWallet: deposit.publicKey.toBase58(), totalLamports: 100_000_000, scannedAt: "test",
    deposits: [{ wallet: Keypair.generate().publicKey.toBase58(), lamports: 100_000_000, signatures: ["fixture"] }],
    ownerWallet: { address: owner.publicKey.toBase58(), keyFile: "LAUNCH_WALLET_SECRET_KEY", createdAt: "test" },
  };
  const config = readRoundConfig({ DEV_CUT_PERCENT: "0", SOLANA_RPC_URL: "http://127.0.0.1:1" });
  try {
    // The main wallet always holds SOL of its own.
    mock.method(Connection.prototype, "getBalance", async () => 5_000_000_000);
    mock.method(Connection.prototype, "getMinimumBalanceForRentExemption", async () => { throw Error(PAST_OWNER_CHECK); });
    saveRound(record);
    return await runParticipantRound(config, record, deposit, owner, async () => {
      throw Error("generation must not be reached");
    }, { persistentOwner });
  } finally {
    mock.restoreAll();
    if (previous === undefined) delete process.env.ROUND_DATA_DIR;
    else process.env.ROUND_DATA_DIR = previous;
    rmSync(directory, { recursive: true, force: true });
  }
}

test("the main wallet may create a coin while holding its own SOL", async () => {
  await assert.rejects(attempt(true), new RegExp(PAST_OWNER_CHECK));
});

test("a fresh per-round owner with unexpected SOL is still refused", async () => {
  await assert.rejects(attempt(false), /Unrecorded funds in the owner wallet/);
});
