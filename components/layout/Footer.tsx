import { Wordmark } from "./Wordmark";
import { LINKS } from "@/lib/links";

const FOOTER_LINKS = [
  { label: "How", href: "/how-it-works" },
  { label: "Docs", href: LINKS.docs },
  { label: "X", href: LINKS.x },
  { label: "Telegram", href: LINKS.telegram },
  { label: "Terms", href: LINKS.terms },
  { label: "Privacy", href: LINKS.privacy },
];

export function Footer() {
  return (
    <footer className="meme-footer relative z-30 shrink-0">
      <div className="mx-auto flex min-h-[clamp(2.75rem,5vh,3.25rem)] w-full max-w-[112rem] items-center justify-between gap-4 px-[clamp(1rem,3vw,2.5rem)] py-3">
        <div className="flex items-center gap-4">
          <Wordmark size="sm" />
          <span className="hidden text-[11.5px] font-bold text-white/50 sm:inline">
            Get in before the pump.
          </span>
        </div>

        <p className="hidden max-w-[42rem] truncate text-[10.5px] text-white/35 xl:block">
          Crypto assets are highly volatile. Participation involves significant
          risk. Always verify transactions before signing.
        </p>

        <div className="flex items-center gap-[clamp(0.65rem,2vw,1rem)]">
          {FOOTER_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className={`${l.label === "Docs" ? "hidden sm:inline" : ""} text-[11.5px] font-bold text-white/60 transition-colors hover:text-pump-300`}
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
