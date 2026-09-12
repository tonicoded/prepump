"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Commitment, Round, RoundStatus, TxState } from "@/lib/types";
import { PLATFORM_FEE_BPS, UPCOMING_ROUND } from "@/lib/rounds";
import { useNow } from "@/hooks/useCountdown";
import { useWallet } from "@/providers/WalletProvider";
import { client } from "@/services/chain";

const LOCK_MS = 6_000;
const LAUNCH_MS = 20_000;

/** Once a round is scheduled, its status follows the clock. */
function deriveStatus(round: Round, now: number): RoundStatus {
  if (round.closesAt === null) return round.status;
  const delta = now - round.closesAt;
  if (delta < 0) return "OPEN";
  if (delta < LOCK_MS) return "LOCKED";
  if (delta < LAUNCH_MS) return "LAUNCHING";
  return round.status === "COMPLETE" ? "COMPLETE" : "CLAIMABLE";
}

type RoundContextValue = {
  round: Round;
  status: RoundStatus;
  /** True only once the round has actually closed and revealed its token. */
  revealed: boolean;
  scheduled: boolean;
  commitment: Commitment | null;
  tx: TxState;
  claimTx: TxState;
  commit: (lamports: bigint) => Promise<void>;
  claim: () => Promise<void>;
  resetTx: () => void;
  estimateShare: (lamports: bigint) => number;
  estimateTokens: (lamports: bigint) => bigint;
};

const RoundContext = createContext<RoundContextValue | null>(null);

export function RoundProvider({ children }: { children: React.ReactNode }) {
  const { address } = useWallet();
  const now = useNow(1000);

  const [fetched, setFetched] = useState<Commitment | null>(null);
  const [txState, setTx] = useState<TxState>({ phase: "idle" });
  const [claimTxState, setClaimTx] = useState<TxState>({ phase: "idle" });

  const idle = useMemo<TxState>(() => ({ phase: "idle" }), []);
  const commitment = address ? fetched : null;
  const tx = address ? txState : idle;
  const claimTx = address ? claimTxState : idle;

  const round = UPCOMING_ROUND;
  const status = deriveStatus(round, now);
  const scheduled = round.closesAt !== null;
  const revealed =
    (status === "CLAIMABLE" || status === "COMPLETE") && !!round.tokenTicker;

  // A connected wallet's position is read from chain, never from local state.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    client.fetchCommitment(address, round.id).then((result) => {
      if (!cancelled) setFetched(result);
    });
    return () => {
      cancelled = true;
    };
  }, [address, round.id]);

  const estimateShare = useCallback(
    (lamports: bigint) => {
      const denominator = round.totalCommittedLamports + lamports;
      if (denominator === 0n) return 0;
      const mine = (commitment?.committedLamports ?? 0n) + lamports;
      return Number(mine) / Number(denominator);
    },
    [round.totalCommittedLamports, commitment],
  );

  const estimateTokens = useCallback(
    (lamports: bigint) => {
      const supply = round.distributableSupply ?? 0n;
      if (supply === 0n) return 0n;
      const fee = (PLATFORM_FEE_BPS ?? 0) / 10_000;
      const net = estimateShare(lamports) * (1 - fee);
      return BigInt(Math.floor(Number(supply / 1_000_000n) * net));
    },
    [round.distributableSupply, estimateShare],
  );

  const commit = useCallback(
    async (lamports: bigint) => {
      if (!address) return;
      const intent = `Commit ${(Number(lamports) / 1e9).toFixed(2)} SOL to round #${String(round.id).padStart(3, "0")}`;
      try {
        await client.commit(
          { wallet: address, roundId: round.id, lamports },
          (phase, signature) => setTx({ phase, signature, intent }),
        );
        const next = await client.fetchCommitment(address, round.id);
        setFetched(next);
      } catch (e) {
        setTx({
          phase: "failed",
          intent,
          error: e instanceof Error ? e.message : "Transaction failed",
        });
      }
    },
    [address, round.id],
  );

  const claim = useCallback(async () => {
    if (!address || !commitment) return;
    try {
      await client.claim({ wallet: address, roundId: round.id }, (phase, sig) =>
        setClaimTx({ phase, signature: sig }),
      );
      const next = await client.fetchCommitment(address, round.id);
      setFetched(next);
    } catch (e) {
      setClaimTx({
        phase: "failed",
        error: e instanceof Error ? e.message : "Claim failed",
      });
    }
  }, [address, commitment, round.id]);

  const value = useMemo<RoundContextValue>(
    () => ({
      round,
      status,
      revealed,
      scheduled,
      commitment,
      tx,
      claimTx,
      commit,
      claim,
      resetTx: () => setTx({ phase: "idle" }),
      estimateShare,
      estimateTokens,
    }),
    [
      round,
      status,
      revealed,
      scheduled,
      commitment,
      tx,
      claimTx,
      commit,
      claim,
      estimateShare,
      estimateTokens,
    ],
  );

  return (
    <RoundContext.Provider value={value}>{children}</RoundContext.Provider>
  );
}

export function useRound() {
  const ctx = useContext(RoundContext);
  if (!ctx) throw new Error("useRound must be used inside RoundProvider");
  return ctx;
}
