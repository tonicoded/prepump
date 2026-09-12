"use client";

import { Dialog } from "@/components/ui/Dialog";
import { IconArrow, IconCheck, IconSpinner } from "@/components/ui/Icons";
import { useWallet } from "@/providers/WalletProvider";

export function WalletModal() {
  const { modalOpen, closeModal, wallets, connect, status, error, walletId } =
    useWallet();

  return (
    <Dialog open={modalOpen} onClose={closeModal} title="Connect a wallet">
      <p className="-mt-2 mb-4 text-[12px] leading-relaxed text-mute">
        Choose a Solana wallet. You approve every transaction in your own
        wallet.
      </p>

      <ul className="flex flex-col">
        {wallets.map((w) => {
          const busy = status === "connecting" && walletId === w.id;
          return (
            <li
              key={w.id}
              className="border-b border-[var(--line-soft)] last:border-b-0"
            >
              <button
                onClick={() => {
                  if (w.detected) void connect(w.id);
                  else window.open(w.url, "_blank", "noopener");
                }}
                className="group flex w-full items-center gap-3 py-3.5 text-left"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: w.tint }}
                  aria-hidden
                />
                <span className="flex-1 text-[14px] font-medium text-chalk">
                  {w.name}
                </span>
                {busy ? (
                  <IconSpinner size={13} className="text-pump-400" />
                ) : w.detected ? (
                  <>
                    <span className="font-mono text-[10px] tracking-[0.14em] text-pump-300 uppercase">
                      Detected
                    </span>
                    <IconArrow
                      size={13}
                      className="text-faint transition-colors group-hover:text-chalk"
                    />
                  </>
                ) : (
                  <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase transition-colors group-hover:text-chalk-dim">
                    Install
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-3 rounded-[9px] border border-danger/25 bg-danger/[0.07] px-3 py-2 text-[11.5px] text-danger">
          {error}
        </p>
      )}

      <p className="mt-4 flex items-start gap-2 border-t border-[var(--line)] pt-3 text-[11px] leading-relaxed text-faint">
        <IconCheck size={12} className="mt-0.5 shrink-0 text-pump-400" />
        PREPUMP never asks for a seed phrase, private key or recovery phrase.
      </p>
    </Dialog>
  );
}
