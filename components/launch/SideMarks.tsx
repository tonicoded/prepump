const LEFT = ["Mystery", "Solana", "Pump.fun", "Born at launch"];

export function SideMarks() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden xl:block"
    >
      <div className="absolute top-[8%] left-0 space-y-1">
        {LEFT.map((l) => (
          <p key={l} className="label-xs text-ghost">
            {l}
          </p>
        ))}
      </div>
      <div className="absolute top-[44%] left-0 space-y-1">
        {["Get in", "before", "the pump."].map((l) => (
          <p key={l} className="label-xs text-ghost">
            {l}
          </p>
        ))}
      </div>
      <div className="absolute top-[42%] right-0 space-y-1 text-right">
        {["Built for", "pump.fun", "on Solana"].map((l) => (
          <p key={l} className="label-xs text-ghost">
            {l}
          </p>
        ))}
        <span className="ml-auto block h-px w-8 bg-[var(--line-strong)]" />
      </div>
    </div>
  );
}
