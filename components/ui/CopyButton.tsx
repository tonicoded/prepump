"use client";

import { useState } from "react";

export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={`font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
        copied ? "text-pump-300" : "text-faint hover:text-chalk-dim"
      } ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
