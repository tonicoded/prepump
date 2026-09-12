import type { Metadata } from "next";
import { HowItWorks } from "@/components/marketing/HowItWorks";

export const metadata: Metadata = {
  title: "How It Works — PREPUMP",
  description:
    "Prebuy a weekly mystery meme launch on Solana, revealed and launched automatically on pump.fun.",
};

export default function Page() {
  return <HowItWorks />;
}
