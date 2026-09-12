"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { IconChevron, IconExternal, IconSpinner } from "@/components/ui/Icons";
import { explorerAddress, formatSol, shortAddress } from "@/lib/format";
import { useWallet } from "@/providers/WalletProvider";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { status, address, balance, walletName, openModal, disconnect } =
    useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (status !== "connected" || !address) {
    return (
      <Button
        variant="primary"
        size={compact ? "md" : "md"}
        onClick={openModal}
        className={compact ? "px-4" : "px-5"}
        disabled={status === "connecting"}
      >
        {status === "connecting" ? (
          <>
            <IconSpinner size={12} /> Connecting
          </>
        ) : (
          <>
            <span className="hidden xl:inline">Connect Wallet</span>
            <span className="xl:hidden">Connect</span>
          </>
        )}
      </Button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line-strong)] bg-ink-800/70 pr-2.5 pl-3 transition-colors hover:border-[color-mix(in_oklab,var(--color-pump-400)_40%,transparent)]"
      >
        <span className="size-1.5 rounded-full bg-pump-400 anim-pulse" />
        <span className="num font-mono text-[12px] tracking-[0.04em] text-chalk">
          {shortAddress(address)}
        </span>
        <IconChevron
          size={11}
          className={`text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="panel anim-fade-up absolute right-0 z-40 mt-2 w-[15.5rem] p-3"
        >
          <div className="flex items-center justify-between">
            <span className="label-xs">{walletName}</span>
            <CopyButton value={address} />
          </div>
          <p className="num mt-1.5 font-mono text-[12.5px] break-all text-chalk-dim">
            {shortAddress(address, 8, 8)}
          </p>

          <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">
            <span className="label-xs">Balance</span>
            <span className="num text-[12.5px] font-medium text-chalk">
              {balance === null ? (
                <span className="text-mute">Unavailable</span>
              ) : (
                <>
                  {formatSol(balance, 4)} <span className="text-mute">SOL</span>
                </>
              )}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            <a
              href={explorerAddress(address)}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-between rounded-[8px] px-2 py-2 text-[12px] text-chalk-dim transition-colors hover:bg-ink-700/60 hover:text-chalk"
            >
              View on explorer <IconExternal />
            </a>
            <button
              onClick={() => {
                setOpen(false);
                void disconnect();
              }}
              className="flex items-center justify-between rounded-[8px] px-2 py-2 text-left text-[12px] text-mute transition-colors hover:bg-danger/[0.08] hover:text-danger"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
