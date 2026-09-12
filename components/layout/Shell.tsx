import { AmbientBackdrop } from "./AmbientBackdrop";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { WalletModal } from "@/components/wallet/WalletModal";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="meme-shell grain relative flex h-[100dvh] flex-col overflow-hidden">
      <AmbientBackdrop />
      <Navbar />
      <main className="relative z-10 flex min-h-0 flex-1 flex-col">
        {children}
      </main>
      <Footer />
      <WalletModal />
    </div>
  );
}
