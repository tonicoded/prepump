import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import bs58 from "bs58";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction,
  createCloseAccountInstruction, getAssociatedTokenAddress, getMint,
} from "@solana/spl-token";
import type { RoundConfig } from "./config.ts";
import { roundDataDir, loadRound, saveRound, type RoundRecord } from "./store.ts";
import { proportionalCosts } from "./participant-budget.ts";
import { netBuyLamports } from "./budget.ts";
import { preparePumpToken, confirmSignature, type TokenDraft } from "./pumpfun.ts";
import { readTokenBalance, resolveTokenProgram } from "./distribute.ts";

type SignedAction = { signature: string; wire: string; confirmed?: boolean };
type Buyer = {
  recipient: string; address: string; depositLamports: number;
  sharedCostLamports: number; fundingLamports: number; buyLamports: number;
  tokens?: string; error?: string; funding?: SignedAction; buy?: SignedAction;
  payout?: SignedAction; refund?: SignedAction;
};
export type ParticipantExecution = {
  version: 1; ownerFundingLamports: number; sharedCostLamports: number;
  buyerReserveLamports: number; slippage: number; priorityFee: number;
  buyers: Buyer[]; ownerFunding?: SignedAction;
  draft?: TokenDraft & { tagline: string };
  creation?: { action: SignedAction; result: NonNullable<RoundRecord["launch"]> };
  completedAt?: string;
};

function buyerKey(roundId: number, recipient: string, expected?: string) {
  new PublicKey(recipient);
  const dir = path.join(roundDataDir(), "buyers");
  const file = path.join(dir, `round-${roundId}-${recipient}.json`);
  if (existsSync(file)) {
    // Corrupt/missing keys must never silently generate replacement wallets.
    const stored = JSON.parse(readFileSync(file, "utf8"));
    const key = Keypair.fromSecretKey(bs58.decode(stored.secretKey));
    if (stored.address !== key.publicKey.toBase58() || (expected && stored.address !== expected)) {
      throw new Error("Buyer key does not match its saved address.");
    }
    return key;
  }
  if (expected) throw new Error(`Buyer key missing: ${file}`);
  const key = Keypair.generate();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({
    address: key.publicKey.toBase58(), secretKey: bs58.encode(key.secretKey),
  }), { flag: "wx", mode: 0o600 });
  return key;
}

function signedAction(tx: Transaction | VersionedTransaction): SignedAction {
  const signature = tx instanceof Transaction ? tx.signature : tx.signatures[0];
  if (!signature) throw new Error("Unsigned transaction.");
  return { signature: bs58.encode(signature), wire: Buffer.from(tx.serialize()).toString("base64") };
}

/** Replays only the SAME signed bytes. Unknown/expired results never create a new buy. */
export async function settleAction(connection: Connection, action: SignedAction, persist: () => void) {
  if (action.confirmed) return;
  const status = (await connection.getSignatureStatuses(
    [action.signature], { searchTransactionHistory: true },
  )).value[0];
  if (status?.err) throw new Error(`Transaction failed: ${action.signature}. Inspect before retrying with a new transaction.`);
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
    action.confirmed = true; persist(); return;
  }
  if (!status) {
    // Transport errors may mean it was sent: keep the signed action for reconciliation.
    await connection.sendRawTransaction(Buffer.from(action.wire, "base64"), {
      skipPreflight: false, maxRetries: 3,
    });
  }
  await confirmSignature(connection, action.signature);
  action.confirmed = true;
  persist();
}

async function signTransfer(connection: Connection, from: Keypair, to: PublicKey, lamports: number) {
  const recent = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: from.publicKey, ...recent }).add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports }),
  );
  tx.sign(from);
  return signedAction(tx);
}

export async function runParticipantRound(
  config: RoundConfig, record: RoundRecord, depositWallet: Keypair, owner: Keypair,
  generate: () => Promise<TokenDraft & { tagline: string }>,
) {
  mkdirSync(roundDataDir(), { recursive: true });
  const lock = path.join(roundDataDir(), `round-${record.roundId}.execution.lock`);
  try { writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 }); }
  catch { throw new Error(`Round execution is locked: ${lock}. Check for another running command; never remove a live lock.`); }
  const release = () => { if (existsSync(lock)) unlinkSync(lock); };
  process.once("exit", release);
  try {
    const saved = loadRound(record.roundId);
    if (!saved) throw new Error("Round record is missing or unreadable.");
    Object.assign(record, saved);
    if (record.ownerWallet?.address !== owner.publicKey.toBase58()) {
      throw new Error("Owner changed before execution lock was acquired.");
    }
    await execute(config, record, depositWallet, owner, generate);
  } finally { process.removeListener("exit", release); release(); }
  return record;
}

async function execute(
  config: RoundConfig, record: RoundRecord, depositWallet: Keypair, owner: Keypair,
  generate: () => Promise<TokenDraft & { tagline: string }>,
) {
  const connection = new Connection(config.rpcUrl, "confirmed");
  const persist = () => { saveRound(record); };
  if (!record.participantExecution) {
    if (record.launch || record.ownerWallet?.fundingSignature) {
      throw new Error("Cannot convert a started legacy round into individual buys.");
    }
    if (record.deposits.length === 0) throw new Error("No participants.");
    if (await connection.getBalance(owner.publicKey) !== 0) {
      throw new Error("Unrecorded funds in the owner wallet. Reconcile the existing launch/funding before creating an individual plan.");
    }
    if (record.totalLamports !== record.deposits.reduce((sum, d) => sum + d.lamports, 0)) {
      throw new Error("Deposit totals do not match.");
    }
    if (config.devCutPercent !== 0) {
      throw new Error("Individual buys require DEV_CUT_PERCENT=0; each user receives their own purchased tokens.");
    }
    if (!Number.isFinite(config.slippage) || config.slippage <= 0 || config.slippage > 50) {
      throw new Error("Individual buys require explicit slippage above 0 and at most 50 percent.");
    }
    const floor = await connection.getMinimumBalanceForRentExemption(0);
    // Conservative Token-2022 account reserve (actual mint extensions are known only after creation).
    const ataRent = Math.max(await connection.getMinimumBalanceForRentExemption(512), Math.ceil(config.payoutRentSol * 1e9));
    const ownerFundingLamports = Math.ceil((config.createCostSol + config.priorityFee + config.reserveSol + config.walletFloorSol) * 1e9) + 10_000;
    const sharedCostLamports = ownerFundingLamports + floor + (record.deposits.length + 1) * 10_000;
    const costs = proportionalCosts(record.deposits, sharedCostLamports);
    const buyerReserveLamports = ataRent * 2 + floor + Math.ceil(config.priorityFee * 1e9) + 30_000;
    // Reserve the maximum configured slippage too; unspent buyer SOL is returned, not kept.
    const budgets = record.deposits.map((deposit, i) => {
      const fundingLamports = deposit.lamports - costs[i];
      const buyLamports = Math.floor(netBuyLamports(
        fundingLamports, buyerReserveLamports,
        config.buyFeePercent + config.slippage + config.buyFeePercent * config.slippage / 100,
      ) / 1000) * 1000;
      if (buyLamports <= 0) throw new Error(`Deposit from ${deposit.wallet} cannot cover its costs. No wallets have been funded.`);
      return { deposit, fundingLamports, buyLamports, cost: costs[i] };
    });
    if (await connection.getBalance(depositWallet.publicKey) < record.totalLamports) {
      throw new Error("Deposit wallet balance is below the frozen deposit total.");
    }
    record.participantExecution = {
      version: 1, ownerFundingLamports, sharedCostLamports, buyerReserveLamports,
      slippage: config.slippage, priorityFee: config.priorityFee,
      buyers: budgets.map(({ deposit, fundingLamports, buyLamports, cost }) => ({
        recipient: deposit.wallet,
        address: buyerKey(record.roundId, deposit.wallet).publicKey.toBase58(),
        depositLamports: deposit.lamports, sharedCostLamports: cost, fundingLamports, buyLamports,
      })),
    };
    persist();
  }
  const plan = record.participantExecution;
  const tradeConfig = { ...config, slippage: plan.slippage, priorityFee: plan.priorityFee };
  console.log(`\nIndividual execution · ${plan.buyers.length} actual participants · creator buy 0 SOL`);
  console.log(`Slippage limit ${plan.slippage}% · shared cost reserve ${plan.sharedCostLamports / 1e9} SOL`);
  console.log("Buyer wallets and transaction checkpoints stay in .round; back up this directory.");
  for (const buyer of plan.buyers) {
    buyerKey(record.roundId, buyer.recipient, buyer.address); // verify ALL keys before sending
    console.log(`${buyer.recipient} → ${buyer.address} · buy ${buyer.buyLamports / 1e9} SOL`);
  }
  for (const buyer of plan.buyers) {
    if (!buyer.funding) {
      buyer.funding = await signTransfer(connection, depositWallet, new PublicKey(buyer.address), buyer.fundingLamports);
      persist();
    }
    await settleAction(connection, buyer.funding, persist);
  }
  if (!plan.ownerFunding) {
    plan.ownerFunding = await signTransfer(connection, depositWallet, owner.publicKey, plan.ownerFundingLamports);
    persist();
  }
  await settleAction(connection, plan.ownerFunding, persist);
  if (!plan.draft) { plan.draft = await generate(); persist(); }
  if (!plan.creation) {
    const prepared = await preparePumpToken(tradeConfig, plan.draft, 0, owner);
    plan.creation = {
      action: signedAction(prepared.transaction),
      result: { ...prepared.result, launchedAt: new Date().toISOString() },
    };
    persist(); // mint, metadata, signature and signed bytes exist BEFORE broadcast
  }
  await settleAction(connection, plan.creation.action, persist);
  record.launch = plan.creation.result;
  record.token = { name: plan.draft.name, ticker: plan.draft.symbol, description: plan.draft.description, tagline: plan.draft.tagline };
  persist();
  console.log(`Live: https://pump.fun/coin/${record.launch.mint}`);
  const mint = new PublicKey(record.launch.mint);
  // Submit every participant concurrently; no intentional artificial spacing/volume.
  await Promise.all(plan.buyers.map(async buyer => {
    try {
      if (!buyer.buy) {
        const response = await fetch(config.pumpPortalUrl, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            publicKey: buyer.address, action: "buy", mint: mint.toBase58(),
            amount: buyer.buyLamports / 1e9, denominatedInSol: "true",
            slippage: plan.slippage, priorityFee: plan.priorityFee, pool: "pump",
          }),
        });
        if (!response.ok) throw new Error(`Buy preparation failed (${response.status})`);
        const tx = VersionedTransaction.deserialize(new Uint8Array(await response.arrayBuffer()));
        if (tx.message.header.numRequiredSignatures !== 1 || tx.message.staticAccountKeys[0].toBase58() !== buyer.address) {
          throw new Error("Unexpected buy transaction signer.");
        }
        tx.sign([buyerKey(record.roundId, buyer.recipient, buyer.address)]);
        buyer.buy = signedAction(tx); persist();
      }
      await settleAction(connection, buyer.buy, persist);
      delete buyer.error;
    } catch (error) { buyer.error = error instanceof Error ? error.message : "Buy failed"; }
    persist();
  }));
  const program = await resolveTokenProgram(connection, mint);
  const decimals = (await getMint(connection, mint, "confirmed", program)).decimals;
  for (const buyer of plan.buyers) {
    if (!buyer.buy?.confirmed) continue;
    try {
      const key = buyerKey(record.roundId, buyer.recipient, buyer.address);
      if (!buyer.payout) {
        const { ata: source, amount } = await readTokenBalance(connection, key.publicKey, mint, program);
        if (amount <= 0n) throw new Error("Confirmed buy has no transferable token balance; inspect before retry.");
        const destination = await getAssociatedTokenAddress(mint, new PublicKey(buyer.recipient), false, program);
        const recent = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({ feePayer: key.publicKey, ...recent }).add(
          createAssociatedTokenAccountIdempotentInstruction(key.publicKey, destination, new PublicKey(buyer.recipient), mint, program),
          createTransferCheckedInstruction(source, mint, destination, key.publicKey, amount, decimals, [], program),
          createCloseAccountInstruction(source, key.publicKey, key.publicKey, [], program),
        );
        tx.sign(key);
        buyer.tokens = amount.toString();
        buyer.payout = signedAction(tx); persist();
      }
      await settleAction(connection, buyer.payout, persist);
      if (!buyer.refund) {
        const balance = await connection.getBalance(key.publicKey);
        const recent = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({ feePayer: key.publicKey, ...recent });
        tx.add(SystemProgram.transfer({ fromPubkey: key.publicKey, toPubkey: new PublicKey(buyer.recipient), lamports: 1 }));
        const fee = (await connection.getFeeForMessage(tx.compileMessage(), "confirmed")).value;
        if (fee === null || balance <= fee) throw new Error("Cannot refund remaining buyer SOL; inspect wallet.");
        tx.instructions = [SystemProgram.transfer({ fromPubkey: key.publicKey, toPubkey: new PublicKey(buyer.recipient), lamports: balance - fee })];
        tx.sign(key);
        buyer.refund = signedAction(tx); persist();
      }
      await settleAction(connection, buyer.refund, persist);
      delete buyer.error;
    } catch (error) { buyer.error = error instanceof Error ? error.message : "Payout failed"; }
    persist();
  }
  const failed = plan.buyers.filter(b => !b.refund?.confirmed);
  if (failed.length) {
    for (const buyer of failed) console.error(`${buyer.recipient}: ${buyer.error}`);
    throw new Error(`${failed.length} participant(s) unfinished. Resume this same round; do not rescan or create replacement buys.`);
  }
  plan.completedAt = new Date().toISOString();
  record.distribution = {
    startedAt: record.distribution?.startedAt ?? plan.completedAt, completedAt: plan.completedAt, decimals,
    totalTokens: plan.buyers.reduce((sum, b) => sum + BigInt(b.tokens!), 0n).toString(),
    distributableTokens: plan.buyers.reduce((sum, b) => sum + BigInt(b.tokens!), 0n).toString(),
    payouts: plan.buyers.map(b => ({ wallet: b.recipient, tokens: b.tokens!, signature: b.payout!.signature })),
  };
  persist();
  console.log("All participant tokens and unused buyer SOL returned. Shared creator/deposit reserves remain recorded in the round.");
}
