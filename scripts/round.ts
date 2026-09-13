/**
 * PREPUMP round operator.
 *
 *   npm run round status        what is configured and what the wallet holds
 *   npm run round scan          read deposits for the round window
 *   npm run round launch        generate the meme and create it on pump.fun
 *   npm run round distribute    send every depositor their share
 *   npm run round go            launch, then distribute
 *   npm run round new           create this round's fresh deposit wallet
 *
 * Run it yourself when the countdown reaches zero. Nothing here is scheduled.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { readRoundConfig } from "../lib/round/config.ts";
import {
  loadRound,
  findRoundByMint,
  latestLaunchedRound,
  latestUndistributedRound,
  listRounds,
  loadUsedDepositSignatures,
  nextRoundId,
  saveRound,
  roundFile,
  roundDataDir,
  type Payout,
  type RoundRecord,
} from "../lib/round/store.ts";
import {
  loadOwnerWallet,
  ownerSecretBase58,
  ownerWalletRelativeFile,
} from "../lib/round/owner-wallet.ts";
import { scanDeposits } from "../lib/round/deposits.ts";
import { MIN_DEPOSIT_LAMPORTS, MIN_DEPOSIT_SOL } from "../lib/round/limits.ts";
import {
  depositSecretBase58,
  depositWalletRelativeFile,
  loadDepositWallet,
  loadOrCreateDepositWallet,
} from "../lib/round/deposit-wallet.ts";
import { generateMeme } from "../lib/round/meme.ts";
import { normalizeMemeMode } from "../lib/round/meme-modes.ts";
import { netBuyLamports } from "../lib/round/budget.ts";
import { createPumpToken, parseWallet } from "../lib/round/pumpfun.ts";
import { runParticipantRound } from "../lib/round/participant-execution.ts";
import {
  allocate,
  readTokenBalance,
  resolveTokenProgram,
  sendPayouts,
} from "../lib/round/distribute.ts";
import {
  allocateRewards,
  claimableLamports,
  collectCreatorFees,
  creatorVault,
  prepareCreatorFeeClaim,
  sendRewards,
  snapshotHolders,
  type RewardPayout,
} from "../lib/round/rewards.ts";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* fall back to the ambient environment */
}

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

const args = process.argv.slice(2);
const command = args[0] ?? "status";
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
};

/** `--data .round/archive/test-2026-09` runs a command against an archived season. */
const dataDir = option("data");
if (dataDir) process.env.ROUND_DATA_DIR = dataDir;
if (flag("dev")) {
  if (dataDir || !process.env.DEV_ROUND_DATA_DIR || !process.env.DEV_ROUND_CLOSES_AT ||
      !process.env.DEV_DEPOSIT_ADDRESS || !process.env.DEV_ROUND_ID) {
    die("--dev requires DEV_ROUND_DATA_DIR, DEV_ROUND_ID, DEV_ROUND_CLOSES_AT and DEV_DEPOSIT_ADDRESS; do not combine it with --data.");
  }
  process.env.ROUND_DATA_DIR = process.env.DEV_ROUND_DATA_DIR;
  process.env.ROUND_ID = process.env.DEV_ROUND_ID;
  process.env.ROUND_OPENS_AT = process.env.DEV_ROUND_OPENS_AT;
  process.env.ROUND_CLOSES_AT = process.env.DEV_ROUND_CLOSES_AT;
  process.env.NEXT_PUBLIC_DEPOSIT_ADDRESS = process.env.DEV_DEPOSIT_ADDRESS;
}

const config = readRoundConfig();
const requestedRound = Number(option("round"));
if (Number.isInteger(requestedRound) && requestedRound > 0) {
  config.roundId = requestedRound;
} else if (command === "distribute") {
  config.roundId =
    (latestUndistributedRound() ?? latestLaunchedRound())?.roundId ??
    nextRoundId(config.roundId);
} else if (command === "rewards" || command === "owner") {
  config.roundId = latestLaunchedRound()?.roundId ?? nextRoundId(config.roundId);
} else {
  config.roundId = nextRoundId(config.roundId);
}

/** `--last 90` scans the past 90 minutes instead of the configured window. */
const lastMinutes = Number(option("last"));
const after = option("after");
if (after && Number.isFinite(lastMinutes) && lastMinutes > 0) {
  die("Use either --after or --last, not both.");
}
if (after) {
  const opensAt = Date.parse(after);
  if (!Number.isFinite(opensAt)) {
    die("--after must be an ISO timestamp, for example 2026-09-12T18:15:00Z.");
  }
  config.opensAt = opensAt;
  config.closesAt = Date.now();
}
if (Number.isFinite(lastMinutes) && lastMinutes > 0) {
  config.closesAt = Date.now();
  config.opensAt = config.closesAt - lastMinutes * 60_000;
}

const connection = new Connection(config.rpcUrl, "confirmed");

const sol = (lamports: number) => (lamports / 1e9).toFixed(6);
const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const short = (value: string) => `${value.slice(0, 4)}…${value.slice(-4)}`;
const stamp = (ms: number) =>
  ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "not set";

const FUNDING_TX_FEE_LAMPORTS = 10_000;
/**
 * A wallet prompt confirmed just before the deadline can land in a block a
 * few seconds after it. Launching waits this long past the close, and the
 * scan counts those transfers too.
 */
const CLOSE_GRACE_MS = 30_000;


function die(message: string): never {
  console.error(`\n${C.red("✖")} ${message || "Unknown error"}\n`);
  process.exit(1);
}

function requireWindow() {
  if (!config.opensAt || !config.closesAt) {
    die(
      "No round window. Set ROUND_OPENS_AT and ROUND_CLOSES_AT in .env.local, " +
        "or pass --last 60 to use the past 60 minutes.",
    );
  }
  if (config.closesAt <= config.opensAt) {
    die("ROUND_CLOSES_AT must be after ROUND_OPENS_AT.");
  }
}

function blankRecord(depositWallet: string): RoundRecord {
  return {
    roundId: config.roundId,
    opensAt: new Date(config.opensAt).toISOString(),
    closesAt: new Date(config.closesAt).toISOString(),
    depositWallet,
    deposits: [],
    totalLamports: 0,
  };
}

/** The permanent main wallet: creator of every new coin, home of all rewards. */
const MAIN_WALLET_KEY_FILE = "LAUNCH_WALLET_SECRET_KEY";

function mainWallet(): Keypair {
  return parseWallet(config.walletSecret);
}

/** True when a round's creator is the main wallet rather than a per-round owner. */
function usesMainCreator(record: RoundRecord) {
  return !record.ownerWallet || record.ownerWallet.address === mainWallet().publicKey.toBase58();
}

function signingWallet(record: RoundRecord | null): Keypair {
  return record && !usesMainCreator(record)
    ? loadOwnerWallet(record.roundId, record.ownerWallet!.address)
    : mainWallet();
}

/**
 * The wallet people deposit into for this round, created with `round new`.
 * Refuses to run when the site publishes a different address, because the
 * scan would then miss every deposit.
 */
function roundDepositWallet(roundId: number): Keypair {
  const wallet = loadDepositWallet(roundId);
  if (!wallet) {
    die(
      `Round #${String(roundId).padStart(3, "0")} has no deposit wallet yet. ` +
        "Run `npm run round -- new` and publish its address first.",
    );
  }
  const published = process.env.NEXT_PUBLIC_DEPOSIT_ADDRESS?.trim();
  if (published && published !== wallet.publicKey.toBase58()) {
    die(
      `NEXT_PUBLIC_DEPOSIT_ADDRESS (${short(published)}) is not round ` +
        `#${String(roundId).padStart(3, "0")}'s deposit wallet (${short(wallet.publicKey.toBase58())}). ` +
        "The site and the scan must use the same address.",
    );
  }
  return wallet;
}

async function fundOwnerWallet(
  depositWallet: Keypair,
  ownerWallet: Keypair,
  requiredLamports: number,
) {
  const current = await connection.getBalance(ownerWallet.publicKey);
  const missing = Math.max(0, requiredLamports - current);
  if (missing === 0) return { signature: undefined, lamports: 0 };

  const transfer = (lamports: number) =>
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: depositWallet.publicKey,
        toPubkey: ownerWallet.publicKey,
        lamports,
      }),
    );

  const [depositBalance, rentExempt, { blockhash, lastValidBlockHeight }] =
    await Promise.all([
      connection.getBalance(depositWallet.publicKey),
      connection.getMinimumBalanceForRentExemption(0),
      connection.getLatestBlockhash("confirmed"),
    ]);
  const probe = transfer(missing);
  probe.feePayer = depositWallet.publicKey;
  probe.recentBlockhash = blockhash;
  const fee =
    (await connection.getFeeForMessage(probe.compileMessage(), "confirmed")).value ??
    5_000;

  // A per-round deposit wallet has no spare SOL. Solana refuses to leave it
  // with a balance above zero but below rent exemption, so when only a dust
  // remainder would stay behind, move everything to the owner instead.
  const leftover = depositBalance - fee - missing;
  if (leftover < 0) {
    die(
      `The deposit wallet holds ${sol(depositBalance)} SOL, short of the ` +
        `${sol(missing + fee)} SOL the owner wallet needs.`,
    );
  }
  const lamports = leftover < rentExempt ? depositBalance - fee : missing;

  const transaction = transfer(lamports);
  transaction.feePayer = depositWallet.publicKey;
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [depositWallet],
    { commitment: "confirmed", maxRetries: 3 },
  );
  return { signature, lamports };
}

/* ------------------------------- commands ------------------------------- */

async function status() {
  const mainWallet = config.walletSecret ? parseWallet(config.walletSecret) : null;
  const roundWallet = loadDepositWallet(config.roundId);
  const balance = roundWallet ? await connection.getBalance(roundWallet.publicKey) : 0;
  const record = loadRound(config.roundId);
  const published = process.env.NEXT_PUBLIC_DEPOSIT_ADDRESS?.trim();

  console.log(`\n${C.bold(`PREPUMP round #${String(config.roundId).padStart(3, "0")}`)}\n`);
  console.log(
    `  Deposit wallet   ${roundWallet ? roundWallet.publicKey.toBase58() : C.yellow("none yet — run `npm run round -- new`")}`,
  );
  if (roundWallet) {
    console.log(`  Deposit key      ${depositWalletRelativeFile(config.roundId)} ${C.dim("(chmod 600)")}`);
  }
  console.log(`  Balance          ${roundWallet ? `${sol(balance)} SOL` : "—"}`);
  if (roundWallet && published && published !== roundWallet.publicKey.toBase58()) {
    console.log(C.red(`  Site address     ${published} ≠ deposit wallet · update NEXT_PUBLIC_DEPOSIT_ADDRESS`));
  }
  console.log(
    `  Main wallet      ${mainWallet ? mainWallet.publicKey.toBase58() : C.red("not configured")} ${C.dim("(creator of every new coin · rewards)")}`,
  );
  console.log(`  Opens            ${stamp(config.opensAt)}`);
  console.log(`  Closes           ${stamp(config.closesAt)}`);
  console.log(`  RPC              ${new URL(config.rpcUrl).host}`);
  console.log(`  OpenAI           ${config.openAiApiKey ? C.green("configured") : C.yellow("missing — fallback list")}`);
  console.log(`  IPFS             ${config.pinataJwt ? "pinata" : C.green("pump.fun (no account needed)")}`);
  const overhead = config.createCostSol + config.priorityFee + config.reserveSol;
  console.log(`  Rent (flat)      ${config.createCostSol} SOL  ${C.dim("(owed whatever the buy is)")}`);
  console.log(`  pump.fun cut     ${config.buyFeePercent}%  ${C.dim("of the buy")}`);
  console.log(`  Reserve          ${config.reserveSol} SOL`);
  console.log(`  Dev cut          ${config.devCutPercent}%`);
  console.log(`  Funding model    ${C.green("round deposits pay launch costs")}`);
  console.log(`  Fixed launch     ${overhead.toFixed(4)} SOL ${C.dim("+ payout rent and buy fee")}`);

  if (record) {
    console.log(`\n  ${C.dim(roundFile(config.roundId))}`);
    console.log(`  Deposits         ${record.deposits.length} wallets · ${sol(record.totalLamports)} SOL`);
    if (record.launch) {
      console.log(`  Launched         ${record.token?.name} ($${record.token?.ticker})`);
      if (record.ownerWallet) {
        console.log(`  Owner            ${record.ownerWallet.address}`);
        console.log(`  Owner key        ${record.ownerWallet.keyFile}`);
      }
      console.log(`  Mint             ${record.launch.mint}`);
      console.log(`  pump.fun         https://pump.fun/coin/${record.launch.mint}`);
    }
    if (record.distribution) {
      const sent = record.distribution.payouts.filter((p) => p.signature).length;
      console.log(`  Distributed      ${sent}/${record.distribution.payouts.length} payouts`);
    }
  } else {
    console.log(`\n  ${C.dim("no round file yet — run `npm run round scan`")}`);
  }
  console.log("");
}

async function scan() {
  requireWindow();
  const wallet = roundDepositWallet(config.roundId);
  const existing = loadRound(config.roundId);
  if (existing?.participantExecution) {
    die("This round has a frozen participant execution plan. Resume it; do not rescan funded deposits.");
  }
  if (existing?.launch) {
    die(
      `Round #${config.roundId} is already launched. The automatic counter should ` +
        "select the next round; remove --round or choose a newer id.",
    );
  }

  console.log(`\n${C.bold("Scanning deposits")}`);
  console.log(`  ${wallet.publicKey.toBase58()}`);
  console.log(`  ${stamp(config.opensAt)} → ${stamp(config.closesAt)} ${C.dim("(+30s for transfers confirmed at the deadline)")}\n`);

  const result = await scanDeposits(
    connection,
    wallet.publicKey,
    config.opensAt,
    config.closesAt + CLOSE_GRACE_MS,
    (done, total) =>
      process.stdout.write(
        `\r  ${done}${total === undefined ? "" : `/${total}`} transactions inspected…   `,
      ),
    loadUsedDepositSignatures(config.roundId),
    new Set(
      listRounds().flatMap((record) =>
        record.ownerWallet ? [record.ownerWallet.address] : [],
      ),
    ),
    undefined,
    MIN_DEPOSIT_LAMPORTS,
  );
  process.stdout.write("\r".padEnd(48) + "\r");

  if (result.excluded > 0) {
    console.log(
      C.dim(
        `  Skipped ${result.excluded} deposit transaction${result.excluded === 1 ? "" : "s"} already used by an earlier round.`,
      ),
    );
  }

  if (result.internalExcluded > 0) {
    console.log(
      C.dim(
        `  Skipped ${result.internalExcluded} internal owner-wallet transfer${result.internalExcluded === 1 ? "" : "s"}.`,
      ),
    );
  }

  const record = existing ?? blankRecord(wallet.publicKey.toBase58());
  if (loadRound(config.roundId)?.participantExecution ||
      existsSync(path.join(roundDataDir(), `round-${config.roundId}.execution.lock`))) {
    die("Participant execution started during the scan. The frozen deposit list was not changed.");
  }
  record.deposits = result.deposits;
  record.totalLamports = result.totalLamports;
  record.lateDeposits = result.late;
  record.belowMinimum = result.belowMinimum;
  record.scannedAt = new Date().toISOString();
  saveRound(record);

  const realBelowMinimum = result.belowMinimum.filter((d) => d.lamports >= 1_000_000);
  const dust = result.belowMinimum.length - realBelowMinimum.length;
  if (dust > 0) {
    console.log(C.dim(`  Ignored ${dust} dust transfer${dust === 1 ? "" : "s"} under 0.001 SOL (spam).`));
  }
  if (realBelowMinimum.length > 0) {
    console.log(
      C.yellow(
        `  ${realBelowMinimum.length} wallet${realBelowMinimum.length === 1 ? "" : "s"} sent less than ` +
          `the ${MIN_DEPOSIT_SOL} SOL minimum. Not in this round; refund by hand:`,
      ),
    );
    for (const small of realBelowMinimum) {
      console.log(C.yellow(`    ${small.wallet}  ${sol(small.lamports)} SOL`));
    }
    console.log("");
  }

  if (result.late.length > 0) {
    console.log(
      C.yellow(
        `  ${result.late.length} wallet${result.late.length === 1 ? "" : "s"} sent SOL after the close. ` +
          "Not in this round; refund by hand:",
      ),
    );
    for (const late of result.late) {
      console.log(C.yellow(`    ${late.wallet}  ${sol(late.lamports)} SOL`));
    }
    console.log("");
  }

  if (result.deposits.length === 0) {
    console.log(C.yellow("  No deposits found in this window.\n"));
    return record;
  }

  console.log(`  ${C.bold("WALLET".padEnd(14))}${"SOL".padStart(10)}${"SHARE".padStart(10)}`);
  for (const deposit of result.deposits) {
    const share = (deposit.lamports / result.totalLamports) * 100;
    console.log(
      `  ${short(deposit.wallet).padEnd(14)}${sol(deposit.lamports).padStart(10)}${`${share.toFixed(2)}%`.padStart(10)}`,
    );
    // Several transfers from one wallet is normal, but it is also how an
    // operator top-up gets mistaken for a deposit. Show the split.
    if (deposit.signatures.length > 1) {
      console.log(
        C.yellow(
          `  ${"".padEnd(14)}${C.dim(`${deposit.signatures.length} separate transfers — check none of them is your own funding`)}`,
        ),
      );
    }
  }
  console.log(`\n  ${C.bold(`${result.deposits.length} wallets · ${sol(result.totalLamports)} SOL`)}`);
  if (result.unattributedLamports > 0) {
    console.log(
      C.yellow(
        `  ${sol(result.unattributedLamports)} SOL could not be traced to a sender and is excluded.`,
      ),
    );
  }
  console.log(`  ${C.dim(roundFile(config.roundId))}\n`);
  return record;
}

async function launch() {
  requireWindow();
  const depositWallet = roundDepositWallet(config.roundId);

  let record = loadRound(config.roundId);
  if (record?.launch && !record.participantExecution && !flag("force")) {
    die(`Round #${config.roundId} already launched: ${record.launch.mint}. Pass --force to launch again.`);
  }
  if (Date.now() < config.closesAt + CLOSE_GRACE_MS && !flag("now")) {
    die(
      `The round closes at ${stamp(config.closesAt)}; launch from 30s after that. ` +
        "Pass --now to launch early.",
    );
  }

  // Always rescan right before launching. An earlier scan (a peek during the
  // round, or a run that stopped) would miss everything that arrived later.
  // Only a frozen participant plan keeps its list.
  record = record?.participantExecution ? record : await scan();
  if (!record) die("Nothing to launch.");

  // Every new coin is created by the main wallet, so all creator rewards land
  // in one place. Rounds that already have their own owner keep it.
  const ownerWallet = signingWallet(record);
  record.ownerWallet = record.ownerWallet ?? {
    address: ownerWallet.publicKey.toBase58(),
    keyFile: MAIN_WALLET_KEY_FILE,
    createdAt: new Date().toISOString(),
  };
  if (record.ownerWallet.address !== ownerWallet.publicKey.toBase58()) {
    die("The saved owner key does not match this round's owner address.");
  }
  const persistentOwner = usesMainCreator(record);
  // New rounds use one buy wallet per real depositor. Never switch funded legacy rounds.
  if (record.participantExecution || !record.ownerWallet.fundingSignature) {
    if (flag("force") || option("buy") !== undefined) {
      die("--force and --buy are unavailable for individual participant execution.");
    }
    if (!flag("yes")) die("Add --yes to fund participant wallets and execute real purchases.");
    console.log(`  Creator          ${ownerWallet.publicKey.toBase58()} ${C.dim(persistentOwner ? "(main wallet)" : "(round owner)")}`);
    return runParticipantRound(config, record, depositWallet, ownerWallet, async () => {
      console.log("Generating meme after participant funding…");
      const meme = await generateMeme(config, process.env.ROUND_THEME, true,
        normalizeMemeMode(process.env.ROUND_MEME_MODE));
      if (!meme.imageDataUrl && !flag("no-art")) {
        throw new Error(meme.imageError ?? "Artwork failed. Buyer funds are saved; resume the same round.");
      }
      return {
        name: meme.name, symbol: meme.ticker, description: meme.description,
        tagline: meme.tagline, imageDataUrl: meme.imageDataUrl,
      };
    }, { persistentOwner });
  }

  saveRound(record);
  const depositBalance = await connection.getBalance(depositWallet.publicKey);
  const ownerBalance = await connection.getBalance(ownerWallet.publicKey);
  const balance = depositBalance + ownerBalance;
  const pooledSol = record.totalLamports / 1e9;

  // pump.fun's create fee and the mint/metadata rent come off the top: they
  // are owed whatever the buy is. Done in lamports and floored, so the buy can
  // never round its way past what the wallet actually holds.
  const BASE_FEE_LAMPORTS = 10_000;
  // Distributing afterwards costs rent for every recipient's token account and
  // leaves the wallet needing to stay rent-exempt. Hold that back from the buy,
  // or the launch succeeds and the payout cannot be paid for.
  const payoutLamports = Math.ceil(
    (record.deposits.length * config.payoutRentSol + config.walletFloorSol) * 1e9,
  );
  const flatLamports =
    Math.ceil(
      (config.createCostSol + config.priorityFee + config.reserveSol) * 1e9,
    ) +
    BASE_FEE_LAMPORTS +
    payoutLamports;
  const overhead = flatLamports / 1e9;

  const fixedRoundCosts = flatLamports + FUNDING_TX_FEE_LAMPORTS;
  // By default, the participants' pool pays every launch cost. Existing SOL in
  // the permanent wallet must never silently subsidize a round.
  const poolFundedBuyLamports = netBuyLamports(
    record.totalLamports,
    fixedRoundCosts,
    config.buyFeePercent,
  );
  const walletFundedBuyLamports = netBuyLamports(
    balance,
    fixedRoundCosts,
    config.buyFeePercent,
  );

  const forced = Number(option("buy"));
  const targetLamports =
    Number.isFinite(forced) && forced >= 0
      ? Math.round(forced * 1e9)
      : poolFundedBuyLamports;

  const buyLamports = Math.max(
    0,
    Math.min(targetLamports, walletFundedBuyLamports),
  );
  const buySol = Math.floor(buyLamports / 1000) / 1e6;

  if (!Number.isFinite(forced) && poolFundedBuyLamports <= 0) {
    die(
      `The ${pooledSol.toFixed(6)} SOL pool cannot cover the estimated ` +
        `${(fixedRoundCosts / 1e9).toFixed(6)} SOL fixed launch and payout costs.`,
    );
  }
  if (balance < fixedRoundCosts) {
    die(
      `The wallets currently hold ${sol(balance)} SOL, below the estimated ` +
        `${(fixedRoundCosts / 1e9).toFixed(6)} SOL fixed costs. Re-scan the deposits.`,
    );
  }

  console.log(`\n${C.bold("T-0 sequence")}`);
  console.log(`  Deposit wallet   ${sol(depositBalance)} SOL`);
  console.log(`  Fresh owner      ${ownerWallet.publicKey.toBase58()}`);
  console.log(`  Owner key        ${ownerWalletRelativeFile(record.roundId)}`);
  console.log(`  Pooled           ${pooledSol.toFixed(4)} SOL from ${record.deposits.length} wallets`);
  console.log(`  Funding model    ${C.green("participants pay all round costs")}`);
  console.log(
    `  Rent + fees      ${C.dim(`${overhead.toFixed(6)} SOL + ${config.buyFeePercent}% of the buy`)}`,
  );
  console.log(
    `  ${C.dim(`of which ${(payoutLamports / 1e9).toFixed(6)} SOL is held back to pay ${record.deposits.length} depositor(s)`)}`,
  );
  console.log(`  Buying with      ${C.bold(`${buySol} SOL`)}${buySol === 0 ? C.dim("  (create only, no buy)") : ""}`);
  if (!Number.isFinite(forced)) {
    console.log(
      `  Deducted         ${C.dim(`${(pooledSol - buySol).toFixed(6)} SOL from the pool for estimated costs`)}`,
    );
  }
  if (Number.isFinite(forced)) console.log(C.dim(`  Buy forced with --buy ${forced}`));
  if (!Number.isFinite(forced) && buyLamports < poolFundedBuyLamports) {
    console.log(
      C.yellow(
        `  Wallet balance is short; ${sol(poolFundedBuyLamports - buyLamports)} SOL of the intended buy cannot be funded.`,
      ),
    );
  }

  if (!flag("yes")) {
    die("Add --yes to confirm. This spends real SOL and creates a real token.");
  }


  process.stdout.write("  Generating meme… ");
  const meme = await generateMeme(
    config,
    process.env.ROUND_THEME,
    true,
    normalizeMemeMode(process.env.ROUND_MEME_MODE),
  );
  console.log(C.green(`${meme.name} ($${meme.ticker})`));
  if (meme.imageError) console.log(C.yellow(`  ${meme.imageError}`));
  if (!meme.imageDataUrl && !flag("no-art")) {
    die("The artwork failed. Re-run, or pass --no-art to launch with the PREPUMP mark.");
  }

  const requiredOwnerLamports =
    flatLamports +
    Math.ceil(buyLamports * (1 + config.buyFeePercent / 100));
  process.stdout.write("  Funding owner wallet… ");
  const funding = await fundOwnerWallet(
    depositWallet,
    ownerWallet,
    requiredOwnerLamports,
  );
  if (funding.signature) {
    record.ownerWallet.fundingSignature = funding.signature;
    record.ownerWallet.fundedLamports =
      (record.ownerWallet.fundedLamports ?? 0) + funding.lamports;
    saveRound(record);
    console.log(C.green(`${sol(funding.lamports)} SOL`));
  } else {
    console.log(C.green("already funded"));
  }

  process.stdout.write("  Creating on pump.fun… ");
  const result = await createPumpToken(
    config,
    {
      name: meme.name,
      symbol: meme.ticker,
      description: meme.description,
      imageDataUrl: meme.imageDataUrl,
    },
    buySol,
    ownerWallet,
  );
  console.log(C.green("done"));

  record.token = {
    name: meme.name,
    ticker: meme.ticker,
    tagline: meme.tagline,
    description: meme.description,
  };
  record.launch = { ...result, launchedAt: new Date().toISOString() };
  saveRound(record);

  console.log(`\n  ${C.bold(meme.name)} ($${meme.ticker}) — ${meme.tagline}`);
  console.log(`  Mint             ${result.mint}`);
  console.log(`  Owner            ${ownerWallet.publicKey.toBase58()}`);
  console.log(`  Private key      ${ownerWalletRelativeFile(record.roundId)} ${C.dim("(chmod 600)")}`);
  console.log(`  Show for import  npm run round -- owner --round ${record.roundId} --show-secret${dataDir ? ` --data ${dataDir}` : ""}`);
  console.log(`  Transaction      https://solscan.io/tx/${result.signature}`);
  console.log(`  pump.fun         https://pump.fun/coin/${result.mint}\n`);
  return record;
}

async function distribute() {
  const record = loadRound(config.roundId);
  if (!record?.launch) die("This round has not launched yet.");
  if (record.participantExecution) {
    if (record.participantExecution.completedAt) {
      console.log("All participant purchases, token payouts and buyer SOL refunds are complete.");
      return;
    }
    if (!flag("yes")) die("Add --yes to resume participant buys and payouts.");
    await runParticipantRound(config, record, roundDepositWallet(record.roundId), signingWallet(record),
      async () => { throw new Error("Saved meme is missing; resume using go."); },
      { persistentOwner: usesMainCreator(record) });
    return;
  }
  const wallet = signingWallet(record);

  const mint = new PublicKey(record.launch.mint);
  const programId = await resolveTokenProgram(connection, mint);
  const supply = await connection.getTokenSupply(mint);
  const decimals = supply.value.decimals;
  const { amount } = await readTokenBalance(
    connection,
    wallet.publicKey,
    mint,
    programId,
  );

  const keep = (amount * BigInt(Math.round(config.devCutPercent * 100))) / 10_000n;
  const distributable = amount - keep;

  const existing = record.distribution;
  const payouts: Payout[] = existing?.payouts?.length
    ? existing.payouts
    : allocate(record.deposits, record.totalLamports, distributable).map((a) => ({
        wallet: a.wallet,
        tokens: a.tokens.toString(),
      }));

  if (payouts.length === 0) die("No depositors to pay.");

  const pending = payouts.filter((p) => !p.signature).length;
  const unit = (value: bigint) => (Number(value) / 10 ** decimals).toLocaleString();

  console.log(`\n${C.bold("Distribution")}`);
  console.log(`  Token            ${record.token?.name} ($${record.token?.ticker})`);
  console.log(`  Wallet holds     ${unit(amount)}`);
  console.log(`  Dev cut          ${config.devCutPercent}% → ${unit(keep)}`);
  console.log(`  To depositors    ${unit(distributable)} across ${payouts.length} wallets`);
  console.log(`  Still to send    ${pending}\n`);

  if (pending === 0) {
    console.log(C.green("  Everything is already paid out.\n"));
    return;
  }
  if (!flag("yes")) die("Add --yes to send the payouts.");

  record.distribution = {
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    decimals,
    totalTokens: amount.toString(),
    distributableTokens: distributable.toString(),
    payouts,
  };
  saveRound(record);

  const settled = await sendPayouts(
    connection,
    wallet,
    mint,
    decimals,
    payouts,
    programId,
    (done, total) => process.stdout.write(`\r  Sending… ${done}/${total}   `),
  );
  process.stdout.write("\r".padEnd(40) + "\r");

  record.distribution.payouts = settled;
  const failed = settled.filter((p) => p.error && !p.signature);
  if (failed.length === 0) record.distribution.completedAt = new Date().toISOString();
  saveRound(record);

  console.log(`  ${C.green(`${settled.length - failed.length} paid`)}${failed.length ? C.red(` · ${failed.length} failed`) : ""}`);
  for (const failure of failed.slice(0, 5)) {
    console.log(C.red(`    ${short(failure.wallet)} — ${failure.error}`));
  }
  if (failed.length) console.log(C.dim("  Re-run the command to retry the failures."));
  console.log(`  ${C.dim(roundFile(config.roundId))}\n`);
}


/**
 * pump.fun pays the creator a share of trading fees. PREPUMP passes that on:
 * the creator wallet claims it, then splits it over whoever holds the coin.
 */
async function rewards() {
  if (flag("all")) {
    await rewardsAll();
    return;
  }

  const configuredRecord = loadRound(config.roundId);
  const requestedMint = option("mint");
  const record = requestedMint
    ? findRoundByMint(requestedMint)
    : configuredRecord;
  const mintAddress = requestedMint ?? record?.launch?.mint;
  if (!mintAddress) die("No mint. Launch a round first, or pass --mint <address>.");
  const wallet = signingWallet(record);

  const mint = new PublicKey(mintAddress);
  const vault = creatorVault(wallet.publicKey);
  const pending = await claimableLamports(connection, vault);

  console.log(`\n${C.bold("Creator rewards")}`);
  console.log(`  Token            ${record?.token?.ticker ? `$${record.token.ticker}` : short(mintAddress)}`);
  console.log(`  Creator vault    ${short(vault.toBase58())}`);
  console.log(`  Claimable        ${C.bold(`${sol(pending)} SOL`)}`);

  const programId = await resolveTokenProgram(connection, mint);
  const holders = await snapshotHolders(connection, mint, programId, [
    wallet.publicKey.toBase58(),
  ]);
  const held = holders.reduce((sum, h) => sum + h.amount, 0n);

  console.log(`  Holders          ${holders.length} wallets hold the coin`);

  // Claiming into the creator wallet is the default; --split shares it out.
  if (!flag("split")) {
    if (pending <= 0) die("There is nothing to claim.");
    if (!flag("yes")) {
      die("Add --yes to claim into the creator wallet, or --split to share it with holders.");
    }
    process.stdout.write("\n  Claiming to the creator wallet… ");
    const signature = await collectCreatorFees(config, wallet);
    console.log(C.green("done"));
    const after = await connection.getBalance(wallet.publicKey);
    console.log(`  Wallet now       ${sol(after)} SOL`);
    console.log(`  ${C.dim(`https://solscan.io/tx/${signature}`)}\n`);
    return;
  }

  if (holders.length === 0) {
    console.log(
      C.yellow(
        "\n  Nobody holds it right now, so there is nothing to split. The vault keeps\n  the SOL until someone does.\n",
      ),
    );
    return;
  }

  const before = await connection.getBalance(wallet.publicKey);

  if (pending > 0) {
    if (!flag("yes")) die("Add --yes to claim and pay out.");
    process.stdout.write("  Claiming… ");
    const signature = await collectCreatorFees(config, wallet);
    console.log(C.green("done"));
    console.log(`  ${C.dim(`https://solscan.io/tx/${signature}`)}`);
  } else {
    console.log(C.dim("  Nothing new to claim; paying out what is already here."));
  }

  const after = await connection.getBalance(wallet.publicKey);
  const claimed = Math.max(0, after - before) || pending;
  const keep = Math.round((claimed * config.devCutPercent) / 100);
  const distributable = claimed - keep;
  const minLamports = Math.round(num(option("min"), 0.00001) * 1e9);

  const payouts: RewardPayout[] = allocateRewards(
    holders,
    distributable,
    minLamports,
  );

  console.log(`\n  Claimed          ${sol(claimed)} SOL`);
  if (keep > 0) console.log(`  Creator cut      ${config.devCutPercent}% → ${sol(keep)} SOL`);
  console.log(`  To holders       ${sol(distributable)} SOL across ${payouts.length} wallets`);

  if (payouts.length === 0) {
    console.log(C.yellow("\n  Every share lands below the dust floor. Nothing sent.\n"));
    return;
  }

  for (const payout of payouts.slice(0, 10)) {
    const holder = holders.find((h) => h.owner === payout.wallet)!;
    const share = Number((holder.amount * 10000n) / held) / 100;
    console.log(
      `    ${short(payout.wallet).padEnd(14)}${sol(payout.lamports).padStart(10)}${`${share.toFixed(2)}%`.padStart(9)}`,
    );
  }
  if (payouts.length > 10) console.log(C.dim(`    …and ${payouts.length - 10} more`));

  if (!flag("yes")) die("\nAdd --yes to send the payouts.");

  const settled = await sendRewards(connection, wallet, payouts, (done, total) =>
    process.stdout.write(`\r  Sending… ${done}/${total}   `),
  );
  process.stdout.write("\r".padEnd(40) + "\r");

  const failed = settled.filter((p) => p.error && !p.signature);
  console.log(
    `  ${C.green(`${settled.length - failed.length} paid`)}${failed.length ? C.red(` · ${failed.length} failed`) : ""}\n`,
  );
  for (const failure of failed.slice(0, 5)) {
    console.log(C.red(`    ${short(failure.wallet)} — ${failure.error}`));
  }
}

async function rewardsAll() {
  if (flag("split")) {
    die("Use either --all to collect into the main wallet or --split for one coin, not both.");
  }

  const depositWallet = parseWallet(config.walletSecret);
  const launchedRounds = listRounds().filter((record) => record.launch);
  // Coins created by the main wallet share its one creator vault.
  const ownerRounds = launchedRounds.filter((record) => !usesMainCreator(record));
  const hasLegacyCreator = launchedRounds.some((record) => usesMainCreator(record));
  if (launchedRounds.length === 0) {
    die("No launched rounds were found.");
  }
  const minClaimNetLamports = Math.ceil(
    num(option("min-claim"), 0.00005) * 1e9,
  );
  const preparedClaims = new Map<
    string,
    Awaited<ReturnType<typeof prepareCreatorFeeClaim>>
  >();

  console.log(`\n${C.bold("All creator rewards → main wallet")}`);
  console.log(`  Destination      ${depositWallet.publicKey.toBase58()}`);
  console.log(`  Legacy creator   ${hasLegacyCreator ? "main wallet" : "none"}`);
  console.log(`  Owner wallets    ${ownerRounds.length}`);
  console.log(
    `  Owner reserve    ${config.walletFloorSol.toFixed(6)} SOL ${C.dim("kept for future claims")}`,
  );
  console.log(
    `  Minimum net      ${sol(minClaimNetLamports)} SOL ${C.dim("after all claim costs")}`,
  );

  if (hasLegacyCreator) {
    const pending = await claimableLamports(
      connection,
      creatorVault(depositWallet.publicKey),
    );
    try {
      const prepared = await prepareCreatorFeeClaim(config, depositWallet);
      preparedClaims.set(
        depositWallet.publicKey.toBase58(),
        prepared,
      );
      console.log(
        `  legacy     ${short(depositWallet.publicKey.toBase58())} · ${sol(pending)} bonding vault · ${sol(prepared.netLamports)} estimated net`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(C.red(`  legacy     estimate unavailable: ${message}`));
    }
  }

  for (const record of ownerRounds) {
    const label = `#${String(record.roundId).padStart(3, "0")} ${String(record.token?.ticker ? `$${record.token.ticker}` : short(record.launch!.mint)).padEnd(10)}`;
    try {
      const ownerWallet = loadOwnerWallet(
        record.roundId,
        record.ownerWallet!.address,
      );
      const vault = creatorVault(ownerWallet.publicKey);
      const pending = await claimableLamports(connection, vault);
      const balance = await connection.getBalance(ownerWallet.publicKey);
      const prepared = await prepareCreatorFeeClaim(config, ownerWallet);
      preparedClaims.set(ownerWallet.publicKey.toBase58(), prepared);
      console.log(
        `  ${label} ${short(ownerWallet.publicKey.toBase58())} · ${sol(pending)} bonding vault · ${sol(prepared.netLamports)} estimated net · ${sol(balance)} wallet`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(C.red(`  ${label} unavailable: ${message}`));
    }
  }

  if (!flag("yes")) {
    die("Add --yes to claim every creator wallet and sweep rewards to the main wallet.");
  }

  let claimed = 0;
  let skippedClaims = 0;
  let swept = 0;
  let failedActions = 0;
  const reserveLamports = Math.ceil(config.walletFloorSol * 1e9);
  // One-signature SOL transfer is normally 5,000 lamports; double it so the
  // retained owner balance remains safely usable if network pricing changes.
  const sweepFeeBuffer = 10_000;
  const claimIfProfitable = async (label: string, wallet: Keypair) => {
    process.stdout.write(`\n  ${label} · checking claim… `);
    try {
      const address = wallet.publicKey.toBase58();
      const prepared =
        preparedClaims.get(address) ??
        (await prepareCreatorFeeClaim(config, wallet));
      const net = prepared.netLamports;
      if (net < minClaimNetLamports) {
        skippedClaims += 1;
        console.log(
          C.dim(
            `skip (${sol(net)} SOL estimated net; need ${sol(minClaimNetLamports)})`,
          ),
        );
        return;
      }

      process.stdout.write(`${sol(net)} SOL net · claiming… `);
      const signature = await collectCreatorFees(
        config,
        wallet,
        prepared.transaction,
      );
      claimed += 1;
      console.log(C.green("done"));
      console.log(`    Claim tx       https://solscan.io/tx/${signature}`);
    } catch (error) {
      failedActions += 1;
      const message = error instanceof Error ? error.message : "Claim failed";
      console.log(C.red("failed"));
      console.log(`    ${C.red(message)}`);
    }
  };

  if (hasLegacyCreator) {
    await claimIfProfitable("legacy main wallet", depositWallet);
  }

  for (const record of ownerRounds) {
    const label = `#${String(record.roundId).padStart(3, "0")} ${record.token?.ticker ? `$${record.token.ticker}` : short(record.launch!.mint)}`;
    try {
      const ownerWallet = loadOwnerWallet(
        record.roundId,
        record.ownerWallet!.address,
      );
      await claimIfProfitable(label, ownerWallet);

      const balance = await connection.getBalance(ownerWallet.publicKey);
      const amount = Math.max(
        0,
        balance - reserveLamports - sweepFeeBuffer,
      );
      if (amount === 0) {
        console.log(`    Sweep          ${C.dim("nothing above owner reserve")}`);
        continue;
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: ownerWallet.publicKey,
          toPubkey: depositWallet.publicKey,
          lamports: amount,
        }),
      );
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [ownerWallet],
        { commitment: "confirmed", maxRetries: 3 },
      );
      swept += amount;
      console.log(`    Sweep          ${C.green(`${sol(amount)} SOL`)}`);
      console.log(`    Sweep tx       https://solscan.io/tx/${signature}`);
    } catch (error) {
      failedActions += 1;
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(C.red(`\n  ${label} · failed: ${message}`));
    }
  }

  console.log(`\n  ${C.bold("Complete")}`);
  console.log(`  Claims sent      ${claimed}`);
  console.log(`  Claims deferred  ${skippedClaims}`);
  console.log(`  Swept to main    ${C.green(`${sol(swept)} SOL`)}`);
  console.log(`  Failed actions   ${failedActions}\n`);
}

/** Creates this round's fresh deposit wallet and prints what to publish. */
function newRound() {
  const roundId = config.roundId;
  const label = `#${String(roundId).padStart(3, "0")}`;
  const existed = loadDepositWallet(roundId) !== null;
  const wallet = loadOrCreateDepositWallet(roundId);
  const address = wallet.publicKey.toBase58();

  console.log(
    `\n${C.bold(`Round ${label} deposit wallet`)}  ${existed ? C.dim("already existed, reused") : C.green("new")}`,
  );
  console.log(`  Address          ${address}`);
  console.log(`  Private key      ${depositWalletRelativeFile(roundId)} ${C.dim("(chmod 600)")}`);
  console.log(`  Show for import  npm run round -- deposit --round ${roundId} --show-secret${dataDir ? ` --data ${dataDir}` : ""}`);
  console.log(`\n  ${C.bold("Set these in .env.local and at Vercel, then redeploy:")}\n`);
  console.log(`  ROUND_ID=${roundId}`);
  console.log(`  NEXT_PUBLIC_DEPOSIT_ADDRESS=${address}`);
  if (config.opensAt && config.closesAt) {
    console.log(`  ROUND_OPENS_AT=${new Date(config.opensAt).toISOString().replace(".000Z", "Z")}`);
    console.log(`  ROUND_CLOSES_AT=${new Date(config.closesAt).toISOString().replace(".000Z", "Z")}`);
  } else {
    console.log(C.dim("  ROUND_OPENS_AT=…\n  ROUND_CLOSES_AT=…"));
  }
  console.log("");
}

function depositKey() {
  const roundId = config.roundId;
  const wallet = loadDepositWallet(roundId);
  if (!wallet) die(`Round #${String(roundId).padStart(3, "0")} has no deposit wallet.`);

  console.log(`\n${C.bold(`Deposit wallet · round #${String(roundId).padStart(3, "0")}`)}`);
  console.log(`  Address          ${wallet.publicKey.toBase58()}`);
  console.log(`  Private key      ${depositWalletRelativeFile(roundId)} ${C.dim("(chmod 600)")}`);
  if (flag("show-secret")) {
    console.log(`  Import secret    ${depositSecretBase58(roundId)}`);
    console.log(C.yellow("  Keep this secret offline. Anyone with it controls the deposits."));
  } else {
    console.log(`  Show for import  npm run round -- deposit --round ${roundId} --show-secret${dataDir ? ` --data ${dataDir}` : ""}`);
  }
  console.log("");
}

function owner() {
  const roundId = config.roundId;
  const record = loadRound(roundId);
  if (!record?.ownerWallet) die(`Round #${roundId} has no separate owner wallet.`);
  if (usesMainCreator(record)) {
    console.log(`\n${C.bold(`Creator · round #${String(roundId).padStart(3, "0")}`)}`);
    console.log(`  Address          ${record.ownerWallet.address} ${C.dim("(main wallet)")}`);
    console.log(`  Private key      ${MAIN_WALLET_KEY_FILE} in .env.local\n`);
    return;
  }
  const wallet = loadOwnerWallet(roundId, record.ownerWallet.address);

  console.log(`\n${C.bold(`Owner wallet · round #${String(roundId).padStart(3, "0")}`)}`);
  console.log(`  Address          ${wallet.publicKey.toBase58()}`);
  console.log(`  Private key      ${ownerWalletRelativeFile(roundId)} ${C.dim("(chmod 600)")}`);
  if (flag("show-secret")) {
    console.log(`  Import secret    ${ownerSecretBase58(roundId)}`);
    console.log(C.yellow("  Keep this secret offline. Anyone with it controls the creator wallet."));
  } else {
    console.log(`  Show for import  npm run round -- owner --round ${roundId} --show-secret${dataDir ? ` --data ${dataDir}` : ""}`);
  }
  console.log("");
}


/**
 * Waits for the countdown, then runs the whole T-0 sequence on its own:
 * scan, launch, distribute, and optionally pass the creator fees on.
 * Leave it running in a terminal; nothing is scheduled anywhere else.
 */
async function auto() {
  if (!config.closesAt) {
    die("Set ROUND_CLOSES_AT in .env.local, or pass --last to run right now.");
  }
  // Check everything that could fail before committing to a long wait.
  requireWindow();
  roundDepositWallet(config.roundId);
  parseWallet(config.walletSecret);
  if (loadRound(config.roundId)?.launch && !loadRound(config.roundId)?.participantExecution && !flag("force")) {
    die(`Round #${config.roundId} already launched. Bump ROUND_ID, or pass --force.`);
  }
  if (!flag("yes")) {
    die("Add --yes. At T-0 this spends real SOL and creates a real token.");
  }

  const label = `#${String(config.roundId).padStart(3, "0")}`;
  console.log(`\n${C.bold(`Waiting for round ${label}`)}`);
  console.log(`  Window           ${stamp(config.opensAt)} → ${stamp(config.closesAt)}`);
  console.log(`  Then             scan → launch → distribute${flag("rewards") ? " → rewards" : ""}`);
  console.log(`  ${C.dim("Leave this running. Ctrl-C to stop.")}\n`);

  while (Date.now() < config.closesAt + CLOSE_GRACE_MS) {
    const left = config.closesAt + CLOSE_GRACE_MS - Date.now();
    const h = Math.floor(left / 3_600_000);
    const m = Math.floor((left % 3_600_000) / 60_000);
    const sec = Math.floor((left % 60_000) / 1000);
    process.stdout.write(
      `\r  T-${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}   `,
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  process.stdout.write("\r".padEnd(24) + "\r");
  console.log(C.bold("  T-0. Going.\n"));

  await launch();
  await distribute();
  if (flag("rewards")) await rewards();

  console.log(C.green(`  Round ${label} is done.\n`));
}


/**
 * Generates a batch of memes without launching anything, so the variety can be
 * judged by eye. Writes each image plus a labelled contact sheet.
 */
async function memes() {
  const count = Math.min(12, Math.max(1, Math.trunc(Number(option("count")) || 6)));
  const mode = normalizeMemeMode(option("mode") ?? process.env.ROUND_MEME_MODE);
  const theme = option("theme") ?? process.env.ROUND_THEME;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(process.cwd(), ".round", "previews", stamp);
  mkdirSync(dir, { recursive: true });

  console.log(`\n${C.bold(`Generating ${count} preview memes`)}  ${C.dim(`mode ${mode}`)}`);
  console.log(C.dim("  Nothing is launched. This only spends OpenAI credits.\n"));

  const results = await Promise.allSettled(
    Array.from({ length: count }, () => generateMeme(config, theme, true, mode)),
  );

  const tiles: { image: Buffer; caption: string[] }[] = [];
  results.forEach((result, index) => {
    const n = String(index + 1).padStart(2, "0");
    if (result.status === "rejected") {
      console.log(C.red(`  ${n}  failed: ${String(result.reason).slice(0, 120)}`));
      return;
    }
    const meme = result.value;
    const line = `${meme.name} ($${meme.ticker})`;
    console.log(
      `  ${n}  ${C.bold(line)}  ${C.dim(`${meme.style ?? "?"}${meme.slogan ? ` · "${meme.slogan}"` : ""}`)}`,
    );
    console.log(`      ${meme.tagline}`);
    if (meme.imageError) console.log(C.yellow(`      ${meme.imageError}`));
    if (!meme.imageDataUrl) return;
    const image = Buffer.from(meme.imageDataUrl.split(",")[1], "base64");
    writeFileSync(path.join(dir, `${n}-${meme.ticker}.webp`), image);
    tiles.push({
      image,
      caption: [line, `${meme.style ?? ""}${meme.slogan ? ` · ${meme.slogan}` : ""}`],
    });
  });
  writeFileSync(
    path.join(dir, "memes.json"),
    JSON.stringify(
      results.map((r) => (r.status === "fulfilled" ? { ...r.value, imageDataUrl: undefined } : { error: String(r.reason) })),
      null,
      2,
    ),
  );

  if (tiles.length > 0) {
    const size = 384;
    const band = 64;
    const cols = Math.min(3, tiles.length);
    const rows = Math.ceil(tiles.length / cols);
    const escape = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const composites = await Promise.all(
      tiles.flatMap((tile, i) => {
        const left = (i % cols) * size;
        const top = Math.floor(i / cols) * (size + band);
        const caption = Buffer.from(
          `<svg width="${size}" height="${band}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#080a09"/>
            <text x="12" y="26" font-family="Helvetica, Arial" font-size="18" font-weight="700" fill="#fffdf0">${escape(tile.caption[0]).slice(0, 38)}</text>
            <text x="12" y="50" font-family="Menlo, monospace" font-size="13" fill="#7bf0a8">${escape(tile.caption[1]).slice(0, 44)}</text>
          </svg>`,
        );
        return [
          sharp(tile.image).resize(size, size).png().toBuffer().then((input) => ({ input, left, top })),
          Promise.resolve({ input: caption, left, top: top + size }),
        ];
      }),
    );
    await sharp({
      create: {
        width: cols * size,
        height: rows * (size + band),
        channels: 3,
        background: "#080a09",
      },
    })
      .composite(composites)
      .png()
      .toFile(path.join(dir, "sheet.png"));
    console.log(`\n  ${C.green("Contact sheet")}  ${path.join(dir, "sheet.png")}\n`);
  }
}

/* --------------------------------- run ---------------------------------- */

try {
  if (command === "status") await status();
  else if (command === "scan") await scan();
  else if (command === "launch") await launch();
  else if (command === "distribute") await distribute();
  else if (command === "rewards") await rewards();
  else if (command === "owner") owner();
  else if (command === "new") newRound();
  else if (command === "deposit") depositKey();
  else if (command === "auto") await auto();
  else if (command === "memes") await memes();
  else if (command === "go") {
    await launch();
    await distribute();
  } else {
    console.log(
      [
        "",
        "Usage: npm run round <status|new|scan|launch|distribute|rewards|owner|deposit|auto|go|memes> [options]",
        "",
        "  --yes         confirm a command that spends SOL",
        "  --dev         use the isolated /dev round, wallet and data directory",
        "  --now         launch before ROUND_CLOSES_AT",
        "  --force       launch a round that already launched",
        "  --last <min>  use the past N minutes as the round window",
        "  --after <utc> use transactions after an exact ISO timestamp",
        "  --buy <sol>   override the buy amount",
        "  --no-art      launch even if the artwork failed",
        "  --mint <addr> which coin's holders get the rewards",
        "  --min <sol>   dust floor for a reward payout (default 0.00001)",
        "  --split       share creator fees with holders instead of keeping them",
        "  --all         with rewards, claim every owner and sweep to main wallet",
        "  --min-claim   minimum estimated net SOL for a bulk claim (default 0.00005)",
        "  --rewards     with `auto`, also claim creator fees after the launch",
        "  --round <id>  override automatic round selection",
        "  --data <dir>  use another season, e.g. .round/archive/test-2026-09",
        "  --count <n>   with memes, how many previews to generate (max 12)",
        "  --mode <id>   with memes, trend|classic|brand|stock|workplace|animal|cursed",
        "  --theme <txt> with memes, a creative direction",
        "  --show-secret print an owner key for wallet import (sensitive)",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
} catch (error) {
  if (error instanceof Error) {
    die(error.message || `${error.name}${error.stack ? `\n\n${error.stack.split("\n").slice(0, 4).join("\n")}` : ""}`);
  }
  die(String(error));
}
