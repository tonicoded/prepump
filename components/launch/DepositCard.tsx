"use client";

import {
  DEPOSIT_PRESETS,
  HYPE_LINES,
  STAGE_LABEL,
  remainingLabel,
  sanitizeAmount,
  useDepositRound,
} from "@/hooks/useDepositRound";

const utcTime = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const nlTime = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  }).format(ms);

/** The homepage deposit card, in the same cream sticker skin as the hero. */
export function DepositCard() {
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
  } = useDepositRound();

  const closed = phase === "CLOSED" || phase === "LAUNCHED";
  const roundTag = round ? `ROUND #${String(round.roundId).padStart(3, "0")}` : "ROUND #···";

  const heading =
    stage !== "idle"
      ? STAGE_LABEL[stage]
      : phase === "UPCOMING"
        ? "DEPOSITS OPEN IN"
        : phase === "LAUNCHED"
          ? "ROUND LAUNCHED"
          : phase === "CLOSED"
            ? "DEPOSITS CLOSED"
            : phase === "UNSCHEDULED"
              ? "NEXT ROUND SOON"
              : "SYNCING";

  const timer =
    phase === "SYNCING" || (!fresh && !closed)
      ? "--:--:--"
      : phase === "UNSCHEDULED"
        ? "SOON"
        : closed
          ? "00:00:00"
          : remainingLabel(remaining);

  const line = closed
    ? "Deposits are closed. The reveal is next."
    : phase === "UPCOMING" && round
      ? `Deposits open at ${utcTime(round.opensAt)} UTC · ${nlTime(round.opensAt)} NL`
      : phase === "UNSCHEDULED"
        ? "The next round is being scheduled."
        : stage !== "idle"
          ? HYPE_LINES[hypeIndex]
          : "Syncing the round…";

  const tab = open
    ? "MEME MACHINE // DEPOSITS OPEN"
    : closed
      ? "MEME MACHINE // LOCKED"
      : "MEME MACHINE // STANDBY";

  return (
    <div
      className="meme-coming-card meme-deposit-card flex flex-col"
      data-stage={stage}
      data-closed={closed}
      data-tab={tab}
      role="region"
      aria-label="Deposit into the current round"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="meme-loader-status static" role="status">
          <span className="meme-loader-dot" /> {label}
        </span>
        <span className="meme-loader-code static ml-auto">{roundTag}</span>
      </div>

      <div className="deposit-heading">
        <span className="deposit-stage">{heading}</span>
        <strong className="deposit-timer num">{timer}</strong>
      </div>

      <div
        className="deposit-track"
        role="progressbar"
        aria-label="Deposit window elapsed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(closed ? 100 : progress)}
      >
        <div className="deposit-fill" style={{ width: `${closed ? 100 : progress}%` }}>
          {stage !== "idle" && <span className="deposit-spark" aria-hidden />}
        </div>
        <div className="deposit-ticks" aria-hidden>
          {Array.from({ length: 10 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </div>

      <div className="deposit-hype-row">
        <p key={stage === "idle" ? phase : hypeIndex} className="deposit-hype">
          {line}
        </p>
        {stage !== "idle" && (
          <span className="deposit-percent">{Math.floor(progress)}% LOADED</span>
        )}
      </div>

      {open ? (
        <>
          <div className="deposit-form">
            <label className="deposit-input">
              <input
                value={amount}
                onChange={(event) => setAmount(sanitizeAmount(event.target.value))}
                inputMode="decimal"
                aria-label="Deposit amount in SOL"
                disabled={pending !== null}
              />
              <span>SOL</span>
            </label>
            <div className="deposit-presets">
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
          </div>
          <button
            type="button"
            className="deposit-cta"
            onClick={() => void buy()}
            disabled={pending !== null || !validAmount}
          >
            {pending ??
              (address ? `Deposit ${validAmount ? parsedAmount : 0} SOL` : "Connect wallet")}
          </button>
        </>
      ) : (
        <button type="button" className="deposit-cta" disabled>
          {pending ??
            (phase === "UPCOMING" && round ? `Opens ${nlTime(round.opensAt)} NL` : label)}
        </button>
      )}

      <p className="deposit-disclosure">
        Real SOL transfers · launch costs come out of the pool · token value not guaranteed
      </p>
      {lastDeposit && (
        <a
          className="deposit-link"
          href={`https://solscan.io/tx/${lastDeposit.signature}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          View your deposit transaction
        </a>
      )}
      {error && (
        <p className="deposit-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
