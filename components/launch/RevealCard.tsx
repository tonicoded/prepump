"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { IconExternal } from "@/components/ui/Icons";
import { explorerToken, formatUtc, shortAddress } from "@/lib/format";
import type { Round } from "@/lib/types";

export function RevealCard({
  round,
  compact = false,
}: {
  round: Round;
  compact?: boolean;
}) {
  const ticker = round.tokenTicker ?? "????";

  return (
    <section className="panel anim-fade-up flex min-h-0 flex-col overflow-hidden p-[var(--pad)]">
      <div className="mb-[var(--gap)] flex items-start justify-between gap-3">
        <span className="label-xs text-pump-300">Revealed</span>
        <span className="label-xs text-right">
          {round.launchedAt ? formatUtc(round.launchedAt) : "—"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-[clamp(0.75rem,1.8vw,1.25rem)]">
        <div
          className={`aspect-square shrink-0 overflow-hidden rounded-[10px] border border-[var(--line-strong)] ${
            compact ? "h-full max-h-[7.5rem]" : "h-full max-h-[13rem]"
          }`}
          style={{
            boxShadow:
              "0 0 60px -20px color-mix(in oklab, var(--color-pump-400) 40%, transparent)",
          }}
        >
          {round.tokenImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={round.tokenImage}
              alt={`${round.tokenName} artwork`}
              className="size-full object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center bg-ink-800 text-[1.5rem] font-bold text-ghost">
              ${ticker}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="truncate text-[clamp(1.25rem,3.2vh,2rem)] leading-none font-bold tracking-[-0.03em] text-chalk">
            {round.tokenName}
          </p>
          <p className="num mt-[clamp(0.25rem,0.9vh,0.6rem)] text-[clamp(0.9rem,2.2vh,1.25rem)] leading-none font-semibold text-pump-300">
            ${ticker}
          </p>
          <p className="mt-[clamp(0.5rem,1.4vh,0.9rem)] text-[clamp(0.6875rem,1.6vh,0.8125rem)] leading-snug text-mute">
            {round.tokenTagline}
          </p>

          {!compact && round.tokenMint && (
            <div className="mt-auto pt-[var(--gap)]">
              <div className="flex items-center justify-between gap-2">
                <span className="label-xs">Mint</span>
                <CopyButton value={round.tokenMint} />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="num truncate font-mono text-[11.5px] text-chalk-dim">
                  {shortAddress(round.tokenMint, 6, 6)}
                </span>
                <a
                  href={explorerToken(round.tokenMint)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex shrink-0 items-center gap-1 font-mono text-[10px] tracking-[0.12em] text-faint uppercase transition-colors hover:text-pump-300"
                >
                  Explorer <IconExternal size={10} />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
