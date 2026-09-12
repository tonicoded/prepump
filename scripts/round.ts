/**
 * PREPUMP round operator.
 *
 *   npm run round status        what is configured and what the wallet holds
 *   npm run round scan          read deposits for the round window
 *   npm run round launch        generate the meme and create it on pump.fun
 *   npm run round distribute    send every depositor their share
 *   npm run round go            launch, then distribute
 *
 * Run it yourself when the countdown reaches zero. Nothing here is scheduled.
 */

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
  type Payout,
  type RoundRecord,
} from "../lib/round/store.ts";
import {
  loadOrCreateOwnerWallet,
  loadOwnerWallet,
  ownerSecretBase58,
  ownerWalletRelativeFile,
} from "../lib/round/owner-wallet.ts";
import { scanDeposits } from "../lib/round/deposits.ts";
import { generateMeme } from "../lib/round/meme.ts";
import { normalizeMemeMode } from "../lib/round/meme-modes.ts";
import { createPumpToken, parseWallet } from "../lib/round/pumpfun.ts";
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
  estimateCreatorFeeClaimNetLamports,
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

function signingWallet(record: RoundRecord | null): Keypair {
  return record?.ownerWallet
    ? loadOwnerWallet(record.roundId, record.ownerWallet.address)
    : parseWallet(config.walletSecret);
}

async function fundOwnerWallet(
  depositWallet: Keypair,
  ownerWallet: Keypair,
  requiredLamports: number,
) {
  const current = await connection.getBalance(ownerWallet.publicKey);
  const missing = Math.max(0, requiredLamports - current);
  if (missing === 0) return { signature: undefined, lamports: 0 };

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: depositWallet.publicKey,
      toPubkey: ownerWallet.publicKey,
      lamports: missing,
    }),
  );
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [depositWallet],
    { commitment: "confirmed", maxRetries: 3 },
  );
  return { signature, lamports: missing };
}

/* ------------------------------- commands ------------------------------- */

async function status() {
  const wallet = config.walletSecret ? parseWallet(config.walletSecret) : null;
  const balance = wallet ? await connection.getBalance(wallet.publicKey) : 0;
  const record = loadRound(config.roundId);

  console.log(`\n${C.bold(`PREPUMP round #${String(config.roundId).padStart(3, "0")}`)}\n`);
  console.log(`  Deposit wallet   ${wallet ? wallet.publicKey.toBase58() : C.red("not configured")}`);
  console.log(`  Balance          ${wallet ? `${sol(balance)} SOL` : "—"}`);
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
  console.log(`  Minimum wallet   ${C.bold(`${overhead.toFixed(4)} SOL`)} ${C.dim("+ whatever you want to buy with")}`);
  if (wallet && balance / 1e9 < overhead) {
    console.log(`  ${C.yellow(`Top up by ${(overhead - balance / 1e9).toFixed(4)} SOL before launching.`)}`);
  }

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
  const wallet = parseWallet(config.walletSecret);
  const existing = loadRound(config.roundId);
  if (existing?.launch) {
    die(
      `Round #${config.roundId} is already launched. The automatic counter should ` +
        "select the next round; remove --round or choose a newer id.",
    );
  }

  console.log(`\n${C.bold("Scanning deposits")}`);
  console.log(`  ${wallet.publicKey.toBase58()}`);
  console.log(`  ${stamp(config.opensAt)} → ${stamp(config.closesAt)}\n`);

  const result = await scanDeposits(
    connection,
    wallet.publicKey,
    config.opensAt,
    config.closesAt,
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
  record.deposits = result.deposits;
  record.totalLamports = result.totalLamports;
  record.scannedAt = new Date().toISOString();
  saveRound(record);

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
  const depositWallet = parseWallet(config.walletSecret);

  let record = loadRound(config.roundId);
  if (record?.launch && !flag("force")) {
    die(`Round #${config.roundId} already launched: ${record.launch.mint}. Pass --force to launch again.`);
  }
  if (Date.now() < config.closesAt && !flag("now")) {
    die(`The round closes at ${stamp(config.closesAt)}. Pass --now to launch early.`);
  }

  record = record?.scannedAt ? record : await scan();
  if (!record) die("Nothing to launch.");

  const ownerWallet = loadOrCreateOwnerWallet(record.roundId);
  record.ownerWallet = record.ownerWallet ?? {
    address: ownerWallet.publicKey.toBase58(),
    keyFile: ownerWalletRelativeFile(record.roundId),
    createdAt: new Date().toISOString(),
  };
  if (record.ownerWallet.address !== ownerWallet.publicKey.toBase58()) {
    die("The saved owner key does not match this round's owner address.");
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

  // Spending b on the buy costs b * (1 + fee), so the affordable buy is the
  // free balance divided by that multiplier, not simply the free balance.
  const multiplier = 1 + config.buyFeePercent / 100;
  const spendableLamports = Math.floor(
    Math.max(0, balance - flatLamports - FUNDING_TX_FEE_LAMPORTS) / multiplier,
  );

  const forced = Number(option("buy"));
  const targetLamports =
    Number.isFinite(forced) && forced >= 0
      ? Math.round(forced * 1e9)
      : record.totalLamports;

  const buyLamports = Math.max(0, Math.min(targetLamports, spendableLamports));
  const buySol = Math.floor(buyLamports / 1000) / 1e6;

  if (balance < flatLamports + FUNDING_TX_FEE_LAMPORTS) {
    die(
      `Wallet holds ${sol(balance)} SOL. A launch needs about ${overhead.toFixed(6)} SOL ` +
        `plus a funding transaction before any buy. Top it up.`,
    );
  }

  console.log(`\n${C.bold("T-0 sequence")}`);
  console.log(`  Deposit wallet   ${sol(depositBalance)} SOL`);
  console.log(`  Fresh owner      ${ownerWallet.publicKey.toBase58()}`);
  console.log(`  Owner key        ${ownerWalletRelativeFile(record.roundId)}`);
  console.log(`  Pooled           ${pooledSol.toFixed(4)} SOL from ${record.deposits.length} wallets`);
  console.log(
    `  Rent + fees      ${C.dim(`${overhead.toFixed(6)} SOL + ${config.buyFeePercent}% of the buy`)}`,
  );
  console.log(
    `  ${C.dim(`of which ${(payoutLamports / 1e9).toFixed(6)} SOL is held back to pay ${record.deposits.length} depositor(s)`)}`,
  );
  console.log(`  Buying with      ${C.bold(`${buySol} SOL`)}${buySol === 0 ? C.dim("  (create only, no buy)") : ""}`);
  if (Number.isFinite(forced)) console.log(C.dim(`  Buy forced with --buy ${forced}`));
  if (!Number.isFinite(forced) && buySol < pooledSol) {
    console.log(C.yellow(`  Capped by the wallet balance; ${(pooledSol - buySol).toFixed(4)} SOL of deposits is not being spent.`));
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
    flatLamports + Math.ceil(buyLamports * multiplier);
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
  console.log(`  Show for import  npm run round -- owner --round ${record.roundId} --show-secret`);
  console.log(`  Transaction      https://solscan.io/tx/${result.signature}`);
  console.log(`  pump.fun         https://pump.fun/coin/${result.mint}\n`);
  return record;
}

async function distribute() {
  const record = loadRound(config.roundId);
  if (!record?.launch) die("This round has not launched yet.");
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
  const ownerRounds = launchedRounds.filter((record) => record.ownerWallet);
  const hasLegacyCreator = launchedRounds.some((record) => !record.ownerWallet);
  if (launchedRounds.length === 0) {
    die("No launched rounds were found.");
  }
  const minClaimNetLamports = Math.ceil(
    num(option("min-claim"), 0.00005) * 1e9,
  );

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
      const net = await estimateCreatorFeeClaimNetLamports(
        config,
        depositWallet,
      );
      console.log(
        `  legacy     ${short(depositWallet.publicKey.toBase58())} · ${sol(pending)} bonding vault · ${sol(net)} estimated net`,
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
      const net = await estimateCreatorFeeClaimNetLamports(config, ownerWallet);
      console.log(
        `  ${label} ${short(ownerWallet.publicKey.toBase58())} · ${sol(pending)} bonding vault · ${sol(net)} estimated net · ${sol(balance)} wallet`,
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
      const prepared = await prepareCreatorFeeClaim(config, wallet);
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

function owner() {
  const roundId = config.roundId;
  const record = loadRound(roundId);
  if (!record?.ownerWallet) die(`Round #${roundId} has no separate owner wallet.`);
  const wallet = loadOwnerWallet(roundId, record.ownerWallet.address);

  console.log(`\n${C.bold(`Owner wallet · round #${String(roundId).padStart(3, "0")}`)}`);
  console.log(`  Address          ${wallet.publicKey.toBase58()}`);
  console.log(`  Private key      ${ownerWalletRelativeFile(roundId)} ${C.dim("(chmod 600)")}`);
  if (flag("show-secret")) {
    console.log(`  Import secret    ${ownerSecretBase58(roundId)}`);
    console.log(C.yellow("  Keep this secret offline. Anyone with it controls the creator wallet."));
  } else {
    console.log(`  Show for import  npm run round -- owner --round ${roundId} --show-secret`);
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
  parseWallet(config.walletSecret);
  if (loadRound(config.roundId)?.launch && !flag("force")) {
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

  while (Date.now() < config.closesAt) {
    const left = config.closesAt - Date.now();
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

/* --------------------------------- run ---------------------------------- */

try {
  if (command === "status") await status();
  else if (command === "scan") await scan();
  else if (command === "launch") await launch();
  else if (command === "distribute") await distribute();
  else if (command === "rewards") await rewards();
  else if (command === "owner") owner();
  else if (command === "auto") await auto();
  else if (command === "go") {
    await launch();
    await distribute();
  } else {
    console.log(
      [
        "",
        "Usage: npm run round <status|scan|launch|distribute|rewards|owner|auto|go> [options]",
        "",
        "  --yes         confirm a command that spends SOL",
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
