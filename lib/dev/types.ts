export type DevRoundPhase =
  | "UPCOMING"
  | "OPEN"
  | "LOCKED"
  | "GENERATING"
  | "READY"
  | "LAUNCHED";

export type GeneratedMeme = {
  name: string;
  ticker: string;
  tagline: string;
  description: string;
  imagePrompt: string;
  /** Visual style the artwork was rendered in. */
  style?: string;
  /** Short printed text on the artwork, when the joke has one. */
  slogan?: string;
  /** data: URL produced by the image model, when one was generated. */
  imageDataUrl?: string;
  /** Set when the text came back but the artwork call failed. */
  imageError?: string;
};

export type DevConfigStatus = {
  portalEnabled: boolean;
  executionMode: "simulate" | "live";
  rpcHost: string;
  accessTokenConfigured: boolean;
  roundId: number;
  openAiConfigured: boolean;
  launchWalletConfigured: boolean;
  ipfsProvider: "pinata" | "pump.fun";
  devBuySol: number;
};

export type LaunchWalletStatus = {
  address: string | null;
  balanceSol: number | null;
  error?: string;
};

export type LaunchReceipt = {
  mode: "simulate" | "live";
  mint: string;
  signature: string;
  metadataUri: string;
  imageUri: string;
  devBuySol: number;
  launchedAt: string;
  explorerTx: string;
  pumpFunUrl: string;
};
