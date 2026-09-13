"use client";

import {
  DEPOSIT_PRESETS,
  MIN_DEPOSIT_SOL,
  HYPE_LINES,
  STAGE_LABEL,
  remainingLabel,
  sanitizeAmount,
  useDepositRound,
} from "@/hooks/useDepositRound";
import type { PublicDepositRound } from "@/lib/round/window";

export function DevPortal({ initialRound }: { initialRound: PublicDepositRound }) {
  const {
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
    lastDeposit,
    label,
    buy,
  } = useDepositRound(initialRound, "dev");

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[112rem] items-center justify-center px-[clamp(0.875rem,4vw,3rem)] py-[clamp(1rem,3vh,2rem)]">
      <div className="dev-stage">
        {round?.unavailableReason && <p className="dev-error" role="status">{round.unavailableReason}</p>}
        <span className="meme-round-sticker">
          MYSTERY DROP · ROUND #{String(round?.roundId ?? 0).padStart(3, "0")}
        </span>
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

          <section className="round-countdown" data-stage={stage} aria-label="Deposit window">
            <div className="round-countdown-heading">
              <span className="round-stage">
                {stage !== "idle"
                  ? STAGE_LABEL[stage]
                  : phase === "UPCOMING"
                    ? "DEPOSITS OPEN IN"
                    : "DEPOSIT WINDOW"}
              </span>
              <strong>
                {phase === "UNSCHEDULED"
                  ? "TO BE ANNOUNCED"
                  : phase === "LAUNCHED" || phase === "CLOSED"
                    ? "CLOSED"
                    : !fresh
                      ? "SYNCING…"
                      : remainingLabel(remaining)}
              </strong>
            </div>
            <div
              className="round-time-track"
              role="progressbar"
              aria-label="Deposit window elapsed"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <div className="round-time-fill" style={{ width: `${progress}%` }}>
                {stage !== "idle" && <span className="round-time-spark" aria-hidden />}
              </div>
              <div className="round-time-ticks" aria-hidden>
                {Array.from({ length: 10 }, (_, index) => (
                  <span key={index} />
                ))}
              </div>
            </div>
            <div className="round-hype-row">
              <p key={stage === "idle" ? phase : hypeIndex} className="round-hype">
                {phase === "CLOSED" || phase === "LAUNCHED"
                  ? "This round is closed. New deposit requests are disabled."
                  : phase === "UNSCHEDULED"
                    ? "Deposits open when the next round is scheduled."
                    : stage === "idle"
                      ? "Deposits close the moment this bar is full."
                      : HYPE_LINES[hypeIndex]}
              </p>
              {stage !== "idle" && (
                <span className="round-time-percent">{Math.floor(progress)}% LOADED</span>
              )}
            </div>
          </section>

          {open ? (
            <>
              <div className="dev-buy">
                <input
                  value={amount}
                  onChange={(event) => setAmount(sanitizeAmount(event.target.value))}
                  inputMode="decimal"
                  aria-label="Deposit amount in SOL"
                  disabled={pending !== null}
                />
                <span className="dev-buy-unit">SOL</span>
              </div>
              <div className="dev-presets">
                {DEPOSIT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={pending !== null}
                    aria-pressed={parsedAmount === preset}
                    onClick={() => setAmount(String(preset))}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="dev-action"
                onClick={() => void buy()}
                disabled={pending !== null || !validAmount}
              >
                {pending ?? (address ? `Deposit ${validAmount ? parsedAmount : 0} SOL` : "Connect wallet")}
              </button>
            </>
          ) : (
            <button type="button" className="dev-action" disabled>
              {pending ?? label}
            </button>
          )}

          <p className="round-deposit-disclosure">
            Deposits are real SOL transfers. Launch costs are deducted from the pool before the token buy.
            Your tokens depend on your share of deposits; their value is not guaranteed.
          </p>
          <p className="round-deposit-disclosure">
            Minimum {MIN_DEPOSIT_SOL} SOL. Confirm before the deadline. Do not send directly after closing.
          </p>
          {lastDeposit && (
            <a
              className="dev-link"
              href={`https://solscan.io/tx/${lastDeposit.signature}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              View your last transaction
            </a>
          )}
          {error && (
            <p className="dev-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
