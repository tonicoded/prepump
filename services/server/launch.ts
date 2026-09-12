import "server-only";

import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { z } from "zod";
import type { LaunchReceipt } from "@/lib/dev/types";
import { getServerEnv } from "@/lib/server/env";
import { LaunchError, createPumpToken } from "@/services/server/pumpfun";

export const launchRequestSchema = z.object({
  roundId: z.number().int().positive(),
  token: z.object({
    name: z.string().min(2).max(32),
    ticker: z.string().regex(/^[A-Z0-9]{2,10}$/),
    description: z.string().min(1).max(400),
    imageDataUrl: z.string().startsWith("data:").optional(),
  }),
  /** Typed by hand in the UI before a live launch can proceed. */
  confirmation: z.string().optional(),
});

export type LaunchRequest = z.infer<typeof launchRequestSchema>;

export const liveConfirmationPhrase = (roundId: number) =>
  `LAUNCH ${String(roundId).padStart(3, "0")}`;

function simulate(input: LaunchRequest, devBuySol: number): LaunchReceipt {
  const mint = Keypair.generate().publicKey.toBase58();
  const signature = randomBytes(32).toString("hex");
  return {
    mode: "simulate",
    mint,
    signature,
    metadataUri: "ipfs://simulated-metadata",
    imageUri: "ipfs://simulated-image",
    devBuySol,
    launchedAt: new Date().toISOString(),
    explorerTx: `https://solscan.io/tx/${signature}`,
    pumpFunUrl: `https://pump.fun/coin/${mint}`,
  };
}

/**
 * Simulate mode never touches the network. Live mode performs a real mainnet
 * pump.fun launch and is gated behind the execution mode plus a typed phrase,
 * so it cannot happen by accident.
 */
export async function launchRound(input: LaunchRequest): Promise<LaunchReceipt> {
  const env = getServerEnv();

  if (env.executionMode === "simulate") return simulate(input, env.devBuySol);

  if (input.confirmation !== liveConfirmationPhrase(input.roundId)) {
    throw new LaunchError(
      `Type "${liveConfirmationPhrase(input.roundId)}" to authorise a live launch.`,
    );
  }
  if (!env.launchWalletSecret) {
    throw new LaunchError("LAUNCH_WALLET_SECRET_KEY is not set.");
  }

  const result = await createPumpToken(env, {
    name: input.token.name,
    symbol: input.token.ticker,
    description: input.token.description,
    imageDataUrl: input.token.imageDataUrl,
  });

  return {
    mode: "live",
    mint: result.mint,
    signature: result.signature,
    metadataUri: result.metadataUri,
    imageUri: result.imageUri,
    devBuySol: env.devBuySol,
    launchedAt: new Date().toISOString(),
    explorerTx: `https://solscan.io/tx/${result.signature}`,
    pumpFunUrl: `https://pump.fun/coin/${result.mint}`,
  };
}
