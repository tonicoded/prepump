export function StatTile({
  icon,
  label,
  value,
  suffix,
  accent = false,
  trailing,
  className = "",
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  suffix?: string;
  accent?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`panel flex min-w-0 items-center justify-between gap-3 px-[clamp(0.75rem,1.5vh,1.125rem)] py-[clamp(0.625rem,1.4vh,1rem)] ${className}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-faint">{icon}</span>}
          <span className="label-xs truncate">{label}</span>
        </div>
        <div
          className={`num mt-[clamp(0.25rem,0.8vh,0.5rem)] truncate text-[clamp(0.9375rem,2.1vh,1.25rem)] leading-none font-semibold tracking-[-0.02em] ${
            accent ? "text-pump-300" : "text-chalk"
          }`}
        >
          {value}
          {suffix && (
            <span className="ml-1 text-[0.72em] font-medium text-mute">
              {suffix}
            </span>
          )}
        </div>
      </div>
      {trailing}
    </div>
  );
}
