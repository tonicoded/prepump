import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevPortal } from "@/components/dev/DevPortal";
import { getServerEnv } from "@/lib/server/env";
import { getDepositRound } from "@/lib/server/deposit-round";

export const metadata: Metadata = {
  title: "PREPUMP · Mystery round",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function DevPage() {
  const config = getServerEnv();
  if (!config.portalEnabled) notFound();
  return <DevPortal initialRound={getDepositRound()} />;
}
