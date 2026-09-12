"use client";

import { useState } from "react";
import { PageFrame } from "@/components/ui/PageFrame";
import { Segmented } from "@/components/ui/Segmented";
import { CopyButton } from "@/components/ui/CopyButton";
import { StatusPill } from "@/components/ui/Pill";
import { PLATFORM_FEE_BPS, roundLabel } from "@/lib/rounds";
import { explorerAddress, formatSol, formatUtc, shortAddress } from "@/lib/format";
import { IconExternal } from "@/components/ui/Icons";
import { useRound } from "@/providers/RoundProvider";

const STEPS = [
  {
    n: "01",
    title: "Connect",
    body: "Connect a Solana wallet. Phantom, Backpack and Solflare are supported. No seed phrase is ever requested.",
    art: (
      <svg viewBox="0 0 60 40" className="h-full w-full" aria-hidden>
        <rect x="4" y="12" width="26" height="17" rx="4" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <circle cx="24" cy="20.5" r="2" fill="currentColor" />
        <path d="M34 20.5h18m0 0l-4.5-4M52 20.5l-4.5 4" stroke="var(--color-pump-400)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    n: "02",
    title: "Commit",
    body: "Lock SOL into the open round while the countdown runs. Your share of the pool is your share of the SOL committed when deposits close.",
    art: (
      <svg viewBox="0 0 60 40" className="h-full w-full" aria-hidden>
        <path d="M30 4v22m0 0l-6-6m6 6l6-6" stroke="var(--color-pump-400)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="12" y="28" width="36" height="9" rx="3" stroke="currentColor" strokeWidth="1.3" fill="none" />
      </svg>
    ),
  },
  {
    n: "03",
    title: "Reveal",
    body: "At T-0 deposits close and a new meme coin is generated: name, ticker, artwork and description. Then it launches.",
    art: (
      <svg viewBox="0 0 60 40" className="h-full w-full" aria-hidden>
        <circle cx="30" cy="20" r="11" stroke="var(--color-pump-400)" strokeWidth="1.3" fill="none" />
        <path d="M30 9V4M30 36v-5M41 20h5M14 20H9M38 12l3.5-3.5M38 28l3.5 3.5M22 12l-3.5-3.5M22 28l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    n: "04",
    title: "Claim",
    body: "Claim your proportional allocation of the distributable supply, after the disclosed launch costs, fees and rounding.",
    art: (
      <svg viewBox="0 0 60 40" className="h-full w-full" aria-hidden>
        <rect x="16" y="14" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <path d="M24 14V9a6 6 0 0112 0v5" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <path d="M25 24l3.5 3.5L36 20" stroke="var(--color-pump-400)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function StepCard({ step }: { step: (typeof STEPS)[number] }) {
  return (
    <article className="panel flex min-h-0 flex-col p-[var(--pad)]">
      <span className="num font-mono text-[11px] tracking-[0.2em] text-pump-400">
        {step.n}
      </span>
      <h2 className="mt-[clamp(0.5rem,1.8vh,1.25rem)] text-[clamp(0.9375rem,2.2vh,1.25rem)] font-semibold tracking-[-0.01em] uppercase">
        {step.title}
      </h2>
      <p className="mt-[clamp(0.35rem,1.1vh,0.75rem)] text-[clamp(0.6875rem,1.5vh,0.8125rem)] leading-relaxed text-mute">
        {step.body}
      </p>
      <span className="mt-auto block h-[clamp(2.5rem,9vh,5rem)] w-full pt-[var(--gap)] text-ghost opacity-70">
        {step.art}
      </span>
    </article>
  );
}

function Row({
  label,
  value,
  pending = false,
}: {
  label: string;
  value: string;
  pending?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="label-xs truncate">{label}</dt>
      <dd
        className={`num mt-1 truncate text-[12.5px] font-medium ${pending ? "text-faint" : "text-chalk"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function TransparencyPanel() {
  const { round, status, scheduled } = useRound();
  const fee =
    PLATFORM_FEE_BPS === null
      ? "Disclosed at launch"
      : `${(PLATFORM_FEE_BPS / 100).toFixed(2)}%`;

  return (
    <section className="panel flex min-h-0 flex-col p-[var(--pad)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[clamp(0.9375rem,2.2vh,1.375rem)] font-semibold tracking-[-0.02em]">
          Built to be verifiable.
        </h2>
        <StatusPill status={status} label={scheduled ? undefined : "COMING SOON"} />
      </div>
      <p className="mt-[clamp(0.35rem,1.1vh,0.75rem)] text-[clamp(0.6875rem,1.5vh,0.8125rem)] leading-relaxed text-mute">
        Round accounting will live on-chain. Escrow balance, deposits and the
        launch transaction are inspectable by anyone, without trusting this
        interface.
      </p>

      <dl className="mt-[var(--gap)] grid grid-cols-2 gap-x-4 gap-y-[clamp(0.4rem,1.2vh,0.75rem)]">
        <Row label="First round" value={roundLabel(round.id)} />
        <Row
          label="Closing timestamp"
          value={round.closesAt ? formatUtc(round.closesAt) : "To be announced"}
          pending={!round.closesAt}
        />
        <Row
          label="Total committed"
          value={
            scheduled ? `${formatSol(round.totalCommittedLamports)} SOL` : "No round open"
          }
          pending={!scheduled}
        />
        <Row label="Platform fee" value={fee} pending={PLATFORM_FEE_BPS === null} />
        <div className="col-span-2 min-w-0">
          <dt className="label-xs">Escrow</dt>
          {round.escrow ? (
            <dd className="mt-1 flex items-center gap-2">
              <span className="num truncate font-mono text-[12.5px] text-chalk-dim">
                {shortAddress(round.escrow, 10, 8)}
              </span>
              <CopyButton value={round.escrow} />
              <a
                href={explorerAddress(round.escrow)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-faint transition-colors hover:text-pump-300"
                aria-label="View escrow on explorer"
              >
                <IconExternal size={11} />
              </a>
            </dd>
          ) : (
            <dd className="mt-1 text-[12.5px] text-faint">
              Published when round {roundLabel(round.id)} opens
            </dd>
          )}
        </div>
      </dl>

      <p className="mt-auto border-t border-[var(--line)] pt-[var(--gap)] text-[11px] leading-relaxed text-faint">
        Explorer links to the escrow account, the program and every round
        transaction appear here once the program is deployed.
      </p>
    </section>
  );
}

function FairnessPanel() {
  const { round, revealed } = useRound();
  return (
    <section className="panel flex min-h-0 flex-col p-[var(--pad)]">
      <h2 className="text-[clamp(0.9375rem,2.2vh,1.375rem)] font-semibold tracking-[-0.02em]">
        No one knows the meme before launch.
      </h2>
      <p className="mt-[clamp(0.35rem,1.1vh,0.75rem)] text-[clamp(0.6875rem,1.5vh,0.8125rem)] leading-relaxed text-mute">
        The token identity is generated and revealed only after deposits close.
        Every participant commits before knowing the meme, the ticker or the
        artwork.
      </p>
      <p className="mt-[clamp(0.35rem,1.1vh,0.75rem)] text-[clamp(0.6875rem,1.5vh,0.8125rem)] leading-relaxed text-mute">
        A commitment hash is published while a round is open. After the reveal
        the seed is released, so anyone can check that the revealed token
        matches what was committed to before deposits closed.
      </p>

      <div className="mt-auto pt-[var(--gap)]">
        <div className="flex items-center gap-2 rounded-[9px] border border-[var(--line)] bg-ink-900/60 px-3 py-2">
          <span className="size-1.5 shrink-0 rounded-full bg-ghost" />
          <span className="font-mono text-[10px] tracking-[0.14em] text-mute uppercase">
            {round.commitHash ? "Commit hash published" : "Commit hash pending"}
          </span>
        </div>
        {round.commitHash ? (
          <p className="num mt-2 truncate font-mono text-[11px] text-ghost">
            {round.commitHash}
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            {revealed
              ? "Seed released. The reveal can be verified against the published hash."
              : `The hash is published when round ${roundLabel(round.id)} opens, and the seed is released with the reveal at T-0.`}
          </p>
        )}
      </div>
    </section>
  );
}

export function HowItWorks() {
  const [tab, setTab] = useState<"steps" | "verify" | "fairness">("steps");

  return (
    <PageFrame
      eyebrow="How it works"
      title={
        <>
          Four steps.
          <span className="text-mute"> One reveal.</span>
        </>
      }
      lead="PREPUMP runs on a weekly cycle. Commit while a round is open, and receive a share of the token that is generated when it closes."
    >
      {/* Desktop */}
      <div className="hidden min-h-0 flex-1 flex-col gap-[var(--gap)] lg:flex">
        <div className="grid min-h-0 flex-1 grid-cols-4 gap-[var(--gap)]">
          {STEPS.map((s) => (
            <StepCard key={s.n} step={s} />
          ))}
        </div>
        <div className="grid h-[clamp(13.5rem,32vh,19rem)] shrink-0 grid-cols-2 gap-[var(--gap)]">
          <TransparencyPanel />
          <FairnessPanel />
        </div>
      </div>

      {/* Mobile */}
      <div className="flex min-h-0 flex-1 flex-col gap-[var(--gap)] lg:hidden">
        <Segmented
          className="shrink-0"
          value={tab}
          onChange={setTab}
          options={[
            { value: "steps", label: "Steps" },
            { value: "verify", label: "Verify" },
            { value: "fairness", label: "Fairness" },
          ]}
        />
        <div className="flex min-h-0 flex-1 [&>section]:w-full">
          {tab === "steps" && (
            <div className="grid min-h-0 w-full flex-1 grid-cols-2 gap-[var(--gap)]">
              {STEPS.map((s) => (
                <StepCard key={s.n} step={s} />
              ))}
            </div>
          )}
          {tab === "verify" && <TransparencyPanel />}
          {tab === "fairness" && <FairnessPanel />}
        </div>
      </div>
    </PageFrame>
  );
}
