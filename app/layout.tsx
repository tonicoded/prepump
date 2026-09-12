import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/layout/Shell";
import { WalletProvider } from "@/providers/WalletProvider";
import { RoundProvider } from "@/providers/RoundProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PREPUMP — Get in before the pump.",
  description:
    "A scheduled mystery meme launch on Solana. Commit SOL before the countdown ends, and the meme is revealed at launch. Round #001 coming soon.",
  openGraph: {
    title: "PREPUMP — Get in before the pump.",
    description:
      "A scheduled mystery meme launch on Solana. Round #001 coming soon.",
    type: "website",
    images: ["/prepump-logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PREPUMP — Get in before the pump.",
    description: "A scheduled mystery meme launch on Solana.",
    images: ["/prepump-logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#060709",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <WalletProvider>
          <RoundProvider>
            <Shell>{children}</Shell>
          </RoundProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
