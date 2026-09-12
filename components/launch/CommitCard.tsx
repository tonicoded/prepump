"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconCheck, IconExternal, IconLock, IconSpinner, SolanaMark } from "@/components/ui/Icons";
import { NETWORK_FEE_LAMPORTS, PLATFORM_FEE_BPS, roundLabel } from "@/lib/rounds";
import {
  explorerTx,
  formatPercent,
  formatSol,
  lamportsToSol,
  solToLamports,
} from "@/lib/format";
import { useRound } from "@/providers/RoundProvider";
import { useWallet } from "@/providers/WalletProvider";

const PRESETS = [0.1, 0.5, 1, 5];

export function CommitCard({ compact = false }: { compact?: boolean }) {
  const { round, status, commit, tx, resetTx, estimateShare } = useRound();
  const {
    status: walletStatus,
    balance,
    walletName,
    openModal,
  } = useWallet();
  const [amount, setAmount] = useState("");

  const connected = walletStatus === "connected";
  const lamports = useMemo(() => solToLamports(Number(amount || 0)), [amount]);
  const share = estimateShare(lamports);

  const maxLamports =
    balance !== null && balance > NETWORK_FEE_LAMPORTS
      ? balance - NETWORK_FEE_LAMPORTS
      : 0n;
  const insufficient = connected && balance !== null && lamports > maxLamports;
  const depositsOpen = status === "OPEN";
  const busy = tx.phase === "awaiting-signature" || tx.phase === "submitted";

  const setSol = (value: number) =>
    setAmount(value === 0 ? "" : String(Number(value.toFixed(4))));

  const onChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
    setAmount(cleaned);
  };

  /* ---------------------------------------------------------------- */
  /*  Confirmed state                                                  */
  /* ---------------------------------------------------------------- */
  if (tx.phase === "confirmed") {
    return (
      <section className="panel flex min-h-0 flex-col justify-center p-[var(--pad)] text-center">
        <span className="mx-auto flex size-9 items-center justify-center rounded-full border border-pump-400/30 bg-pump-400/[0.08] text-pump-300">
          <IconCheck size={15} />
        </span>
        <h2 className="mt-3 text-[clamp(0.9375rem,2vh,1.125rem)] font-semibold tracking-[-0.01em]">
          Commit confirmed
        </h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mute">
          {tx.intent}. You are in round {roundLabel(round.id)}.
        </p>
        {tx.signature && (
          <a
            href={explorerTx(tx.signature)}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center justify-center gap-1.5 font-mono text-[10.5px] tracking-[0.1em] text-faint uppercase transition-colors hover:text-pump-300"
          >
            View transaction <IconExternal size={10} />
          </a>
        )}
        <Button
          variant="outline"
          size="md"
          className="mt-4 w-full"
          onClick={() => {
            setAmount("");
            resetTx();
          }}
        >
          Commit more SOL
        </Button>
      </section>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Default state                                                    */
  /* ---------------------------------------------------------------- */
  return (
    <section className="panel flex min-h-0 flex-col overflow-hidden p-[var(--pad)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[clamp(0.8125rem,1.8vh,0.9375rem)] font-semibold tracking-[0.01em] uppercase">
          Commit to PREPUMP {roundLabel(round.id)}
        </h2>
        {!compact && (
          <span className="label-xs shrink-0">
            {depositsOpen ? "Deposits open" : "Deposits closed"}
          </span>
        )}
      </div>

      {/* Amount */}
      <div
        className={`${compact ? "mt-auto" : "mt-[var(--gap)]"} flex items-center gap-2 rounded-[11px] border bg-ink-900/70 px-3 py-[clamp(0.5rem,1.4vh,0.875rem)] transition-colors ${
          insufficient
            ? "border-danger/40"
            : "border-[var(--line)] focus-within:border-[color-mix(in_oklab,var(--color-pump-400)_45%,transparent)]"
        }`}
      >
        <input
          value={amount}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          disabled={!depositsOpen || busy}
          aria-label="Amount of SOL to commit"
          className="num min-w-0 flex-1 bg-transparent text-[clamp(1.125rem,2.8vh,1.5rem)] font-semibold tracking-[-0.02em] text-chalk outline-none placeholder:text-ghost disabled:opacity-50"
        />
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--line)] bg-ink-800 px-2.5 py-1.5">
          <SolanaMark size={12} />
          <span className="text-[11.5px] font-medium text-chalk-dim">SOL</span>
        </span>
        <button
          onClick={() => setSol(lamportsToSol(maxLamports))}
          disabled={!connected || !depositsOpen || busy}
          className="shrink-0 rounded-[8px] border border-[var(--line)] px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-chalk-dim uppercase transition-colors hover:border-[var(--line-strong)] hover:text-chalk disabled:opacity-40"
        >
          Max
        </button>
      </div>

      {/* Presets — hidden once the wallet request is in flight */}
      {!busy && (
      <div className="mt-[var(--gap)] grid grid-cols-4 gap-[clamp(0.375rem,0.9vh,0.625rem)]">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setSol(p)}
            disabled={!depositsOpen || busy}
            className={`num rounded-[9px] border py-[clamp(0.4rem,1.1vh,0.625rem)] text-[12.5px] font-medium transition-colors disabled:opacity-40 ${
              Number(amount) === p
                ? "border-pump-400/45 bg-pump-400/[0.08] text-pump-300"
                : "border-[var(--line)] bg-ink-900/50 text-chalk-dim hover:border-[var(--line-strong)] hover:text-chalk"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      )}

      {/* Breakdown */}
      <dl className="mt-[clamp(0.6rem,1.6vh,1rem)] grid grid-cols-4 gap-2">
        <div className="min-w-0">
          <dt className="label-xs truncate">Balance</dt>
          <dd className="num mt-1 truncate text-[12.5px] font-medium text-chalk">
            {connected && balance !== null ? formatSol(balance) : "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="label-xs truncate">Pool share</dt>
          <dd className="num mt-1 truncate text-[12.5px] font-medium text-chalk">
            {formatPercent(share)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="label-xs truncate">{compact ? "Platform" : "Platform fee"}</dt>
          <dd className="num mt-1 truncate text-[12.5px] font-medium text-chalk">
            {PLATFORM_FEE_BPS === null
              ? "—"
              : `${(PLATFORM_FEE_BPS / 100).toFixed(2)}%`}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="label-xs truncate">Network fee</dt>
          <dd className="num mt-1 truncate text-[12.5px] font-medium text-chalk">
            ~{formatSol(NETWORK_FEE_LAMPORTS, 4)}
          </dd>
        </div>
      </dl>

      {/* Signature intent — shown before the wallet request */}
      {busy && (
        <div className="anim-fade mt-[var(--gap)] flex items-start gap-2 rounded-[9px] border border-[var(--line)] bg-ink-900/70 px-3 py-2">
          <IconSpinner size={12} className="mt-0.5 shrink-0 text-pump-400" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-chalk">
              {tx.phase === "awaiting-signature"
                ? `Confirm in ${walletName ?? "your wallet"}`
                : "Transaction submitted"}
            </p>
            <p className="num mt-0.5 truncate text-[11px] text-mute">
              {tx.intent} · Solana Mainnet
            </p>
          </div>
        </div>
      )}

      {tx.phase === "failed" && (
        <p className="mt-[var(--gap)] rounded-[9px] border border-danger/25 bg-danger/[0.07] px-3 py-2 text-[11.5px] text-danger">
          {tx.error ?? "Transaction failed."} Nothing was committed.
        </p>
      )}

      <div className="mt-auto pt-[var(--gap)]">
        {!depositsOpen ? (
          <Button variant="outline" size="lg" className="w-full" disabled>
            <IconLock size={13} /> DEPOSITS CLOSED
          </Button>
        ) : !connected ? (
          <Button variant="primary" size="lg" className="w-full" onClick={openModal}>
            CONNECT WALLET
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={lamports <= 0n || insufficient || busy}
            onClick={() => void commit(lamports)}
          >
            {busy ? (
              <>
                <IconSpinner size={13} />
                {tx.phase === "awaiting-signature"
                  ? "AWAITING SIGNATURE"
                  : "CONFIRMING"}
              </>
            ) : insufficient ? (
              "INSUFFICIENT BALANCE"
            ) : (
              "COMMIT SOL"
            )}
          </Button>
        )}

        <p className="mt-[clamp(0.4rem,1.1vh,0.75rem)] text-center text-[clamp(10px,1.2vh,11px)] leading-snug text-faint">
          {compact
            ? "SOL is locked for this round until launch or refund."
            : "Your SOL is locked for this round until launch or refund conditions are triggered."}
        </p>
      </div>
    </section>
  );
}
