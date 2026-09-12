export function PageFrame({
  eyebrow,
  title,
  lead,
  children,
  aside,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  lead?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[112rem] min-h-0 flex-col gap-[var(--gap)] px-[clamp(0.875rem,3vw,2.5rem)] py-[clamp(0.75rem,2vh,1.5rem)]">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label-xs">{eyebrow}</p>
          <h1 className="mt-[clamp(0.25rem,1vh,0.6rem)] text-[clamp(1.375rem,min(4.4vh,3.4vw),2.75rem)] leading-[1] font-bold tracking-[-0.035em]">
            {title}
          </h1>
          {lead && (
            <p className="mt-[clamp(0.35rem,1.1vh,0.75rem)] max-w-[46rem] text-[clamp(0.75rem,1.6vh,0.9375rem)] leading-snug text-mute">
              {lead}
            </p>
          )}
        </div>
        {aside}
      </header>
      {children}
    </div>
  );
}
