import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import { scanDeposits } from "./deposits.ts";

const OPEN = Date.parse("2026-09-13T19:00:00Z");
const CLOSE = Date.parse("2026-09-13T19:15:00Z");
const at = (iso) => Math.floor(Date.parse(iso) / 1000);
const key = () => Keypair.generate().publicKey;

const deposit = key();
const alice = key();
const bob = key();
const carol = key();
const lateUser = key();
const owner = key();
const other = key();

/** A plain SOL transfer as getParsedTransaction returns it. */
function transfer(from, to, lamports, { failed = false } = {}) {
  return {
    meta: { err: failed ? { InstructionError: [0, "x"] } : null, preBalances: [5e9, 0], postBalances: [5e9 - lamports - 5000, lamports] },
    transaction: { signatures: [], message: { accountKeys: [{ pubkey: from, signer: true }, { pubkey: to, signer: false }] } },
  };
}

// Newest first, like getSignaturesForAddress.
const history = [
  { signature: "late", blockTime: at("2026-09-13T19:16:10Z"), tx: transfer(lateUser, deposit, 0.3e9) },
  { signature: "launch-funding", blockTime: at("2026-09-13T19:15:40Z"), tx: transfer(deposit, other, 1e9) },
  { signature: "grace", blockTime: at("2026-09-13T19:15:20Z"), tx: transfer(carol, deposit, 0.2e9) },
  { signature: "edge-close", blockTime: at("2026-09-13T19:15:00Z"), tx: transfer(bob, deposit, 0.1e9) },
  { signature: "failed", blockTime: at("2026-09-13T19:10:00Z"), err: { x: 1 }, tx: transfer(carol, deposit, 9e9, { failed: true }) },
  { signature: "alice-2", blockTime: at("2026-09-13T19:09:00Z"), tx: transfer(alice, deposit, 0.25e9) },
  { signature: "outgoing", blockTime: at("2026-09-13T19:08:00Z"), tx: transfer(deposit, other, 0.01e9) },
  { signature: "used-before", blockTime: at("2026-09-13T19:07:00Z"), tx: transfer(carol, deposit, 4e9) },
  { signature: "owner-sweep", blockTime: at("2026-09-13T19:06:00Z"), tx: transfer(owner, deposit, 2e9) },
  { signature: "bob-1", blockTime: at("2026-09-13T19:05:00Z"), tx: transfer(bob, deposit, 0.5e9) },
  { signature: "alice-1", blockTime: at("2026-09-13T19:00:00Z"), tx: transfer(alice, deposit, 1e9) },
  { signature: "old", blockTime: at("2026-09-13T18:59:59Z"), tx: transfer(carol, deposit, 7e9) },
  { signature: "older", blockTime: at("2026-09-12T10:00:00Z"), tx: transfer(carol, deposit, 8e9) },
];

function fakeConnection() {
  const fetched = [];
  return {
    fetched,
    // Pages of three regardless of the requested limit, to exercise paging.
    async getSignaturesForAddress(_wallet, { before }) {
      const start = before ? history.findIndex((entry) => entry.signature === before) + 1 : 0;
      return history.slice(start, start + 3).map(({ signature, blockTime, err }) => ({ signature, blockTime, err: err ?? null }));
    },
    async getParsedTransaction(signature) {
      fetched.push(signature);
      const entry = history.find((item) => item.signature === signature);
      return { ...entry.tx, transaction: { ...entry.tx.transaction, signatures: [signature] } };
    },
  };
}

const scan = (connection, closesAt = CLOSE) =>
  scanDeposits(connection, deposit, OPEN, closesAt, undefined, new Set(["used-before"]), new Set([owner.toBase58()]), 0);

test("counts only this window's incoming transfers, grouped per wallet", async () => {
  const connection = fakeConnection();
  const result = await scan(connection);

  assert.deepEqual(
    result.deposits.map((d) => [d.wallet, d.lamports, [...d.signatures].sort()]),
    [
      [alice.toBase58(), 1.25e9, ["alice-1", "alice-2"]],
      [bob.toBase58(), 0.6e9, ["bob-1", "edge-close"]],
    ],
  );
  assert.equal(result.totalLamports, 1.85e9);
  assert.equal(result.excluded, 1, "a transaction an earlier round used is skipped");
  assert.equal(result.internalExcluded, 1, "the round's own owner wallet is not a depositor");
  assert.ok(!connection.fetched.includes("old") && !connection.fetched.includes("older"), "history before the open is never read");
  assert.ok(!connection.fetched.includes("failed"), "failed transactions are skipped");
});

test("transfers after the close are reported separately, never counted", async () => {
  const result = await scan(fakeConnection());
  assert.deepEqual(
    result.late.map((d) => [d.wallet, d.lamports]).sort((a, b) => b[1] - a[1]),
    [[lateUser.toBase58(), 0.3e9], [carol.toBase58(), 0.2e9]],
  );
  assert.ok(!result.deposits.some((d) => d.wallet === lateUser.toBase58()));
});

test("the 30 second grace includes a transfer confirmed at the deadline", async () => {
  const result = await scan(fakeConnection(), CLOSE + 30_000);
  assert.ok(result.deposits.some((d) => d.wallet === carol.toBase58() && d.lamports === 0.2e9));
  assert.deepEqual(result.late.map((d) => d.wallet), [lateUser.toBase58()]);
  assert.ok(!result.deposits.some((d) => d.signatures.includes("launch-funding")), "the launch's own transfer is not a deposit");
});

test("a brand-new wallet has nothing to count", async () => {
  const empty = { getSignaturesForAddress: async () => [], getParsedTransaction: async () => { throw Error("no lookups expected"); } };
  const result = await scanDeposits(empty, deposit, OPEN, CLOSE, undefined, new Set(), new Set(), 0);
  assert.deepEqual([result.deposits, result.late, result.totalLamports], [[], [], 0]);
});

test("dust spam and totals under the minimum stay out; small top-ups that add up count", async () => {
  const spammer = key();
  const small = key();
  const toppedUp = key();
  const entries = [
    { signature: "dust", blockTime: at("2026-09-13T19:04:00Z"), tx: transfer(spammer, deposit, 1) },
    { signature: "small", blockTime: at("2026-09-13T19:03:00Z"), tx: transfer(small, deposit, 0.02e9) },
    { signature: "top-2", blockTime: at("2026-09-13T19:02:00Z"), tx: transfer(toppedUp, deposit, 0.03e9) },
    { signature: "top-1", blockTime: at("2026-09-13T19:01:00Z"), tx: transfer(toppedUp, deposit, 0.03e9) },
  ];
  const connection = {
    getSignaturesForAddress: async (_w, { before }) => (before ? [] : entries.map(({ signature, blockTime }) => ({ signature, blockTime, err: null }))),
    getParsedTransaction: async (signature) => {
      const entry = entries.find((item) => item.signature === signature);
      return { ...entry.tx, transaction: { ...entry.tx.transaction, signatures: [signature] } };
    },
  };
  const result = await scanDeposits(connection, deposit, OPEN, CLOSE, undefined, new Set(), new Set(), 0, 50_000_000);
  assert.deepEqual(result.deposits.map((d) => [d.wallet, d.lamports]), [[toppedUp.toBase58(), 0.06e9]]);
  assert.equal(result.totalLamports, 0.06e9);
  assert.deepEqual(
    result.belowMinimum.map((d) => [d.wallet, d.lamports]),
    [[small.toBase58(), 0.02e9], [spammer.toBase58(), 1]],
  );
});
