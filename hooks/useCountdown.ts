"use client";

import { useEffect, useState } from "react";

export type Remaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
  expired: boolean;
};

export function breakdown(ms: number): Remaining {
  const total = Math.max(0, ms);
  const s = Math.floor(total / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    total,
    expired: total <= 0,
  };
}

/** Ticks once per second, aligned to the wall clock. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let frame: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      frame = setTimeout(tick, intervalMs - (Date.now() % intervalMs));
    };
    // Corrects the prerendered value on the first client frame, then keeps
    // ticking aligned to the wall clock.
    frame = setTimeout(tick, 0);
    return () => clearTimeout(frame);
  }, [intervalMs]);

  return now;
}

export function useCountdown(target: number): Remaining {
  const now = useNow(1000);
  return breakdown(target - now);
}
