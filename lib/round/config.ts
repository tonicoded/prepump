/**
 * Configuration shared by the Next.js routes and the command line scripts.
 * Deliberately free of `server-only` and path aliases so plain `node` can
 * import it.
 */

export type RoundConfig = {
  roundId: number;
  opensAt: number;
  closesAt: number;

  rpcUrl: string;
  walletSecret?: string;

  /** Optional. Without it, uploads go through pump.fun's own IPFS endpoint. */
  pinataJwt?: string;
  pinataGateway: string;
  pumpFunIpfsUrl: string;

  pumpPortalUrl: string;
  slippage: number;
  priorityFee: number;
  /** Kept in the wallet for fees and rent instead of being spent on the buy. */
  reserveSol: number;
  /** pump.fun's create fee plus the rent for the mint and metadata accounts. */
  createCostSol: number;
  /** Used when a round has no deposits, or in the dev portal. */
  fallbackBuySol: number;

  devCutPercent: number;

  links: { twitter: string; telegram: string; website: string };

  openAiApiKey?: string;
  openAiModel: string;
  openAiImageModel: string;
  openAiImageQuality: string;
  openAiImageSize: string;
  tokenImageSize: number;
};

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function num(value: string | undefined, fallback: number) {
  const parsed = Number(clean(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function timestamp(value: string | undefined, fallback: number) {
  const raw = clean(value);
  if (!raw) return fallback;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readRoundConfig(env = process.env): RoundConfig {
  const closesAt = timestamp(env.ROUND_CLOSES_AT, 0);
  // A round that only says when it closes is assumed to have been open for one
  // cycle before that, so ROUND_OPENS_AT is optional.
  const lengthHours = num(env.ROUND_LENGTH_HOURS, 168);
  const opensAt =
    timestamp(env.ROUND_OPENS_AT, 0) ||
    (closesAt ? closesAt - lengthHours * 3_600_000 : 0);

  return {
    roundId: Math.max(1, Math.trunc(num(env.ROUND_ID, 1))),
    opensAt,
    closesAt,

    rpcUrl: clean(env.SOLANA_RPC_URL) ?? "https://api.mainnet-beta.solana.com",
    walletSecret: clean(env.LAUNCH_WALLET_SECRET_KEY),

    pinataJwt: clean(env.PINATA_JWT),
    pinataGateway:
      clean(env.PINATA_GATEWAY_URL)?.replace(/\/+$/, "") ??
      "https://gateway.pinata.cloud/ipfs",

    pumpFunIpfsUrl:
      clean(env.PUMPFUN_IPFS_URL) ?? "https://pump.fun/api/ipfs",

    pumpPortalUrl:
      clean(env.PUMPPORTAL_TRADE_URL) ??
      "https://pumpportal.fun/api/trade-local",
    slippage: num(env.PUMPFUN_SLIPPAGE, 10),
    priorityFee: num(env.PUMPFUN_PRIORITY_FEE, 0.00005),
    reserveSol: num(env.ROUND_RESERVE_SOL, 0),
    createCostSol: num(env.ROUND_CREATE_COST_SOL, 0.035),
    fallbackBuySol: num(env.PUMPFUN_DEV_BUY_SOL, 0.01),

    devCutPercent: num(env.DEV_CUT_PERCENT, 2),

    links: {
      twitter: clean(env.TOKEN_LINK_TWITTER) ?? "",
      telegram: clean(env.TOKEN_LINK_TELEGRAM) ?? "",
      website: clean(env.TOKEN_LINK_WEBSITE) ?? "",
    },

    openAiApiKey: clean(env.OPENAI_API_KEY),
    openAiModel: clean(env.OPENAI_MODEL) ?? "gpt-5.6-luna",
    openAiImageModel: clean(env.OPENAI_IMAGE_MODEL) ?? "gpt-image-2.5-flare",
    openAiImageQuality: clean(env.OPENAI_IMAGE_QUALITY) ?? "medium",
    openAiImageSize: clean(env.OPENAI_IMAGE_SIZE) ?? "1024x1024",
    tokenImageSize: num(env.TOKEN_IMAGE_SIZE, 512),
  };
}
