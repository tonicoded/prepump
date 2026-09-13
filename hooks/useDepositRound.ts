"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { browserRpcUrl, waitForConfirmation } from "@/lib/round/rpc";
import { depositWindowState, type PublicDepositRound } from "@/lib/round/window";
import { useWallet } from "@/providers/WalletProvider";

export const DEPOSIT_PRESETS = [0.1, 0.5, 1, 5] as const;

/** Hype about the reveal and the clock. Never about how much has been deposited. */
export const HYPE_LINES = [
  "The meme is loading. Get in before it drops.",
  "Nobody knows the coin yet. Not even the dev.",
  "When this bar fills, the reveal happens.",
  "Everyone enters blind. Be one of them.",
  "One shot. One unknown meme. One chart.",
  "Future you is watching this bar.",
] as const;

export const STAGE_LABEL = {
  charging: "MEME LOADING",
  hot: "HEATING UP",
  critical: "LAST CALL",
} as const;

const STATUS_MAX_AGE_MS = 20_000;
type Snapshot = { round: PublicDepositRound; measuredAt: number };

export type DepositPhase =
  | "SYNCING"
  | ReturnType<typeof depositWindowState>
  | "LAUNCHED";
export type DepositStage = "idle" | keyof typeof STAGE_LABEL;

export function remainingLabel(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  return [hours, Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function sanitizeAmount(raw: string) {
  return raw
    .replace(/,/g, ".")
    .replace(/[^0-9.]/g, "")
    .replace(/(\..*)\./g, "$1");
}

/**
 * Server-driven deposit round: polls /api/round/status, keeps time on the
 * server's clock, and rechecks the round right before the wallet prompt so a
 * closed round can never be deposited into from this page.
 */
export function useDepositRound(initialRound: PublicDepositRound | null = null) {
  const { address, openModal, sendTransaction, refreshBalance } = useWallet();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [clock, setClock] = useState(0);
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastDeposit, setLastDeposit] = useState<{
    address: string;
    signature: string;
    roundId: number;
  } | null>(null);
  const submitting = useRef(false);
  const requestVersion = useRef(0);

  const refreshRound = useCallback(async () => {
    const version = ++requestVersion.current;
    const measuredAt = performance.now();
    const response = await fetch("/api/round/status", { cache: "no-store" });
    if (!response.ok) throw new Error("Round status unavailable. Please try again.");
    const round: PublicDepositRound = await response.json();
    if (!Number.isFinite(round.serverNow) || !Number.isInteger(round.roundId)) {
      throw new Error("Round status unavailable.");
    }
    const next = { round, measuredAt };
    if (version === requestVersion.current) {
      setSnapshot(next);
      setClock(performance.now());
    }
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void refreshRound().catch(() => {
        if (active) setSnapshot(null);
      });
    };
    refresh();
    const poll = window.setInterval(refresh, 10_000);
    const tick = window.setInterval(() => setClock(performance.now()), 250);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshRound]);

  const round = snapshot?.round ?? initialRound;
  const fresh = snapshot !== null && clock - snapshot.measuredAt < STATUS_MAX_AGE_MS;
  const now = snapshot
    ? snapshot.round.serverNow + Math.max(0, clock - snapshot.measuredAt)
    : (initialRound?.serverNow ?? 0);
  const phase: DepositPhase = !round
    ? "SYNCING"
    : round.status === "LAUNCHED"
      ? "LAUNCHED"
      : depositWindowState(round, now);
  const open =
    !!round && fresh && phase === "OPEN" && round.status === "OPEN" && !!round.depositAddress;
  const remaining = !round
    ? 0
    : phase === "UPCOMING"
      ? round.opensAt - now
      : round.closesAt - now;
  const progress =
    round && round.closesAt > round.opensAt
      ? Math.min(100, Math.max(0, ((now - round.opensAt) / (round.closesAt - round.opensAt)) * 100))
      : 0;
  const parsedAmount = Number(amount);
  const lamports = Math.round(parsedAmount * 1e9);
  const validAmount =
    Number.isFinite(parsedAmount) && Number.isSafeInteger(lamports) && lamports > 0;
  const stage: DepositStage = !open
    ? "idle"
    : remaining <= 10 * 60_000
      ? "critical"
      : remaining <= 60 * 60_000
        ? "hot"
        : "charging";
  const hypeIndex = Math.floor(clock / 3800) % HYPE_LINES.length;

  const buy = async () => {
    if (submitting.current) return;
    if (!open || !round) {
      setError("Deposits are closed or the round status is unavailable.");
      return;
    }
    if (!address) {
      openModal();
      return;
    }
    if (!validAmount) {
      setError("Enter a valid SOL amount above zero.");
      return;
    }
    submitting.current = true;
    setError(null);
    setPending("Checking round…");
    const expectedRound = round.roundId;
    const expectedDestination = round.depositAddress;
    try {
      const check = (current: Snapshot) => {
        const serverNow = current.round.serverNow + performance.now() - current.measuredAt;
        if (
          current.round.roundId !== expectedRound ||
          current.round.depositAddress !== expectedDestination ||
          current.round.status !== "OPEN" ||
          depositWindowState(current.round, serverNow) !== "OPEN"
        ) {
          throw new Error("This round is no longer accepting deposits.");
        }
      };
      check(await refreshRound());
      const connection = new Connection(browserRpcUrl(), "confirmed");
      const from = new PublicKey(address);
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({
        feePayer: from,
        blockhash,
        lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: from,
          toPubkey: new PublicKey(expectedDestination!),
          lamports,
        }),
      );
      // Recheck after RPC work, immediately before opening the wallet.
      check(await refreshRound());
      setPending("Confirm in your wallet…");
      // A standard SOL transfer cannot revoke an already-open wallet request at T-0.
      const signature = await sendTransaction(transaction);
      setLastDeposit({ address, signature, roundId: expectedRound });
      setPending("Confirming deposit…");
      await waitForConfirmation(connection, signature);
      void refreshBalance();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Deposit failed.");
    } finally {
      submitting.current = false;
      setPending(null);
    }
  };

  const label =
    phase === "LAUNCHED"
      ? "Round launched"
      : phase === "CLOSED"
        ? "Deposits closed"
        : phase === "UNSCHEDULED"
          ? "Next round soon"
          : phase === "UPCOMING"
            ? "Opens soon"
            : open
              ? "Deposits open"
              : "Checking availability";

  const ownLastDeposit =
    lastDeposit && lastDeposit.address === address && lastDeposit.roundId === round?.roundId
      ? lastDeposit
      : null;

  return {
    address,
    round,
    fresh,
    phase,
    open,
    remaining,
    progress,
    stage,
    hypeIndex,
    amount,
    setAmount,
    parsedAmount,
    validAmount,
    pending,
    error,
    lastDeposit: ownLastDeposit,
    label,
    buy,
  };
}
