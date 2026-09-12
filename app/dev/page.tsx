import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevPortal } from "@/components/dev/DevPortal";
import { getPublicDevConfig } from "@/lib/server/env";

export const metadata: Metadata = {
  title: "PREPUMP Dev Lab",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function DevPage() {
  const config = getPublicDevConfig();
  if (!config.portalEnabled) notFound();
  return <DevPortal config={config} />;
}

