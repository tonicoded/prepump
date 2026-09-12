"use client";

import Link from "next/link";
import type { Route } from "next";

type Variant = "primary" | "outline" | "ghost" | "quiet";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-[10px] font-medium tracking-[0.02em] transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-[var(--ease-out-quint)] select-none disabled:pointer-events-none disabled:opacity-40 active:translate-y-px";

const variants: Record<Variant, string> = {
  primary:
    "text-ink-950 font-semibold [background:var(--brand-gradient)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-pump-200)_55%,transparent)_inset,0_12px_34px_-14px_var(--color-pump-500)] hover:brightness-[1.06] hover:shadow-[0_0_0_1px_var(--color-pump-200)_inset,0_16px_40px_-14px_var(--color-pump-400)]",
  outline:
    "border border-[var(--line-strong)] bg-ink-800/60 text-chalk hover:border-[color-mix(in_oklab,var(--color-pump-400)_45%,transparent)] hover:bg-ink-700/60",
  ghost:
    "border border-transparent text-mute hover:text-chalk hover:bg-ink-800/70",
  quiet:
    "border border-[var(--line)] bg-transparent text-chalk-dim hover:border-[var(--line-strong)] hover:text-chalk",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[11px]",
  md: "h-10 px-4 text-[13px]",
  lg: "h-[clamp(2.75rem,5.4vh,3.25rem)] px-6 text-[clamp(0.8125rem,1.5vh,0.9375rem)]",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  children,
  ...rest
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "outline",
  size = "md",
  className = "",
  href,
  external,
  children,
  ...rest
}: CommonProps & {
  href: string;
  external?: boolean;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${className}`;
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={cls}
        {...rest}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href as Route} className={cls} {...rest}>
      {children}
    </Link>
  );
}
