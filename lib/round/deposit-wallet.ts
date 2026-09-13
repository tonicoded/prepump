import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { roundDataDir } from "./store.ts";

type StoredDepositWallet = {
  roundId: number;
  address: string;
  secretKey: string;
  createdAt: string;
};

const depositDir = () => path.join(roundDataDir(), "deposits");

export function depositWalletFile(roundId: number) {
  return path.join(
    depositDir(),
    `round-${String(roundId).padStart(3, "0")}-deposit.json`,
  );
}

export function depositWalletRelativeFile(roundId: number) {
  return path.relative(process.cwd(), depositWalletFile(roundId));
}

function readStored(roundId: number): StoredDepositWallet | null {
  const file = depositWalletFile(roundId);
  if (!existsSync(file)) return null;
  // A present but unreadable key file must stop everything, never be replaced.
  return JSON.parse(readFileSync(file, "utf8")) as StoredDepositWallet;
}

function toKeypair(stored: StoredDepositWallet) {
  const wallet = Keypair.fromSecretKey(bs58.decode(stored.secretKey));
  if (wallet.publicKey.toBase58() !== stored.address) {
    throw new Error("Deposit wallet file has an invalid address/secret pair.");
  }
  return wallet;
}

/** The round's deposit wallet, or null when it has not been created yet. */
export function loadDepositWallet(roundId: number) {
  const stored = readStored(roundId);
  return stored ? toKeypair(stored) : null;
}

/**
 * One fresh deposit wallet per round. The secret is written with owner-only
 * permissions before the address is ever published, and an existing file is
 * never overwritten.
 */
export function loadOrCreateDepositWallet(roundId: number) {
  const existing = loadDepositWallet(roundId);
  if (existing) return existing;

  const wallet = Keypair.generate();
  const stored: StoredDepositWallet = {
    roundId,
    address: wallet.publicKey.toBase58(),
    secretKey: bs58.encode(wallet.secretKey),
    createdAt: new Date().toISOString(),
  };

  mkdirSync(depositDir(), { recursive: true, mode: 0o700 });
  writeFileSync(depositWalletFile(roundId), JSON.stringify(stored, null, 2), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(depositWalletFile(roundId), 0o600);
  return wallet;
}

export function depositSecretBase58(roundId: number) {
  const stored = readStored(roundId);
  if (!stored) {
    throw new Error(
      `Deposit key is missing: ${depositWalletRelativeFile(roundId)}`,
    );
  }
  toKeypair(stored);
  return stored.secretKey;
}
