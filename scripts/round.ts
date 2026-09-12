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

import { Connection, PublicKey } from "@solana/web3.js";
import { readRoundConfig } from "../lib/round/config.ts";
import {
  loadRound,
  saveRound,
  roundFile,
  type Payout,
  type RoundRecord,
} from "../lib/round/store.ts";
import { scanDeposits } from "../lib/round/deposits.ts";
import { generateMeme } from "../lib/round/meme.ts";
import { createPumpToken, parseWallet } from "../lib/round/pumpfun.ts";
import { allocate, readTokenBalance, sendPayouts } from "../lib/round/distribute.ts";

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

/** `--last 90` scans the past 90 minutes instead of the configured window. */
const lastMinutes = Number(option("last"));
if (Number.isFinite(lastMinutes) && lastMinutes > 0) {
  config.closesAt = Date.now();
  config.opensAt = config.closesAt - lastMinutes * 60_000;
}

const connection = new Connection(config.rpcUrl, "confirmed");

const sol = (lamports: number) => (lamports / 1e9).toFixed(4);
const short = (value: string) => `${value.slice(0, 4)}…${value.slice(-4)}`;
const stamp = (ms: number) =>
  ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "not set";


function die(message: string): never {
  console.error(`\n${C.red("✖")} ${message}\n`);
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
  console.log(`  Create + rent    ${config.createCostSol} SOL  ${C.dim("(owed whatever the buy is)")}`);
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

  console.log(`\n${C.bold("Scanning deposits")}`);
  console.log(`  ${wallet.publicKey.toBase58()}`);
  console.log(`  ${stamp(config.opensAt)} → ${stamp(config.closesAt)}\n`);

  const result = await scanDeposits(
    connection,
    wallet.publicKey,
    config.opensAt,
    config.closesAt,
    (n) => process.stdout.write(`\r  ${n} transactions inspected…   `),
  );
  process.stdout.write("\r".padEnd(48) + "\r");

  const record = loadRound(config.roundId) ?? blankRecord(wallet.publicKey.toBase58());
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
  const wallet = parseWallet(config.walletSecret);

  let record = loadRound(config.roundId);
  if (record?.launch && !flag("force")) {
    die(`Round #${config.roundId} already launched: ${record.launch.mint}. Pass --force to launch again.`);
  }
  if (Date.now() < config.closesAt && !flag("now")) {
    die(`The round closes at ${stamp(config.closesAt)}. Pass --now to launch early.`);
  }

  record = record?.scannedAt ? record : await scan();
  if (!record) die("Nothing to launch.");

  const balance = await connection.getBalance(wallet.publicKey);
  const pooledSol = record.totalLamports / 1e9;

  // pump.fun's create fee and the mint/metadata rent come off the top: they
  // are owed whatever the buy is.
  const overhead = config.createCostSol + config.priorityFee + config.reserveSol;
  const spendable = balance / 1e9 - overhead;
  const forced = Number(option("buy"));
  const target = Number.isFinite(forced) && forced >= 0 ? forced : pooledSol;
  const buySol = Number(Math.max(0, Math.min(target, spendable)).toFixed(6));

  if (spendable < 0) {
    die(
      `Wallet holds ${sol(balance)} SOL. A launch needs about ${overhead.toFixed(4)} SOL ` +
        `before any buy: pump.fun charges a create fee and the mint and metadata ` +
        `accounts need rent. Top the wallet up.`,
    );
  }

  console.log(`\n${C.bold("T-0 sequence")}`);
  console.log(`  Wallet           ${sol(balance)} SOL`);
  console.log(`  Pooled           ${pooledSol.toFixed(4)} SOL from ${record.deposits.length} wallets`);
  console.log(`  Create + rent    ${C.dim(`${overhead.toFixed(4)} SOL`)}`);
  console.log(`  Buying with      ${C.bold(`${buySol} SOL`)}${buySol === 0 ? C.dim("  (create only, no buy)") : ""}`);
  if (Number.isFinite(forced)) console.log(C.dim(`  Buy forced with --buy ${forced}`));
  if (!Number.isFinite(forced) && buySol < pooledSol) {
    console.log(C.yellow(`  Capped by the wallet balance; ${(pooledSol - buySol).toFixed(4)} SOL of deposits is not being spent.`));
  }

  if (!flag("yes")) {
    die("Add --yes to confirm. This spends real SOL and creates a real token.");
  }

  process.stdout.write("  Generating meme… ");
  const meme = await generateMeme(config, process.env.ROUND_THEME, true);
  console.log(C.green(`${meme.name} ($${meme.ticker})`));
  if (meme.imageError) console.log(C.yellow(`  ${meme.imageError}`));
  if (!meme.imageDataUrl && !flag("no-art")) {
    die("The artwork failed. Re-run, or pass --no-art to launch with the PREPUMP mark.");
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
  console.log(`  Transaction      https://solscan.io/tx/${result.signature}`);
  console.log(`  pump.fun         https://pump.fun/coin/${result.mint}\n`);
  return record;
}

async function distribute() {
  const wallet = parseWallet(config.walletSecret);
  const record = loadRound(config.roundId);
  if (!record?.launch) die("This round has not launched yet.");

  const mint = new PublicKey(record.launch.mint);
  const supply = await connection.getTokenSupply(mint);
  const decimals = supply.value.decimals;
  const { amount } = await readTokenBalance(connection, wallet.publicKey, mint);

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

/* --------------------------------- run ---------------------------------- */

try {
  if (command === "status") await status();
  else if (command === "scan") await scan();
  else if (command === "launch") await launch();
  else if (command === "distribute") await distribute();
  else if (command === "go") {
    await launch();
    await distribute();
  } else {
    console.log(
      [
        "",
        "Usage: npm run round <status|scan|launch|distribute|go> [options]",
        "",
        "  --yes         confirm a command that spends SOL",
        "  --now         launch before ROUND_CLOSES_AT",
        "  --force       launch a round that already launched",
        "  --last <min>  use the past N minutes as the round window",
        "  --buy <sol>   override the buy amount",
        "  --no-art      launch even if the artwork failed",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
} catch (error) {
  die(error instanceof Error ? error.message : String(error));
}
