"use client";

import { useState } from "react";
import { PageFrame } from "@/components/ui/PageFrame";
import { ButtonLink } from "@/components/ui/Button";
import { IconChevron } from "@/components/ui/Icons";

const ITEMS = [
  {
    q: "What is PREPUMP?",
    a: "PREPUMP is a scheduled mystery meme launch on Solana. Users commit SOL to an open round before the token is revealed. When the countdown reaches zero, deposits close, a new meme coin is generated and launched, and participants receive a proportional allocation.",
  },
  {
    q: "When does the first round open?",
    a: "Round #001 has not been scheduled yet. Nothing on this page is live: there is no open round, no committed SOL and no token. The date is announced on X and Telegram, and the countdown here starts the moment it is set.",
  },
  {
    q: "When is the meme revealed?",
    a: "After the round closes. Name, ticker, artwork and description are produced once deposits are locked, never before, so no participant can see what they are buying while they can still buy it.",
  },
  {
    q: "How is my allocation calculated?",
    a: "Your allocation is your proportional share of the eligible SOL committed to the round, applied to the distributable supply, minus pump.fun's own launch costs, slippage and rounding. PREPUMP takes no fee. Commit 2 SOL into a 100 SOL round and you hold 2% of the pool.",
  },
  {
    q: "Can I withdraw before launch?",
    a: "The interface follows the rules of the deployed program, and those rules are published with round #001. Until they are, assume nothing: no commitment is possible yet, so there is nothing to withdraw.",
  },
  {
    q: "What happens if a launch fails?",
    a: "A round that cannot launch moves to a refund state and committed SOL becomes claimable from escrow by the wallets that funded it, minus network fees already spent. The refund path and its transaction are shown on the round.",
  },
  {
    q: "Which wallets are supported?",
    a: "Phantom, Backpack and Solflare, plus any wallet that implements the Solana wallet standard. You approve every transaction inside your own wallet. PREPUMP never asks for a seed phrase, private key or recovery phrase.",
  },
];

export function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <PageFrame
      eyebrow="FAQ"
      title={
        <>
          Questions
          <span className="text-mute"> before you commit.</span>
        </>
      }
    >
      <div className="grid min-h-0 flex-1 gap-[var(--gap)] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)]">
        <aside className="panel hidden min-h-0 flex-col justify-between p-[var(--pad)] lg:flex">
          <div>
            <h2 className="text-[clamp(0.9375rem,2.2vh,1.25rem)] font-semibold tracking-[-0.02em]">
              Read the mechanics before you send SOL.
            </h2>
            <p className="mt-[clamp(0.4rem,1.2vh,0.75rem)] text-[clamp(0.6875rem,1.5vh,0.8125rem)] leading-relaxed text-mute">
              Every round will publish its escrow account, closing timestamp
              and launch transaction. Verify them on a Solana explorer rather
              than trusting numbers rendered on a website.
            </p>
          </div>

          <dl className="my-auto grid grid-cols-2 gap-x-4 gap-y-[clamp(0.5rem,1.6vh,1rem)] border-y border-[var(--line-soft)] py-[clamp(0.75rem,2vh,1.25rem)]">
            {[
              ["Status", "No round open yet"],
              ["Network", "Solana"],
              ["Cadence", "One round per week"],
              ["Wallets", "Phantom, Backpack, Solflare"],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="label-xs truncate">{k}</dt>
                <dd className="mt-1 text-[12.5px] font-medium text-chalk">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-2">
            <ButtonLink href="/how-it-works" variant="outline" size="md">
              How it works
            </ButtonLink>
            <ButtonLink href="/" variant="quiet" size="md">
              Current round
            </ButtonLink>
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              Crypto assets are highly volatile. Participation involves
              significant risk. Always verify transactions before signing.
              Nothing here is a promise of return.
            </p>
          </div>
        </aside>

        <div className="panel flex min-h-0 flex-col overflow-hidden p-[clamp(0.5rem,1.2vh,0.875rem)]">
          <ul className="flex min-h-0 flex-1 flex-col justify-between">
            {ITEMS.map((item, i) => {
              const isOpen = open === i;
              return (
                <li
                  key={item.q}
                  className="shrink-0 border-b border-[var(--line-soft)] last:border-b-0"
                >
                  <button
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-[clamp(0.375rem,1vw,0.75rem)] py-[clamp(0.5rem,1.5vh,0.9rem)] text-left"
                  >
                    <span
                      className={`text-[clamp(0.8125rem,1.8vh,0.9375rem)] font-medium transition-colors ${isOpen ? "text-chalk" : "text-chalk-dim"}`}
                    >
                      {item.q}
                    </span>
                    <IconChevron
                      size={12}
                      className={`shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180 text-pump-400" : "text-faint"}`}
                    />
                  </button>
                  {isOpen && (
                    <p className="anim-fade min-h-0 px-[clamp(0.375rem,1vw,0.75rem)] pb-[clamp(0.625rem,1.8vh,1.1rem)] text-[clamp(0.6875rem,1.55vh,0.8125rem)] leading-relaxed text-mute">
                      {item.a}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </PageFrame>
  );
}
