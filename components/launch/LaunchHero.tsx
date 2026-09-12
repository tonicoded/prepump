"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LaunchCountdown } from "./LaunchCountdown";
import { ButtonLink } from "@/components/ui/Button";
import { IconExternal } from "@/components/ui/Icons";
import {
  explorerToken,
  explorerTx,
  formatNumber,
  formatSol,
  formatStamp,
} from "@/lib/format";
import {
  LAUNCH_LOADER_WINDOW_MS,
  PLATFORM_LAUNCH_AT,
  roundLabel,
} from "@/lib/rounds";
import { breakdown, useNow } from "@/hooks/useCountdown";
import { useRound } from "@/providers/RoundProvider";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const PRELAUNCH_HEADLINES = [
  ["THE NEXT MEME", "HASN’T BEEN BORN YET."],
  ["BORN ON SOLANA.", "LAUNCHED ON PUMP.FUN."],
  ["NO NAME. NO TICKER.", "UNTIL THE REVEAL."],
  ["THE NEXT CULT COIN", "STARTS AS A MYSTERY."],
] as const;

export function LaunchHero({ compact = false }: { compact?: boolean }) {
  const { round, status, revealed, scheduled } = useRound();
  const label = roundLabel(round.id);

  const headline = compact
    ? "text-[clamp(1.375rem,7.2vw,2rem)]"
    : "text-[clamp(2.1rem,min(8vh,6.4vw),5.5rem)]";

  /* ------------------------------- Revealed ------------------------------ */
  if (revealed) {
    return (
      <div className="flex min-h-0 flex-col items-center justify-center text-center">
        <span className="anim-fade inline-flex items-center gap-2 rounded-full border border-pump-400/30 bg-pump-400/[0.07] px-3.5 py-1.5 font-mono text-[10px] tracking-[0.3em] text-pump-300 uppercase">
          <span className="size-1.5 rounded-full bg-pump-400 anim-pulse" />
          PREPUMP {label} is live
        </span>

        <h1
          className={`anim-fade-up mt-[clamp(0.75rem,2.4vh,1.75rem)] ${headline} leading-[0.94] font-bold tracking-[-0.035em]`}
        >
          {round.tokenName}
          <span className="ml-3 align-middle text-[0.42em] font-semibold tracking-[0.02em] text-pump-300">
            ${round.tokenTicker}
          </span>
        </h1>

        <p className="anim-fade-up mt-[clamp(0.5rem,1.6vh,1rem)] max-w-[36rem] text-[clamp(0.8125rem,1.9vh,1.0625rem)] leading-snug text-mute">
          {round.tokenTagline}
        </p>

        <dl
          className={`anim-fade-up mt-[clamp(0.75rem,2.2vh,1.5rem)] ${compact ? "hidden" : "flex"} flex-wrap items-center justify-center gap-x-[clamp(1rem,3vw,2.5rem)] gap-y-2`}
        >
          {[
            ["Committed", `${formatSol(round.totalCommittedLamports)} SOL`],
            ["Wallets", formatNumber(round.participants)],
            ["Launched", round.launchedAt ? formatStamp(round.launchedAt) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="text-center">
              <dt className="label-xs">{k}</dt>
              <dd className="num mt-1 text-[clamp(0.8125rem,1.9vh,1rem)] font-semibold tracking-[-0.02em]">
                {v}
              </dd>
            </div>
          ))}
        </dl>

        <div className="anim-fade-up mt-[clamp(0.75rem,2.2vh,1.5rem)] flex flex-wrap items-center justify-center gap-2">
          {round.tokenMint && (
            <ButtonLink
              external
              href={explorerToken(round.tokenMint)}
              variant="outline"
              size="md"
            >
              View token <IconExternal />
            </ButtonLink>
          )}
          {round.launchTx && (
            <ButtonLink
              external
              href={explorerTx(round.launchTx)}
              variant="ghost"
              size="md"
            >
              Launch transaction <IconExternal />
            </ButtonLink>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------ Launching ------------------------------ */
  if (status === "LOCKED" || status === "LAUNCHING") {
    return (
      <div className="flex min-h-0 flex-col items-center justify-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-warn/30 bg-warn/[0.07] px-3.5 py-1.5 font-mono text-[10px] tracking-[0.3em] text-warn uppercase">
          <span className="size-1.5 rounded-full bg-warn anim-pulse" />
          Deposits closed
        </span>

        <h1
          className={`mt-[clamp(0.75rem,2.4vh,1.75rem)] ${headline} leading-[0.94] font-bold tracking-[-0.035em]`}
        >
          GENERATING
          <br />
          <span className="text-mute">THE MEME.</span>
        </h1>

        <p className="mt-[clamp(0.5rem,1.6vh,1rem)] max-w-[34rem] text-[clamp(0.75rem,1.8vh,1rem)] leading-snug text-mute">
          Name, ticker and artwork are produced after the round locks. The
          reveal follows in seconds.
        </p>

        <div className="mt-[clamp(0.9rem,2.6vh,1.75rem)] h-[3px] w-[min(26rem,72vw)] overflow-hidden rounded-full bg-ink-700">
          <span
            className="block h-full w-1/3 rounded-full bg-pump-400"
            style={{ animation: "pp-sweep 1.4s ease-in-out infinite" }}
          />
        </div>
      </div>
    );
  }

  /* --------------------------- Open or upcoming -------------------------- */
  return (
    <div className="meme-hero flex min-h-0 flex-col items-center justify-center text-center">
      <span className="meme-round-sticker">
        PREPUMP ROUND {label}
      </span>

      <h1
        className={`meme-headline mt-[clamp(0.75rem,2.4vh,1.75rem)] min-h-[1.72em] ${headline} leading-[0.86] font-black tracking-[-0.055em] text-balance`}
      >
        <RotatingHeadline />
      </h1>

      <p
        className={`meme-subcopy mt-[clamp(0.75rem,2vh,1.25rem)] max-w-[35rem] text-[clamp(0.75rem,1.8vh,1rem)] leading-snug ${
          compact ? "[@media(max-height:720px)]:hidden" : ""
        }`}
      >
        Commit SOL before the reveal. When the clock hits zero, the mystery
        coin launches on pump.fun.
      </p>

      <div className="mt-[clamp(1rem,3.4vh,2.5rem)]">
        {scheduled && round.closesAt !== null ? (
          <LaunchCountdown
            target={round.closesAt}
            size={compact ? "compact" : "hero"}
          />
        ) : (
          <ComingSoon compact={compact} />
        )}
      </div>
    </div>
  );
}

function RotatingHeadline() {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (reduceMotion) return;

    let switchTimeout: number | undefined;
    const interval = window.setInterval(() => {
      setPhase("out");
      switchTimeout = window.setTimeout(() => {
        setActive((current) => (current + 1) % PRELAUNCH_HEADLINES.length);
        setPhase("in");
      }, 340);
    }, 4200);

    return () => {
      window.clearInterval(interval);
      if (switchTimeout !== undefined) window.clearTimeout(switchTimeout);
    };
  }, [reduceMotion]);

  const [firstLine, secondLine] = PRELAUNCH_HEADLINES[active];

  return (
    <span key={active} className={`headline-swap headline-swap-${phase} block`}>
      {firstLine}
      <br />
      <span className="meme-headline-secondary">{secondLine}</span>
    </span>
  );
}

const subscribeNever = () => () => {};

/** False during the server render and hydration, true afterwards. */
function useMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

const pad = (value: number) => String(value).padStart(2, "0");

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const launchDate = new Date(PLATFORM_LAUNCH_AT);
const LAUNCH_UTC = `${pad(launchDate.getUTCDate())} ${MONTHS[launchDate.getUTCMonth()]}, ${pad(launchDate.getUTCHours())}:${pad(launchDate.getUTCMinutes())}`;

const LAUNCH_NL = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Amsterdam",
}).format(PLATFORM_LAUNCH_AT);

function ComingSoon({ compact }: { compact: boolean }) {
  const mounted = useMounted();
  const now = useNow(1000);
  const left = breakdown(PLATFORM_LAUNCH_AT - now);
  const live = mounted && left.expired;

  // Blocks light up across the final day; the next one pulses.
  const progress = Math.min(
    1,
    Math.max(0, 1 - (PLATFORM_LAUNCH_AT - now) / LAUNCH_LOADER_WINDOW_MS),
  );
  const lit = Math.floor(progress * 12);

  const groups = [
    ...(left.days > 0 ? [{ value: left.days, label: "days" }] : []),
    { value: left.hours, label: "hrs" },
    { value: left.minutes, label: "min" },
    { value: left.seconds, label: "sec" },
  ];

  return (
    <div
      className="meme-coming-card flex flex-col items-center"
      role="timer"
      aria-label={`Platform launch on ${LAUNCH_UTC} UTC`}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="meme-loader-status static">
          <span className="meme-loader-dot" /> {live ? "live" : "cooking"}
        </span>
        <span className="meme-loader-code static ml-auto">
          {LAUNCH_UTC} UTC
        </span>
      </div>

      <p className="mt-[clamp(0.5rem,1.4vh,0.8rem)] font-mono text-[clamp(8px,1.05vh,10px)] font-black tracking-[0.2em] text-ink-950/55 uppercase">
        {live ? "It is launch time" : "Platform launch in"}
      </p>

      {live ? (
        <p
          className={`${
            compact
              ? "text-[clamp(1.375rem,8.5vw,2rem)]"
              : "text-[clamp(1.5rem,min(5.8vh,4.5vw),3.25rem)]"
          } mt-1 leading-[0.95] font-black tracking-[0.045em]`}
        >
          WE&rsquo;RE LIVE!
        </p>
      ) : (
        <div
          className={`meme-countdown ${compact ? "meme-countdown-compact" : ""}`}
        >
          {groups.map((group, index) => (
            <div key={group.label} className="flex items-start">
              {index > 0 && (
                <span className="meme-countdown-colon" aria-hidden>
                  :
                </span>
              )}
              <div className="flex flex-col items-center">
                <span className="meme-countdown-digits num">
                  {mounted ? pad(group.value) : "--"}
                </span>
                <span className="meme-countdown-label">{group.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={`meme-block-loader mt-[clamp(0.65rem,1.8vh,1rem)] w-full ${
          mounted ? "is-progress" : ""
        }`}
        aria-hidden
      >
        {Array.from({ length: 12 }, (_, index) => (
          <span
            key={index}
            className={
              !mounted
                ? undefined
                : live || index < lit
                  ? "on"
                  : index === lit
                    ? "next"
                    : undefined
            }
            style={{ animationDelay: `${index * 80}ms` }}
          />
        ))}
      </div>

      <div className="mt-[clamp(0.55rem,1.5vh,0.85rem)] flex w-full items-center justify-between gap-3 font-mono text-[clamp(7px,0.95vh,9px)] font-black tracking-[0.13em] text-ink-950/60 uppercase">
        <span>Generating next meme</span>
        <span className="meme-coming-mark">Solana → pump.fun</span>
      </div>

      <p className="mt-[clamp(0.55rem,1.4vh,0.8rem)] font-mono text-[clamp(7px,0.9vh,9px)] font-bold tracking-[0.14em] text-ink-950/45 uppercase">
        {LAUNCH_UTC} UTC · {LAUNCH_NL} NL · Deposits open at launch
      </p>
    </div>
  );
}
