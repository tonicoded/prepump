"use client";

import { useRound } from "@/providers/RoundProvider";

/** The upcoming token, deliberately withheld. Nothing here is generated. */
export function MysteryTokenCard({ compact = false }: { compact?: boolean }) {
  const { status, scheduled } = useRound();

  return (
    <section className="panel relative flex min-h-0 flex-col overflow-hidden p-[var(--pad)]">
      <div className="mb-[var(--gap)] flex items-start justify-between gap-3">
        <span className="label-xs">Next reveal</span>
        <span className="label-xs text-right text-faint">
          {!scheduled
            ? "Generated at T-0"
            : status === "OPEN"
              ? "Generating at T-0"
              : "Generating"}
        </span>
      </div>

      <div
        className={`flex min-h-0 flex-1 gap-[clamp(0.75rem,1.8vw,1.25rem)] ${
          compact
            ? "flex-col items-center justify-center text-center"
            : "items-stretch"
        }`}
      >
        <div
          className={`relative aspect-square shrink-0 overflow-hidden rounded-[12px] border border-[var(--line)] bg-ink-900 ${
            compact
              ? "h-auto w-[min(48%,11rem)] max-h-none"
              : "h-full max-h-[13rem]"
          }`}
        >
          <span
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(52% 52% at 50% 46%, color-mix(in oklab, var(--color-pump-500) 40%, transparent), transparent 72%)",
              filter: "blur(24px)",
            }}
          />
          <span className="absolute top-[46%] left-1/2 size-[56%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-950/60 blur-[8px]" />
          <span
            className="absolute inset-0 opacity-40 mix-blend-overlay"
            style={{
              backgroundImage:
                "repeating-linear-gradient(180deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 3px)",
            }}
          />
          <span
            className="absolute inset-x-0 h-8 opacity-25"
            style={{
              background:
                "linear-gradient(180deg, transparent, color-mix(in oklab, var(--color-pump-300) 34%, transparent), transparent)",
              animation: "pp-scan 4.5s linear infinite",
            }}
          />
          <span className="absolute inset-0 grid place-items-center text-[clamp(1.5rem,4vw,2.5rem)] font-bold text-chalk/30">
            ?
          </span>
        </div>

        <div
          className={`flex min-w-0 flex-col justify-center ${compact ? "w-full" : "flex-1"}`}
        >
          <p className="num text-[clamp(1.25rem,3.2vh,2rem)] leading-none font-bold tracking-[-0.03em] text-chalk">
            ??????
          </p>
          <p className="num mt-[clamp(0.25rem,0.9vh,0.6rem)] text-[clamp(0.9rem,2.2vh,1.25rem)] leading-none font-semibold text-ghost">
            $????
          </p>
          <p className="label-xs mt-[clamp(0.5rem,1.4vh,0.9rem)] text-mute">
            Revealed at launch
          </p>

          {!compact && (
            <>
              <div className="my-[clamp(0.6rem,1.6vh,1.1rem)] h-px w-10 bg-[var(--line-strong)]" />
              <p className="text-[clamp(0.6875rem,1.5vh,0.8125rem)] leading-[1.7] tracking-[0.02em] text-faint uppercase">
                A new meme.
                <br />
                A new story.
                <br />
                Same opportunity.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
