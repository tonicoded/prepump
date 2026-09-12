"use client";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: { value: T; label: string; badge?: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex gap-1 rounded-[11px] border border-[var(--line)] bg-ink-900/80 p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative flex-1 rounded-[8px] px-2 py-2 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors duration-200 ${
              active
                ? "bg-ink-700 text-chalk shadow-[0_1px_0_0_color-mix(in_oklab,var(--color-chalk)_8%,transparent)_inset]"
                : "text-faint hover:text-chalk-dim"
            }`}
          >
            {opt.label}
            {opt.badge && (
              <span className="ml-1.5 text-pump-400">{opt.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
