import assert from "node:assert/strict";
import { test } from "node:test";
import { proportionalCosts } from "./participant-budget.ts";
import { settleAction } from "./participant-execution.ts";

const deposits = amounts => amounts.map((lamports, i) => ({ wallet: String(i), lamports, signatures: [] }));
test("shared costs follow deposits and conserve every lamport", () => {
  assert.deepEqual(proportionalCosts(deposits([900, 100]), 100), [90, 10]);
  for (let cost = 0; cost < 500; cost++) {
    const split = proportionalCosts(deposits([101, 203, 307]), cost);
    assert.equal(split.reduce((a, b) => a + b, 0), cost);
    assert.ok(split.every(Number.isSafeInteger));
  }
  assert.deepEqual(proportionalCosts(deposits(Array(10).fill(100)), 103), [11, 11, 11, 10, 10, 10, 10, 10, 10, 10]);
});
test("empty, duplicate and underfunded participant sets fail", () => {
  assert.throws(() => proportionalCosts([], 1));
  assert.throws(() => proportionalCosts(deposits([10]), 10));
  assert.throws(() => proportionalCosts(deposits([1.1]), 0));
  assert.throws(() => proportionalCosts([{ wallet: "same", lamports: 10 }, { wallet: "same", lamports: 20 }], 1));
});
test("confirmed transaction is reconciled without broadcasting again", async () => {
  let saved = 0;
  const action = { signature: "known", wire: "dGVzdA==" };
  await settleAction({
    getSignatureStatuses: async () => ({ value: [{ confirmationStatus: "confirmed", err: null }] }),
    sendRawTransaction: () => { throw Error("Must not send again"); },
  }, action, () => saved++);
  assert.equal(action.confirmed, true);
  assert.equal(saved, 1);
});
test("ambiguous transport failure preserves the exact transaction on retry", async () => {
  const action = { signature: "known", wire: "dGVzdA==" };
  const wires = [];
  const connection = {
    getSignatureStatuses: async () => ({ value: [null] }),
    sendRawTransaction: async wire => { wires.push(wire.toString("base64")); throw Error("timeout"); },
  };
  await assert.rejects(settleAction(connection, action, () => {}), /timeout/);
  await assert.rejects(settleAction(connection, action, () => {}), /timeout/);
  assert.deepEqual(wires, [action.wire, action.wire]);
  assert.equal(action.confirmed, undefined);
  assert.equal(action.signature, "known");
});
test("on-chain error never triggers a fresh transaction", async () => {
  await assert.rejects(settleAction({
    getSignatureStatuses: async () => ({ value: [{ err: { InstructionError: [0, "failed"] } }] }),
    sendRawTransaction: () => { throw Error("Must not send"); },
  }, { signature: "failed", wire: "dGVzdA==" }, () => {}), /Inspect before retrying/);
});
test("first send confirms and marks the persisted action", async () => {
  let reads = 0;
  let saves = 0;
  const sent = [];
  const action = { signature: "known", wire: "dGVzdA==" };
  await settleAction({
    getSignatureStatuses: async () => ({ value: [reads++ === 0 ? null : { confirmationStatus: "confirmed", err: null }] }),
    sendRawTransaction: async wire => { sent.push(wire.toString("base64")); return "known"; },
  }, action, () => saves++);
  assert.deepEqual(sent, ["dGVzdA=="]);
  assert.equal(saves, 1);
  assert.equal(action.confirmed, true);
});
