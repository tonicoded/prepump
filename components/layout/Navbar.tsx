import { WalletButton } from "@/components/wallet/WalletButton";
import { Wordmark } from "./Wordmark";

export function Navbar() {
  return (
    <header className="relative z-30 shrink-0 border-b border-[var(--line-soft)]">
      <nav className="mx-auto flex h-[clamp(3.25rem,7vh,4.25rem)] w-full max-w-[112rem] items-center justify-between gap-4 px-[clamp(1rem,3vw,2.5rem)]">
        <Wordmark />
        <WalletButton compact />
      </nav>
    </header>
  );
}
