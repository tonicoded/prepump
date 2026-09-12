"use client";

import { Button } from "@/components/ui/Button";
import { IconCheck, IconExternal, IconLock, IconSpinner } from "@/components/ui/Icons";
import {
  explorerTx,
  formatNumber,
  formatPercent,
  formatSol,
} from "@/lib/format";
import { useRound } from "@/providers/RoundProvider";
import type { Round } from "@/lib/types";
import { roundLabel } from "@/lib/rounds";
import { useWallet } from "@/providers/WalletProvider";

export function UserPosition({
  round: roundOverride,
  historical = false,
}: {
  round?: Round;
  historical?: boolean;
} = {}) {
  const ctx = useRound();
  const round = roundOverride ?? ctx.round;
  const { claim, claimTx, revealed: liveRevealed } = ctx;
  const commitment = historical ? null : ctx.commitment;
  const revealed = historical ? true : liveRevealed;
  const { status: walletStatus, openModal } = useWallet();
  const connected = walletStatus === "connected";

  const claimed = claimTx.phase === "confirmed";
  const claiming =
    claimTx.phase === "awaiting-signature" || claimTx.phase === "submitted";

  const positionStatus = claimed
    ? "CLAIMED"
    : revealed
      ? "READY TO CLAIM"
      : "LOCKED";

  if (!connected) {
    return (
      <section className="panel flex min-h-0 flex-col items-center justify-center p-[var(--pad)] text-center">
        <h2 className="text-[clamp(0.8125rem,1.8vh,0.9375rem)] font-semibold tracking-[0.06em] uppercase">
          Your position
        </h2>
        <p className="mt-2 max-w-[22rem] text-[12px] leading-relaxed text-mute">
          Connect a wallet to see your commitment, pool ownership and token
          allocation for round {roundLabel(round.id)}.
        </p>
        <Button variant="primary" size="lg" className="mt-4 w-full" onClick={openModal}>
          CONNECT WALLET
        </Button>
      </section>
    );
  }

  if (!commitment) {
    return (
      <section className="panel flex min-h-0 flex-col items-center justify-center p-[var(--pad)] text-center">
        <h2 className="text-[clamp(0.8125rem,1.8vh,0.9375rem)] font-semibold tracking-[0.06em] uppercase">
          Your position
        </h2>
        <p className="mt-2 max-w-[22rem] text-[12px] leading-relaxed text-mute">
          {revealed
            ? `You did not commit to round ${roundLabel(round.id)}. The next round opens shortly after launch.`
            : "No commitment yet. Commit SOL before the countdown ends to take a share of this round."}
        </p>
      </section>
    );
  }

  const allocation = commitment.estimatedTokens ?? 0n;

  return (
    <section className="panel flex min-h-0 flex-col p-[var(--pad)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[clamp(0.8125rem,1.8vh,0.9375rem)] font-semibold tracking-[0.06em] uppercase">
          Your position
        </h2>
        <span
          className={`flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase ${
            positionStatus === "LOCKED" ? "text-mute" : "text-pump-300"
          }`}
        >
          {positionStatus === "LOCKED" ? <IconLock size={11} /> : <IconCheck size={11} />}
          {positionStatus}
        </span>
      </div>

      <dl className="mt-[var(--gap)] grid grid-cols-2 gap-[var(--gap)]">
        <div>
          <dt className="label-xs">Committed</dt>
          <dd className="num mt-1 text-[clamp(0.9375rem,2.1vh,1.125rem)] font-semibold tracking-[-0.02em]">
            {formatSol(commitment.committedLamports)}{" "}
            <span className="text-[0.72em] text-mute">SOL</span>
          </dd>
        </div>
        <div>
          <dt className="label-xs">Pool ownership</dt>
          <dd className="num mt-1 text-[clamp(0.9375rem,2.1vh,1.125rem)] font-semibold tracking-[-0.02em]">
            {formatPercent(commitment.share)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="label-xs">
            {revealed ? "Allocation" : "Estimated allocation"}
          </dt>
          <dd className="num mt-1 truncate text-[clamp(0.9375rem,2.1vh,1.125rem)] font-semibold tracking-[-0.02em] text-pump-300">
            {formatNumber(allocation)}{" "}
            <span className="text-[0.72em] text-mute">
              {round.tokenTicker ?? "????"}
            </span>
          </dd>
        </div>
      </dl>

      {claimTx.phase === "failed" && (
        <p className="mt-[var(--gap)] rounded-[9px] border border-danger/25 bg-danger/[0.07] px-3 py-2 text-[11.5px] text-danger">
          {claimTx.error ?? "Claim failed."} Your allocation is unchanged.
        </p>
      )}

      <div className="mt-auto pt-[var(--gap)]">
        {revealed ? (
          claimed ? (
            <>
              <Button variant="outline" size="lg" className="w-full" disabled>
                <IconCheck size={13} /> CLAIMED
              </Button>
              {claimTx.signature && (
                <a
                  href={explorerTx(claimTx.signature)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 flex items-center justify-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-faint uppercase transition-colors hover:text-pump-300"
                >
                  Claim transaction <IconExternal size={10} />
                </a>
              )}
            </>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={claiming}
              onClick={() => void claim()}
            >
              {claiming ? (
                <>
                  <IconSpinner size={13} />
                  {claimTx.phase === "awaiting-signature"
                    ? "AWAITING SIGNATURE"
                    : "CONFIRMING"}
                </>
              ) : (
                "CLAIM TOKENS"
              )}
            </Button>
          )
        ) : (
          <p className="text-center text-[11px] leading-relaxed text-faint">
            Allocation is final once deposits close. Amounts shown before close
            are estimates and move as other wallets commit.
          </p>
        )}

        {commitment.commitTx && !revealed && (
          <p className="mt-2 text-center font-mono text-[10px] tracking-[0.12em] text-ghost uppercase">
            Commit recorded
          </p>
        )}
      </div>
    </section>
  );
}
