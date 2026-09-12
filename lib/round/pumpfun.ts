import { readFile } from "node:fs/promises";
import path from "node:path";
import bs58 from "bs58";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import type { RoundConfig } from "./config.ts";

/**
 * pump.fun token creation over the PumpPortal local-transaction API.
 *
 *   1. pin the image to IPFS
 *   2. pin metadata JSON pointing at it
 *   3. ask pumpportal.fun for a serialized create transaction
 *   4. sign locally with the mint keypair and the launch wallet
 *   5. broadcast through our own RPC and wait for confirmation
 *
 * The secret key never leaves this process and is never sent to PumpPortal:
 * the API hands back an unsigned transaction.
 */

export type TokenDraft = {
  name: string;
  symbol: string;
  description: string;
  imageDataUrl?: string;
};

export class LaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaunchError";
  }
}

/** Accepts a base58 secret key (Phantom export) or a JSON byte array. */
export function parseWallet(secret: string | undefined): Keypair {
  if (!secret) throw new LaunchError("LAUNCH_WALLET_SECRET_KEY is not set.");

  const trimmed = secret.trim();
  try {
    if (trimmed.startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
    }
    return Keypair.fromSecretKey(bs58.decode(trimmed));
  } catch {
    throw new LaunchError(
      "LAUNCH_WALLET_SECRET_KEY must be a base58 secret key or a JSON byte array.",
    );
  }
}

function decodeDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new LaunchError("Token image is not a base64 data URL.");
  return { bytes: Buffer.from(match[2], "base64"), mime: match[1] };
}

async function fallbackImage() {
  const file = path.join(process.cwd(), "public", "prepump-mark.png");
  return { bytes: await readFile(file), mime: "image/png" };
}

async function pinFile(config: RoundConfig, blob: Blob, filename: string) {
  const response = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.pinataJwt}` },
    body: (() => {
      const form = new FormData();
      form.append("network", "public");
      form.append("file", blob, filename);
      return form;
    })(),
  });

  if (!response.ok) {
    throw new LaunchError(
      `Pinata upload failed (${response.status}): ${await response.text()}`,
    );
  }

  const payload = (await response.json()) as { data?: { cid?: string } };
  const cid = payload.data?.cid;
  if (!cid) throw new LaunchError("Pinata returned no CID.");
  return `${config.pinataGateway}/${cid}`;
}

/** Pinata: two uploads, pinned under an account you control. */
async function uploadViaPinata(
  config: RoundConfig,
  draft: TokenDraft,
  image: { bytes: Buffer; mime: string },
) {
  const extension = image.mime.split("/")[1] ?? "png";
  const imageUri = await pinFile(
    config,
    new Blob([new Uint8Array(image.bytes)], { type: image.mime }),
    `${draft.symbol.toLowerCase()}.${extension}`,
  );

  const metadataUri = await pinFile(
    config,
    new Blob(
      [
        JSON.stringify({
          name: draft.name,
          symbol: draft.symbol,
          description: draft.description,
          image: imageUri,
          showName: true,
          twitter: config.links.twitter,
          telegram: config.links.telegram,
          website: config.links.website,
        }),
      ],
      { type: "application/json" },
    ),
    `${draft.symbol.toLowerCase()}.json`,
  );

  return { imageUri, metadataUri };
}

/** pump.fun's own endpoint: one upload, no account, what their site uses. */
async function uploadViaPumpFun(
  config: RoundConfig,
  draft: TokenDraft,
  image: { bytes: Buffer; mime: string },
) {
  const extension = image.mime.split("/")[1] ?? "png";
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(image.bytes)], { type: image.mime }),
    `${draft.symbol.toLowerCase()}.${extension}`,
  );
  form.append("name", draft.name);
  form.append("symbol", draft.symbol);
  form.append("description", draft.description);
  form.append("twitter", config.links.twitter);
  form.append("telegram", config.links.telegram);
  form.append("website", config.links.website);
  form.append("showName", "true");

  const response = await fetch(config.pumpFunIpfsUrl, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new LaunchError(
      `pump.fun IPFS upload failed (${response.status}): ${await response.text()}`,
    );
  }

  const payload = (await response.json()) as {
    metadataUri?: string;
    metadata?: { image?: string };
  };
  if (!payload.metadataUri) {
    throw new LaunchError("pump.fun IPFS returned no metadata URI.");
  }

  return {
    imageUri: payload.metadata?.image ?? "",
    metadataUri: payload.metadataUri,
  };
}

export async function uploadTokenAssets(
  config: RoundConfig,
  draft: TokenDraft,
) {
  const image = draft.imageDataUrl
    ? decodeDataUrl(draft.imageDataUrl)
    : await fallbackImage();

  return config.pinataJwt
    ? uploadViaPinata(config, draft, image)
    : uploadViaPumpFun(config, draft, image);
}

export async function confirmSignature(
  connection: Connection,
  signature: string,
  timeoutMs = 90_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) {
      throw new LaunchError(
        `Transaction failed on chain: ${JSON.stringify(status.err)}`,
      );
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new LaunchError(
    `Transaction ${signature} was not confirmed within ${timeoutMs / 1000}s.`,
  );
}

export async function getWalletBalance(config: RoundConfig) {
  const wallet = parseWallet(config.walletSecret);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const lamports = await connection.getBalance(wallet.publicKey);
  return { address: wallet.publicKey.toBase58(), balanceSol: lamports / 1e9 };
}

export async function createPumpToken(
  config: RoundConfig,
  draft: TokenDraft,
  buySol: number,
) {
  const wallet = parseWallet(config.walletSecret);
  const connection = new Connection(config.rpcUrl, "confirmed");

  const balance = await connection.getBalance(wallet.publicKey);
  const required = (buySol + config.priorityFee + config.createCostSol) * 1e9;
  if (balance < required) {
    throw new LaunchError(
      `Launch wallet holds ${(balance / 1e9).toFixed(4)} SOL. A ${buySol} SOL buy needs ` +
        `${(required / 1e9).toFixed(4)} SOL, because pump.fun's create fee and the mint ` +
        `and metadata rent cost about ${config.createCostSol} SOL on top of the buy.`,
    );
  }

  const { imageUri, metadataUri } = await uploadTokenAssets(config, draft);
  const mintKeypair = Keypair.generate();

  const response = await fetch(config.pumpPortalUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      publicKey: wallet.publicKey.toBase58(),
      action: "create",
      tokenMetadata: {
        name: draft.name,
        symbol: draft.symbol,
        uri: metadataUri,
      },
      mint: mintKeypair.publicKey.toBase58(),
      denominatedInSol: "true",
      amount: buySol,
      slippage: config.slippage,
      priorityFee: config.priorityFee,
      pool: "pump",
    }),
  });

  if (!response.ok) {
    throw new LaunchError(
      `pump.fun create failed (${response.status}): ${await response.text()}`,
    );
  }

  const transaction = VersionedTransaction.deserialize(
    new Uint8Array(await response.arrayBuffer()),
  );
  transaction.sign([mintKeypair, wallet]);

  const signature = await connection.sendTransaction(transaction, {
    maxRetries: 3,
  });
  await confirmSignature(connection, signature);

  return {
    mint: mintKeypair.publicKey.toBase58(),
    signature,
    imageUri,
    metadataUri,
    buySol,
  };
}
