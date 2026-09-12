import "server-only";

import { readRoundConfig } from "@/lib/round/config";
import {
  createPumpToken as createToken,
  getBalanceForAddress,
  getWalletBalance,
  LaunchError,
  parseWallet,
  type TokenDraft,
} from "@/lib/round/pumpfun";
import type { ServerEnv } from "@/lib/server/env";

export { LaunchError };
export type { TokenDraft };

/** The dev portal reads the same configuration the CLI scripts use. */
export function parseLaunchWallet(secret: string | undefined) {
  return parseWallet(secret);
}

export async function getLaunchWalletBalance(address?: string) {
  const config = readRoundConfig();
  return address
    ? getBalanceForAddress(config, address)
    : getWalletBalance(config);
}

export async function createPumpToken(env: ServerEnv, draft: TokenDraft) {
  return createToken(readRoundConfig(), draft, env.devBuySol);
}
