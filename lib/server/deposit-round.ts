import "server-only";
import { PublicKey } from "@solana/web3.js";
import { readRoundConfig } from "../round/config";
import { loadRound } from "../round/store";
import { depositWindowState, type PublicDepositRound } from "../round/window";

export function getDepositRound(): PublicDepositRound {
  const config = readRoundConfig();
  const serverNow = Date.now();
  let depositAddress: string | null = null;
  try {
    depositAddress = new PublicKey(process.env.NEXT_PUBLIC_DEPOSIT_ADDRESS ?? "").toBase58();
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
