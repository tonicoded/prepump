"use client";

import { useCountdown } from "@/hooks/useCountdown";

const PARTS = [
  { key: "days", label: "Days" },
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Minutes" },
  { key: "seconds", label: "Seconds" },
] as const;

export function LaunchCountdown({
  target,
  size = "hero",
}: {
  target: number;
  size?: "hero" | "compact";
}) {
  const remaining = useCountdown(target);
  const urgent = remaining.total > 0 && remaining.total < 60 * 60 * 1000;

  const digit =
    size === "hero"
      ? "text-[clamp(2.6rem,min(12vh,15vw),7rem)]"
      : "text-[clamp(1.5rem,min(6vh,9vw),2.75rem)]";
  const colon =
    size === "hero"
      ? "text-[clamp(1.25rem,min(5vh,6vw),2.5rem)]"
      : "text-[clamp(0.9rem,3vh,1.25rem)]";

  return (
    <div
      className="flex items-start justify-center gap-[clamp(0.35rem,1.6vw,1.6rem)]"
      role="timer"
      aria-label="Time until the round closes"
    >
      {PARTS.map((part, i) => {
        const value = remaining[part.key];
        return (
          <div key={part.key} className="flex items-start">
            <div className="flex flex-col items-center">
              <span
                key={size === "hero" ? `${part.key}-${value}` : undefined}
                suppressHydrationWarning
                className={`num ${digit} leading-[0.92] font-bold tracking-[-0.045em] tabular-nums ${
                  urgent && part.key === "seconds" ? "text-pump-300" : "text-chalk"
                } ${part.key === "seconds" ? "anim-tick" : ""}`}
                style={{
                  textShadow:
                    "0 0 48px color-mix(in oklab, var(--color-pump-300) 22%, transparent), 0 0 14px rgba(255,255,255,0.14)",
                }}
              >
                {String(value).padStart(2, "0")}
              </span>
              <span
                className={`label-xs mt-[clamp(0.4rem,1.4vh,0.9rem)] ${
                  size === "compact" ? "text-[9px]" : ""
                }`}
              >
                {part.label}
              </span>
            </div>
            {i < PARTS.length - 1 && (
              <span
                className={`${colon} ml-[clamp(0.35rem,1.6vw,1.6rem)] leading-none font-light text-ghost`}
                style={{ marginTop: size === "hero" ? "0.55em" : "0.4em" }}
                aria-hidden
              >
                :
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
