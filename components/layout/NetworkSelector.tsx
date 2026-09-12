"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevron, IconCheck, SolanaMark } from "@/components/ui/Icons";

const CLUSTERS = [
  { id: "mainnet", label: "Mainnet Beta", rpc: "api.mainnet-beta.solana.com" },
  { id: "devnet", label: "Devnet", rpc: "api.devnet.solana.com" },
] as const;

export function NetworkSelector() {
  const [cluster, setCluster] = useState<(typeof CLUSTERS)[number]["id"]>("mainnet");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line)] bg-ink-800/60 px-3 transition-colors hover:border-[var(--line-strong)]"
      >
        <SolanaMark size={13} />
        <span className="text-[12.5px] font-medium text-chalk-dim">
          {cluster === "mainnet" ? "Solana" : "Devnet"}
        </span>
        <IconChevron
          size={11}
          className={`text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="panel anim-fade-up absolute right-0 z-40 mt-2 w-[13rem] p-1.5">
          {CLUSTERS.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCluster(c.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-ink-700/60"
            >
              <span>
                <span className="block text-[12.5px] text-chalk">{c.label}</span>
                <span className="block font-mono text-[9.5px] tracking-[0.08em] text-faint">
                  {c.rpc}
                </span>
              </span>
              {c.id === cluster && (
                <IconCheck size={12} className="text-pump-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
