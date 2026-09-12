import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

type StoredOwnerWallet = {
  address: string;
  secretKey: string;
  createdAt: string;
};

const OWNER_DIR = path.join(process.cwd(), ".round", "owners");

export function ownerWalletFile(roundId: number) {
  return path.join(
    OWNER_DIR,
    `round-${String(roundId).padStart(3, "0")}-owner.json`,
  );
}

export function ownerWalletRelativeFile(roundId: number) {
  return path.relative(process.cwd(), ownerWalletFile(roundId));
}

function readStoredOwner(roundId: number): StoredOwnerWallet | null {
  try {
    return JSON.parse(
      readFileSync(ownerWalletFile(roundId), "utf8"),
    ) as StoredOwnerWallet;
  } catch {
    return null;
  }
}

function keypairFromStored(stored: StoredOwnerWallet) {
  const wallet = Keypair.fromSecretKey(bs58.decode(stored.secretKey));
  if (wallet.publicKey.toBase58() !== stored.address) {
    throw new Error("Owner wallet file has an invalid address/secret pair.");
  }
  return wallet;
}

/**
 * Creates exactly one owner wallet per round. The secret is persisted before
 * any funds move, with owner-only file permissions, so a crash or retry cannot
 * strand SOL in an unknown keypair or silently create a second creator.
 */
export function loadOrCreateOwnerWallet(roundId: number) {
  const existing = readStoredOwner(roundId);
  if (existing) return keypairFromStored(existing);

  const wallet = Keypair.generate();
  const stored: StoredOwnerWallet = {
    address: wallet.publicKey.toBase58(),
    secretKey: bs58.encode(wallet.secretKey),
    createdAt: new Date().toISOString(),
  };

  mkdirSync(OWNER_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(ownerWalletFile(roundId), JSON.stringify(stored, null, 2), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(ownerWalletFile(roundId), 0o600);
  return wallet;
}

export function loadOwnerWallet(roundId: number, expectedAddress?: string) {
  const stored = readStoredOwner(roundId);
  if (!stored) {
    throw new Error(
      `Owner key is missing: ${ownerWalletRelativeFile(roundId)}`,
    );
  }
  const wallet = keypairFromStored(stored);
  if (expectedAddress && wallet.publicKey.toBase58() !== expectedAddress) {
    throw new Error("Owner key does not match the address in the round record.");
  }
  return wallet;
}

export function ownerSecretBase58(roundId: number) {
  const stored = readStoredOwner(roundId);
  if (!stored) {
    throw new Error(
      `Owner key is missing: ${ownerWalletRelativeFile(roundId)}`,
    );
  }
  keypairFromStored(stored);
  return stored.secretKey;
}
