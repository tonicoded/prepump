import "server-only";
import { PublicKey } from "@solana/web3.js";
import { readRoundConfig } from "../round/config";
import { loadRound } from "../round/store";
import { depositWindowState, type PublicDepositRound } from "../round/window";

// Built at runtime on purpose: the bundler folds even a string constant here.
const DEPOSIT_ADDRESS_ENV = ["NEXT_PUBLIC", "DEPOSIT", "ADDRESS"].join("_");

export function getDepositRound(): PublicDepositRound {
  const config = readRoundConfig();
  const serverNow = Date.now();
  let depositAddress: string | null = null;
  try {
    // Read at runtime. `process.env.NEXT_PUBLIC_*` is frozen into the build, so
    // a new round's address would otherwise keep serving the previous wallet.
    depositAddress = new PublicKey(process.env[DEPOSIT_ADDRESS_ENV] ?? "").toBase58();
  } catch { /* Fail closed without a valid published destination. */ }
  return {
    roundId: config.roundId,
    opensAt: config.opensAt,
    closesAt: config.closesAt,
    serverNow,
    status: loadRound(config.roundId)?.launch
      ? "LAUNCHED"
      : depositWindowState(config, serverNow),
    depositAddress,
  };
}
