export type DepositWindow = {
  opensAt: number;
  closesAt: number;
};

export function depositWindowState(window: DepositWindow, now: number) {
  const configured = Number.isFinite(window.opensAt) &&
    Number.isFinite(window.closesAt) && window.opensAt > 0 &&
    window.closesAt > window.opensAt;
  if (!configured) return "UNSCHEDULED" as const;
  if (now < window.opensAt) return "UPCOMING" as const;
  if (now >= window.closesAt) return "CLOSED" as const;
  return "OPEN" as const;
}

export type PublicDepositRound = DepositWindow & {
  roundId: number;
  serverNow: number;
  status: ReturnType<typeof depositWindowState> | "LAUNCHED";
  depositAddress: string | null;
};
