"use client";

import { StatTile } from "@/components/ui/StatTile";
import { IconClock, IconPercent, IconUser, IconUsers } from "@/components/ui/Icons";
import { formatNumber, formatPercent, formatSol } from "@/lib/format";
import { roundLabel } from "@/lib/rounds";
import { useRound } from "@/providers/RoundProvider";
import { useWallet } from "@/providers/WalletProvider";

const STATUS_COPY: Record<string, string> = {
  UPCOMING: "NOT OPEN YET",
  OPEN: "OPEN",
  LOCKED: "LOCKED",
  LAUNCHING: "LAUNCHING",
  CLAIMABLE: "LIVE",
  COMPLETE: "COMPLETE",
  REFUND: "REFUND",
};

function StatusDot({ live }: { live: boolean }) {
  return (
    <span
      className={`block size-1.5 rounded-full ${
        live ? "bg-pump-400 anim-pulse" : "bg-ghost"
      }`}
    />
  );
}

export function RoundStats({ compact = false }: { compact?: boolean }) {
  const { round, status, scheduled, commitment } = useRound();
  const { status: walletStatus } = useWallet();
  const connected = walletStatus === "connected";
  const live = status === "OPEN" || status === "CLAIMABLE";

  // Before the first round is scheduled there are no numbers to report, so
  // the row states what PREPUMP is instead of showing zeroes.
  if (!scheduled) {
    const statusTile = (
      <StatTile
        label="Status"
        value={STATUS_COPY[status]}
        accent
        icon={<StatusDot live={live} />}
      />
    );

    if (compact) {
      return (
        <div className="grid grid-cols-2 gap-[var(--gap)]">
          <StatTile label="First round" value={roundLabel(round.id)} />
          {statusTile}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-[var(--gap)] xl:grid-cols-4">
        <StatTile label="Network" value="Solana" />
        <StatTile label="Cadence" value="One round per week" />
        <StatTile label="First round" value={roundLabel(round.id)} />
        {statusTile}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-[var(--gap)] md:grid-cols-3 xl:grid-cols-5">
      <StatTile
        icon={<IconClock />}
        label="Total committed"
        value={formatSol(round.totalCommittedLamports)}
        suffix="SOL"
      />
      <StatTile
        icon={<IconUsers />}
        label="Participants"
        value={formatNumber(round.participants)}
      />
      <StatTile
        icon={<IconUser />}
        label="Your commitment"
        value={
          connected && commitment ? formatSol(commitment.committedLamports) : "0.00"
        }
        suffix="SOL"
      />
      <StatTile
        icon={<IconPercent />}
        label="Your share"
        value={connected && commitment ? formatPercent(commitment.share) : "0.000%"}
      />
      <StatTile
        className="col-span-2 md:col-span-1"
        label="Status"
        accent={live}
        value={STATUS_COPY[status]}
        icon={<StatusDot live={live} />}
      />
    </div>
  );
}
