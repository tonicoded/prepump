export function solToLamports(sol: number): bigint {
  if (!Number.isFinite(sol) || sol <= 0) return 0n;
  return BigInt(Math.round(sol * 1e9));
}

export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / 1e9;
}

export function formatSol(lamports: bigint, digits = 2): string {
  return lamportsToSol(lamports).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatNumber(value: number | bigint): string {
  return Number(value).toLocaleString("en-US");
}

export function formatPercent(share: number, digits = 3): string {
  return `${(share * 100).toFixed(digits)}%`;
}

/** 7XK2abcd...9FQe — never render a full address in shared UI. */
export function shortAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export function formatUtc(ts: number): string {
  const d = new Date(ts);
  const month = d
    .toLocaleString("en-US", { month: "short", timeZone: "UTC" })
    .toUpperCase();
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day} ${d.getUTCFullYear()} — ${hh}:${mm} UTC`;
}

export const EXPLORER = "https://solscan.io";

export function explorerAddress(address: string): string {
  return `${EXPLORER}/account/${address}`;
}

export function explorerTx(signature: string): string {
  return `${EXPLORER}/tx/${signature}`;
}

export function explorerToken(mint: string): string {
  return `${EXPLORER}/token/${mint}`;
}

/** Compact absolute stamp: "SEP 11 · 20:00 UTC". */
export function formatStamp(ts: number): string {
  const d = new Date(ts);
  const month = d
    .toLocaleString("en-US", { month: "short", timeZone: "UTC" })
    .toUpperCase();
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day} · ${hh}:${mm} UTC`;
}
