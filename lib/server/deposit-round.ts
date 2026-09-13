import "server-only";
import { PublicKey } from "@solana/web3.js";
import { readRoundConfig } from "../round/config";
import { loadRound, roundDataDir } from "../round/store";
import { depositWindowState, type PublicDepositRound } from "../round/window";
import { depositWalletLaunched } from "./launch-signal";

/** home = the public round. dev = a separate test round shown only on /dev. */
export type RoundScope = "home" | "dev";

// Built at runtime on purpose: the bundler folds even a string constant here.
const DEPOSIT_ADDRESS_ENV = ["NEXT_PUBLIC", "DEPOSIT", "ADDRESS"].join("_");

function scopeSettings(scope: RoundScope) {
  const env = process.env;
  // /dev only gets its own round when DEV_ROUND_CLOSES_AT is set; otherwise it
  // mirrors the public round.
  if (scope === "dev" && env.DEV_ROUND_CLOSES_AT?.trim()) {
    return {
      env: {
        ...env,
        ROUND_ID: env.DEV_ROUND_ID ?? "1",
        ROUND_OPENS_AT: env.DEV_ROUND_OPENS_AT,
        ROUND_CLOSES_AT: env.DEV_ROUND_CLOSES_AT,
      },
      address: env.DEV_DEPOSIT_ADDRESS,
      dataDir: env.DEV_ROUND_DATA_DIR?.trim()
        ? roundDataDir(env.DEV_ROUND_DATA_DIR.trim())
        : null,
    };
  }
  return { env, address: env[DEPOSIT_ADDRESS_ENV], dataDir: roundDataDir() };
}

export async function getDepositRound(scope: RoundScope = "home"): Promise<PublicDepositRound> {
  const settings = scopeSettings(scope);
  const config = readRoundConfig(settings.env);
  const serverNow = Date.now();
  let depositAddress: string | null = null;
  try {
    // Read at runtime. `process.env.NEXT_PUBLIC_*` is frozen into the build, so
    // a new round's address would otherwise keep serving the previous wallet.
    depositAddress = new PublicKey(settings.address ?? "").toBase58();
  } catch { /* Fail closed without a valid published destination. */ }
  const windowState = depositWindowState(config, serverNow);
  // The launch runs on the operator's machine, so the site also watches the
  // chain for it. Only rounds that have opened can have launched.
  const launched =
    (settings.dataDir && loadRound(config.roundId, settings.dataDir)?.launch) ||
    (depositAddress !== null &&
      (windowState === "OPEN" || windowState === "CLOSED") &&
      (await depositWalletLaunched(config.rpcUrl, depositAddress)));
  return {
    roundId: config.roundId,
    opensAt: config.opensAt,
    closesAt: config.closesAt,
    serverNow,
    status: launched ? "LAUNCHED" : windowState,
    depositAddress,
  };
}
