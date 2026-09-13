import "server-only";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { DevConfigStatus } from "@/lib/dev/types";

const modeSchema = z.enum(["simulate", "live"]);

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function num(value: string | undefined, fallback: number) {
  const parsed = Number(clean(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getServerEnv() {
  const rpcUrl =
    clean(process.env.SOLANA_RPC_URL) ?? "https://api.mainnet-beta.solana.com";

  return {
    portalEnabled:
      process.env.NODE_ENV !== "production" ||
      process.env.DEV_PORTAL_ENABLED === "true",
    /** Puts the live deposit card on the homepage. */
    homeDepositsEnabled: process.env.HOME_DEPOSITS_ENABLED === "true",
    accessToken: clean(process.env.DEV_PORTAL_ACCESS_TOKEN),

    /** simulate = nothing is broadcast. live = real mainnet launch. */
    executionMode: modeSchema
      .catch("simulate")
      .parse(process.env.PREPUMP_EXECUTION_MODE),

    rpcUrl,
    launchWalletSecret: clean(process.env.LAUNCH_WALLET_SECRET_KEY),
    /** Lets a deployment show the deposit address without holding the key. */
    depositAddress: clean(process.env.NEXT_PUBLIC_DEPOSIT_ADDRESS),

    pinataJwt: clean(process.env.PINATA_JWT),
    pinataGateway:
      clean(process.env.PINATA_GATEWAY_URL)?.replace(/\/+$/, "") ??
      "https://ipfs.io/ipfs",

    pumpPortalUrl:
      clean(process.env.PUMPPORTAL_TRADE_URL) ??
      "https://pumpportal.fun/api/trade-local",
    devBuySol: num(process.env.PUMPFUN_DEV_BUY_SOL, 0.01),
    slippage: num(process.env.PUMPFUN_SLIPPAGE, 10),
    priorityFee: num(process.env.PUMPFUN_PRIORITY_FEE, 0.00005),

    tokenTwitter: clean(process.env.TOKEN_LINK_TWITTER) ?? "",
    tokenTelegram: clean(process.env.TOKEN_LINK_TELEGRAM) ?? "",
    tokenWebsite: clean(process.env.TOKEN_LINK_WEBSITE) ?? "",

    openAiApiKey: clean(process.env.OPENAI_API_KEY),
    openAiModel: clean(process.env.OPENAI_MODEL) ?? "gpt-5.6-luna",
    openAiImageModel:
      clean(process.env.OPENAI_IMAGE_MODEL) ?? "gpt-image-2.5-flare",
    openAiImageQuality: clean(process.env.OPENAI_IMAGE_QUALITY) ?? "medium",
    openAiImageSize: clean(process.env.OPENAI_IMAGE_SIZE) ?? "1024x1024",
    /** Final square the artwork is resized to before it is pinned. */
    tokenImageSize: num(process.env.TOKEN_IMAGE_SIZE, 512),
  };
}

export type ServerEnv = ReturnType<typeof getServerEnv>;

export function getPublicDevConfig(): DevConfigStatus {
  const env = getServerEnv();
  return {
    portalEnabled: env.portalEnabled,
    executionMode: env.executionMode,
    rpcHost: safeHost(env.rpcUrl),
    accessTokenConfigured: Boolean(env.accessToken),
    /** The browser resets its local round when this changes. */
    roundId: Math.max(1, Math.trunc(Number(process.env.ROUND_ID) || 1)),
    openAiConfigured: Boolean(env.openAiApiKey),
    launchWalletConfigured: Boolean(env.launchWalletSecret || env.depositAddress),
    ipfsProvider: env.pinataJwt ? ("pinata" as const) : ("pump.fun" as const),
    devBuySol: env.devBuySol,
  };
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-rpc-url";
  }
}

function safeTokenMatch(expected: string, provided: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class DevAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DevAccessError";
  }
}

export function assertDevAccess(request: Request) {
  const env = getServerEnv();
  if (!env.portalEnabled) {
    throw new DevAccessError("Dev portal is disabled.", 404);
  }

  // No token configured means no token required; DEV_PORTAL_ENABLED is what
  // decides whether the portal exists at all.
  if (!env.accessToken) return env;

  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const provided = request.headers.get("x-dev-token") ?? bearer ?? "";
  if (!safeTokenMatch(env.accessToken, provided)) {
    throw new DevAccessError("Invalid dev portal token.", 401);
  }
  return env;
}

export function devErrorResponse(error: unknown) {
  if (error instanceof DevAccessError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message =
    error instanceof Error ? error.message : "Unexpected server error";
  return Response.json({ error: message }, { status: 500 });
}
