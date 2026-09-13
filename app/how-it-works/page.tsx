import type { Metadata } from "next";
import { HowItWorks } from "@/components/marketing/HowItWorks";

export const metadata: Metadata = {
  title: "How It Works — PREPUMP",
  description:
    "See how PREPUMP turns a pooled SOL deposit into a mystery pump.fun launch and distributes every purchased token proportionally.",
};

export default function Page() {
  return <HowItWorks />;
}
