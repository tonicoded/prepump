import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { MintLayout, AccountLayout, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { readRoundConfig } from "./config.ts";
import { saveRound, loadRound } from "./store.ts";
import { runParticipantRound } from "./participant-execution.ts";

test("fund all buyers before generation; create before concurrent buys; resume without duplicate sends", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "prepump-participant-flow-"));
  const previous = process.env.ROUND_DATA_DIR;
  process.env.ROUND_DATA_DIR = directory;
  const owner = Keypair.generate();
  const deposit = Keypair.generate();
  const events = [];
  const confirmed = new Set();
  const blockhash = Keypair.generate().publicKey.toBase58();
  let generated = 0;
  let broadcasts = 0;
  const config = readRoundConfig({
    PINATA_JWT: "mock-only", DEV_CUT_PERCENT: "0",
    SOLANA_RPC_URL: "http://127.0.0.1:1",
  });
  const record = {
    roundId: 999, opensAt: new Date(1000).toISOString(), closesAt: new Date(2000).toISOString(),
    depositWallet: deposit.publicKey.toBase58(), totalLamports: 200_000_000, scannedAt: "test",
    deposits: [1, 2].map(() => ({ wallet: Keypair.generate().publicKey.toBase58(), lamports: 100_000_000, signatures: ["fixture"] })),
    ownerWallet: { address: owner.publicKey.toBase58(), keyFile: "fixture", createdAt: "test" },
  };
  try {
    mock.method(Connection.prototype, "getBalance", async key => key.equals(owner.publicKey) ? 0 : 200_000_000);
    // preparePumpToken checks the creator balance after funding.
    mock.method(Connection.prototype, "getMinimumBalanceForRentExemption", async () => 1_000_000);
    mock.method(Connection.prototype, "getLatestBlockhash", async () => ({ blockhash, lastValidBlockHeight: 1000 }));
    mock.method(Connection.prototype, "getSignatureStatuses", async signatures => ({
      value: signatures.map(sig => confirmed.has(sig) ? { confirmationStatus: "confirmed", err: null } : null),
    }));
    mock.method(Connection.prototype, "sendRawTransaction", async bytes => {
      const tx = VersionedTransaction.deserialize(bytes);
      const signature = bs58.encode(tx.signatures[0]);
      assert.ok(!confirmed.has(signature), "must not rebroadcast a confirmed action");
      confirmed.add(signature);
      broadcasts++;
      events.push("send");
      return signature;
    });
    // Stop just before SPL settlement: this test isolates order and replay safety.
    mock.method(Connection.prototype, "getAccountInfo", async () => { throw Error("fixture settlement boundary"); });
    mock.method(globalThis, "fetch", async (url, options) => {
      if (String(url).includes("pinata.cloud")) {
        return Response.json({ data: { cid: "fixture-cid" } });
      }
      assert.equal(url, config.pumpPortalUrl, "unexpected outbound endpoint");
      const body = JSON.parse(options.body);
      events.push(body.action);
      const payer = new PublicKey(body.publicKey);
      const mint = new PublicKey(body.mint);
      if (body.action === "create") assert.equal(body.amount, 0);
      const instruction = body.action === "create"
        ? SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: mint, lamports: 1, space: 0, programId: SystemProgram.programId })
        : SystemProgram.transfer({ fromPubkey: payer, toPubkey: mint, lamports: 1 });
      const tx = new VersionedTransaction(new TransactionMessage({
        payerKey: payer, recentBlockhash: blockhash, instructions: [instruction],
      }).compileToV0Message());
      return new Response(tx.serialize());
    });
    saveRound(record);
    const generate = async () => {
      generated++;
      events.push("generate");
      assert.equal(broadcasts, 3, "two buyers plus creator funded first");
      mock.method(Connection.prototype, "getBalance", async () => 200_000_000);
      return { name: "Fixture", symbol: "FIX", description: "Mock flow only.", tagline: "Fixture." };
    };
    await assert.rejects(runParticipantRound(config, record, deposit, owner, generate), /fixture settlement boundary/);
    assert.equal(events.filter(e => e === "buy").length, 2);
    assert.ok(events.indexOf("generate") < events.indexOf("create"));
    assert.ok(events.indexOf("create") < events.indexOf("buy"));
    assert.equal(broadcasts, 6);
    const saved = loadRound(999);
    assert.ok(saved.participantExecution.buyers.every(b => b.buy.confirmed && b.funding.confirmed));
    assert.equal(saved.launch.buySol, 0);
    await assert.rejects(runParticipantRound(config, saved, deposit, owner, generate), /fixture settlement boundary/);
    assert.equal(generated, 1);
    assert.equal(broadcasts, 6, "resume must not fund, create or buy twice");

    const mint = new PublicKey(saved.launch.mint);
    const accounts = new Map();
    const mintData = Buffer.alloc(MintLayout.span);
    MintLayout.encode({
      mintAuthorityOption: 0, mintAuthority: owner.publicKey, supply: 999n,
      decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: owner.publicKey,
    }, mintData);
    accounts.set(mint.toBase58(), mintData);
    for (const [index, buyer] of saved.participantExecution.buyers.entries()) {
      const key = new PublicKey(buyer.address);
      const ata = await getAssociatedTokenAddress(mint, key, false, TOKEN_2022_PROGRAM_ID);
      const data = Buffer.alloc(AccountLayout.span);
      AccountLayout.encode({
        mint, owner: key, amount: BigInt(100 + index), delegateOption: 0, delegate: owner.publicKey,
        state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n,
        closeAuthorityOption: 0, closeAuthority: owner.publicKey,
      }, data);
      accounts.set(ata.toBase58(), data);
    }
    mock.method(Connection.prototype, "getAccountInfo", async key => {
      const data = accounts.get(key.toBase58());
      assert.ok(data, "unexpected account read");
      return { data, owner: TOKEN_2022_PROGRAM_ID, lamports: 1_000_000, executable: false };
    });
    mock.method(Connection.prototype, "getFeeForMessage", async () => ({ value: 5000 }));
    await runParticipantRound(config, saved, deposit, owner, generate);
    assert.equal(broadcasts, 10, "two payouts plus two SOL refunds");
    const complete = loadRound(999);
    assert.ok(complete.participantExecution.completedAt);
    assert.deepEqual(complete.distribution.payouts.map(p => p.tokens), ["100", "101"]);
    assert.deepEqual(complete.distribution.payouts.map(p => p.wallet), record.deposits.map(d => d.wallet));
    await runParticipantRound(config, complete, deposit, owner, generate);
    assert.equal(broadcasts, 10, "completed payouts and refunds must not repeat");
  } finally {
    mock.restoreAll();
    if (previous === undefined) delete process.env.ROUND_DATA_DIR;
    else process.env.ROUND_DATA_DIR = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
