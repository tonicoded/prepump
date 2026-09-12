import Link from "next/link";
import { WalletButton } from "@/components/wallet/WalletButton";
import { Wordmark } from "./Wordmark";

export function Navbar() {
  return (
    <header className="meme-navbar relative z-30 shrink-0">
      <nav className="mx-auto flex h-[clamp(4rem,8vh,5rem)] w-full max-w-[112rem] items-center justify-between gap-4 px-[clamp(1rem,3vw,2.5rem)]">
        <Wordmark />
        <Link href="/how-it-works" className="meme-nav-link hidden sm:inline-flex">
          How it works
        </Link>
        <WalletButton compact />
      </nav>
      <div className="meme-marquee" aria-hidden>
        <div className="meme-marquee-track">
          {[0, 1].map((group) => (
            <div key={group} className="meme-marquee-group">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <span key={item}>
                  MYSTERY DROP ✦ SOLANA ONLY ✦ PUMP.FUN BOUND ✦ GET IN BEFORE
                  THE PUMP ✦
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
