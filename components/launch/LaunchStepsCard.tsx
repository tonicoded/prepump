const STEPS = [
  { n: "01", title: "Connect", body: "A Solana wallet. Nothing else." },
  { n: "02", title: "Commit", body: "Lock SOL into the open round." },
  { n: "03", title: "Reveal", body: "The meme is generated at T-0." },
  { n: "04", title: "Claim", body: "Take your share of the supply." },
];

/** What a round will do, in four lines. No numbers, nothing invented. */
export function LaunchStepsCard() {
  return (
    <section className="panel flex min-h-0 flex-col p-[var(--pad)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[clamp(0.75rem,1.7vh,0.875rem)] font-semibold tracking-[0.06em] uppercase">
          What happens at launch
        </h2>
        <span className="label-xs">4 steps</span>
      </div>

      <ol className="mt-[var(--gap)] flex min-h-0 flex-1 flex-col justify-between">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="flex items-baseline gap-3 border-b border-[var(--line-soft)] py-[clamp(0.35rem,1.1vh,0.7rem)] last:border-b-0"
          >
            <span className="num shrink-0 font-mono text-[10.5px] tracking-[0.18em] text-pump-400">
              {s.n}
            </span>
            <span className="w-[clamp(3.5rem,6vw,4.5rem)] shrink-0 text-[clamp(0.75rem,1.7vh,0.875rem)] font-medium text-chalk">
              {s.title}
            </span>
            <span className="min-w-0 flex-1 truncate text-[clamp(0.6875rem,1.5vh,0.8125rem)] text-mute">
              {s.body}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
