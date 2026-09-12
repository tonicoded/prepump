import type { Commitment, Round, TxPhase } from "@/lib/types";
import { PAST_ROUNDS, UPCOMING_ROUND } from "@/lib/rounds";

/**
 * Every blockchain interaction goes through this interface. Replace the
 * implementation below with an Anchor/web3.js client once the PREPUMP program
 * is deployed; no component needs to change.
 */
export interface PrepumpClient {
  getBalance(wallet: string): Promise<bigint | null>;
  fetchRound(id: number): Promise<Round | undefined>;
  fetchCommitment(wallet: string, roundId: number): Promise<Commitment | null>;
  commit(
    params: { wallet: string; roundId: number; lamports: bigint },
    onPhase: (phase: TxPhase, signature?: string) => void,
  ): Promise<string>;
  claim(
    params: { wallet: string; roundId: number },
    onPhase: (phase: TxPhase, signature?: string) => void,
  ): Promise<string>;
}

import { BROWSER_RPC } from "@/lib/round/rpc";

/** Same-origin proxy unless a browser-capable endpoint is configured. */
export const RPC_ENDPOINT = BROWSER_RPC;

class ProgramNotDeployedError extends Error {
  constructor() {
    super("The PREPUMP program is not deployed yet.");
    this.name = "ProgramNotDeployedError";
  }
}

/**
 * Reads real balances over JSON-RPC. Writes are unavailable until the program
 * exists — they throw rather than pretending to succeed.
 */
export const client: PrepumpClient = {
  async getBalance(wallet) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(RPC_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [wallet],
        }),
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const json = (await res.json()) as {
        result?: { value?: number };
      };
      const value = json.result?.value;
      return typeof value === "number" ? BigInt(value) : null;
    } catch {
      // Rate limited, offline or blocked: show nothing rather than a guess.
      return null;
    }
  },

  async fetchRound(id) {
    return [UPCOMING_ROUND, ...PAST_ROUNDS].find((r) => r.id === id);
  },

  async fetchCommitment() {
    return null;
  },

  async commit() {
    throw new ProgramNotDeployedError();
  },

  async claim() {
    throw new ProgramNotDeployedError();
  },
};
