import type { RoundStatus } from "@/lib/types";

const tone: Record<string, string> = {
  OPEN: "text-pump-300 border-pump-400/30 bg-pump-400/[0.07]",
  LOCKED: "text-warn border-warn/30 bg-warn/[0.07]",
  LAUNCHING: "text-warn border-warn/30 bg-warn/[0.07]",
  CLAIMABLE: "text-pump-300 border-pump-400/30 bg-pump-400/[0.07]",
  COMPLETE: "text-mute border-[var(--line-strong)] bg-ink-700/50",
  UPCOMING: "text-chalk-dim border-[var(--line-strong)] bg-ink-700/50",
  REFUND: "text-danger border-danger/30 bg-danger/[0.07]",
  LAUNCHED: "text-mute border-[var(--line-strong)] bg-ink-700/50",
};

export function StatusPill({
  status,
  label,
  className = "",
}: {
  status: RoundStatus | "LAUNCHED";
  label?: string;
  className?: string;
}) {
  const live = status === "OPEN" || status === "CLAIMABLE";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] leading-none tracking-[0.14em] ${tone[status]} ${className}`}
    >
      <span
        className={`size-1.5 rounded-full ${live ? "bg-pump-400 anim-pulse" : "bg-current opacity-60"}`}
      />
      {label ?? status}
    </span>
  );
}
