"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { browserRpcUrl, waitForConfirmation } from "@/lib/round/rpc";
import { depositWindowState, type PublicDepositRound } from "@/lib/round/window";
import { useWallet } from "@/providers/WalletProvider";

const PRESETS = [0.1, 0.5, 1, 5];
const STATUS_MAX_AGE_MS = 20_000;
type Snapshot = { round: PublicDepositRound; measuredAt: number };

function remainingLabel(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  return [hours, Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, "0")).join(":");
}

export function DevPortal({ initialRound }: { initialRound: PublicDepositRound }) {
  const { address, openModal, sendTransaction, refreshBalance } = useWallet();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [clock, setClock] = useState(0);
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastDeposit, setLastDeposit] = useState<{ address: string; signature: string; roundId: number } | null>(null);
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
    const onVisible = () => { if (!document.hidden) refresh(); };
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
  const now = snapshot ? snapshot.round.serverNow + Math.max(0, clock - snapshot.measuredAt) : initialRound.serverNow;
  const phase = round.status === "LAUNCHED" ? "LAUNCHED" : depositWindowState(round, now);
  const open = fresh && phase === "OPEN" && round.status === "OPEN" && !!round.depositAddress;
  const remaining = phase === "UPCOMING" ? round.opensAt - now : round.closesAt - now;
  const progress = round.closesAt > round.opensAt
    ? Math.min(100, Math.max(0, (now - round.opensAt) / (round.closesAt - round.opensAt) * 100))
    : 0;
  const parsedAmount = Number(amount);
  const lamports = Math.round(parsedAmount * 1e9);
  const validAmount = Number.isFinite(parsedAmount) && Number.isSafeInteger(lamports) && lamports > 0;
  const urgent = open && remaining <= 60_000;

  const buy = async () => {
    if (submitting.current) return;
    if (!open) { setError("Deposits are closed or the round status is unavailable."); return; }
    if (!address) { openModal(); return; }
    if (!validAmount) { setError("Enter a valid SOL amount above zero."); return; }
    submitting.current = true;
    setError(null);
    setPending("Checking round…");
    const expectedRound = round.roundId;
    const expectedDestination = round.depositAddress;
    try {
      const check = (current: Snapshot) => {
        const serverNow = current.round.serverNow + performance.now() - current.measuredAt;
        if (current.round.roundId !== expectedRound ||
            current.round.depositAddress !== expectedDestination ||
            current.round.status !== "OPEN" ||
            depositWindowState(current.round, serverNow) !== "OPEN") {
          throw new Error("This round is no longer accepting deposits.");
        }
      };
      const checked = await refreshRound();
      check(checked);
      const connection = new Connection(browserRpcUrl(), "confirmed");
      const from = new PublicKey(address);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({ feePayer: from, blockhash, lastValidBlockHeight }).add(
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

  const label = phase === "LAUNCHED" ? "Round launched" :
    phase === "CLOSED" ? "Deposits closed" :
    phase === "UNSCHEDULED" ? "Next round soon" :
    phase === "UPCOMING" ? "Opens soon" :
    open ? "Deposits open" : "Checking availability";

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[112rem] items-center justify-center px-[clamp(0.875rem,4vw,3rem)] py-[clamp(1rem,3vh,2rem)]">
      <div className="dev-stage">
        <span className="meme-round-sticker">MYSTERY DROP · ROUND #{String(round.roundId).padStart(3, "0")}</span>
        <div className="dev-machine" data-tab="ONE ROUND. ONE UNKNOWN MEME.">
          <div className="dev-chip-row">
            <span className="dev-chip" role="status">{label}</span>
            <span className="dev-chip dev-chip-good">SOLANA · PUMP.FUN</span>
          </div>
          <div className="dev-reveal">
            <div className="dev-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/meme-mystery.png" alt="Mystery coin — revealed after the round closes" />
              <span className="dev-art-mark">?</span>
              <span className="dev-art-scan" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="dev-ticker">$????</p>
              <p className="dev-name">Unknown until the reveal</p>
              <p className="dev-tagline">One pooled buy. Your proportional token share.</p>
            </div>
          </div>

          <section className="round-countdown" data-urgent={urgent} aria-label="Deposit window">
            <div className="round-countdown-heading">
              <span>{phase === "UPCOMING" ? "DEPOSITS OPEN IN" : "DEPOSIT WINDOW"}</span>
              <strong>{phase === "UNSCHEDULED" ? "TO BE ANNOUNCED" :
                phase === "LAUNCHED" || phase === "CLOSED" ? "CLOSED" :
                !fresh ? "SYNCING…" : remainingLabel(remaining)}</strong>
            </div>
            <div className="round-time-track" role="progressbar" aria-label="Deposit window elapsed"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <div className="round-time-fill" style={{ width: `${progress}%` }} />
            </div>
            <p>{phase === "CLOSED" || phase === "LAUNCHED"
              ? "This round is closed. New deposit requests are disabled."
              : phase === "UNSCHEDULED" ? "Deposits open when the next round is scheduled."
              : "Deposits close the moment this bar is full."}</p>
          </section>

          {open ? (
            <>
              <div className="dev-buy">
                <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
                  inputMode="decimal" aria-label="Deposit amount in SOL" disabled={pending !== null} />
                <span className="dev-buy-unit">SOL</span>
              </div>
              <div className="dev-presets">
                {PRESETS.map((preset) => <button key={preset} type="button" disabled={pending !== null}
                  aria-pressed={parsedAmount === preset} onClick={() => setAmount(String(preset))}>{preset}</button>)}
              </div>
              <button type="button" className="dev-action" onClick={() => void buy()}
                disabled={pending !== null || !validAmount}>
                {pending ?? (address ? `Deposit ${validAmount ? parsedAmount : 0} SOL` : "Connect wallet")}
              </button>
            </>
          ) : <button type="button" className="dev-action" disabled>{pending ?? label}</button>}

          <p className="round-deposit-disclosure">
            Deposits are real SOL transfers. Launch costs are deducted from the pool before the token buy.
            Your tokens depend on your share of deposits; their value is not guaranteed.
          </p>
          <p className="round-deposit-disclosure">
            Confirm before the deadline. Do not send directly after closing.
          </p>
          {lastDeposit?.address === address && lastDeposit.roundId === round.roundId && (
            <a className="dev-link" href={`https://solscan.io/tx/${lastDeposit.signature}`}
              target="_blank" rel="noreferrer noopener">View your last transaction</a>
          )}
          {error && <p className="dev-error" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}
