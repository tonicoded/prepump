# PREPUMP

A scheduled mystery meme launch platform on Solana. Users commit SOL to an open
round before the token exists. When the countdown reaches zero, deposits close,
a new meme coin is generated and launched, and every participating wallet
receives a proportional allocation of the distributable supply.

**Get in before the pump.**

---

## Two surfaces

| Route | Who sees it | What it does |
| --- | --- | --- |
| `/` | Everyone | The public launch page. Stays **COMING SOON**. |
| `/dev` | You | The meme machine: open a round, buy, generate the meme, launch it on pump.fun. |

`/dev` is always available in `npm run dev`. In production it 404s unless
`DEV_PORTAL_ENABLED=true`, and then `DEV_PORTAL_ACCESS_TOKEN` is required.
Nothing you do in `/dev` changes what a visitor sees on `/`.

A real round is run from the terminal, not from the browser:

```bash
npm run round status        # config, wallet, balance, window
npm run round scan          # who deposited what
npm run round launch --yes  # generate the meme and create it on pump.fun
npm run round distribute --yes   # pay every depositor their share
```

Setup, environment variables and the real-launch checklist live in
[docs/TECHNICAL_SETUP.md](docs/TECHNICAL_SETUP.md).

## Status: pre-launch

Nothing on this site is live and nothing on it is invented.

- There is no open round, no committed SOL, no participants and no token.
- The hero shows **COMING SOON** instead of a countdown, because no closing
  time has been set.
- The platform fee, escrow address, program address and commit hash are all
  shown as pending rather than filled with placeholder values.
- The only write path to a chain is the commit and claim flow, and it throws
  `ProgramNotDeployedError` rather than simulating success.

The interface upgrades itself from configuration. See **Going live** below.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4.

### Private dev lab

The public site stays in Coming Soon mode. The complete interactive sandbox is
available at [`/dev`](http://localhost:3000/dev): test deposits, the 30%
withdrawal penalty, fixed supply math, random metadata, optional OpenAI image
generation, a pump.fun launch dry-run and simulated distribution.

Copy `.env.example` to `.env.local` for your own secrets. A safe local
`.env.local` with simulation defaults is already present but ignored by Git.
See [`docs/TECHNICAL_SETUP.md`](docs/TECHNICAL_SETUP.md) for the security model,
Vercel setup, live-mode locks and the remaining on-chain work.

---

## The one hard layout rule

**Nothing on this site scrolls.** Every route fits inside the viewport, on
desktop and on phones. `body` is `overflow: hidden` and the shell is a
`100dvh` flex column: navbar, main, footer.

Consequences to respect when editing:

- Sizes are written as `clamp(min, <vh or vw>, max)` so type and spacing
  compress on short screens instead of pushing content out of view.
- Any flex or grid child that holds content needs `min-h-0`, otherwise it
  refuses to shrink and the page overflows.
- Below the `lg` breakpoint each page switches to a compact layout with a
  segmented control instead of stacking panels vertically. Both layouts are in
  the DOM and toggled with `hidden` / `lg:hidden`, so there is no breakpoint
  flash on first paint.

Verified at 1536×1024, 1440×900, 1280×720, 834×1112, 390×844 and 360×640.

---

## Brand

`logo.png` is the source of truth. Three derived assets are generated from it
and live in `public/`:

| File                    | Used for                                  |
| ----------------------- | ----------------------------------------- |
| `prepump-mark.png`      | navbar mark, app icon, background element |
| `prepump-wordmark.png`  | navbar and footer wordmark                |
| `prepump-logo.png`      | Open Graph and Twitter card               |

The palette is sampled from the logo and defined once in `app/globals.css` as
`--color-pump-200` … `--color-pump-600`, with `#00d078` as the core green.
`--brand-gradient` reproduces the gradient on the PUMP half of the wordmark and
is used for primary buttons and the COMING SOON headline. Everything else is
near-black, charcoal and warm off-white.

---

## Layout of the code

```
app/
  layout.tsx              providers + shell + metadata + icons
  page.tsx                launch
  how-it-works/           4 steps, transparency, fairness
  faq/
components/
  layout/                 Navbar, Footer, Shell, AmbientBackdrop, Wordmark
  launch/                 LaunchHero, LaunchCountdown, RoundStats, CommitCard,
                          MysteryTokenCard, LaunchStepsCard, FollowCard,
                          RevealCard, UserPosition
  marketing/              HowItWorks, Faq
  wallet/                 WalletButton, WalletModal
  ui/                     Button, Dialog, StatTile, Pill, Segmented, …
providers/
  WalletProvider.tsx      connection, balance, account changes
  RoundProvider.tsx       round state machine, commit and claim
services/
  chain.ts                every on-chain call sits behind PrepumpClient
lib/
  rounds.ts               round configuration — the file you edit to go live
  types.ts, format.ts, links.ts
```

---

## Going live

### 1. Fill in the round

`lib/rounds.ts` is the only place round state is declared.

```ts
export const UPCOMING_ROUND: Round = {
  id: 1,
  status: "OPEN",              // was "UPCOMING"
  opensAt: Date.UTC(...),
  closesAt: Date.UTC(...),     // the countdown starts from this
  totalCommittedLamports: 0n,
  participants: 0,
  escrow: "…",                 // shown and linked once present
};

export const PLATFORM_FEE_BPS: number | null = 200; // was null
```

Setting `closesAt` swaps COMING SOON for the live countdown, swaps the facts
row for round numbers, and swaps the explainer panels for the commit panel and
the user's position. The status then follows the clock on its own: open, locked,
launching, claimable.

### 2. Implement the client

`services/chain.ts` defines `PrepumpClient`. `getBalance` already reads real
balances over JSON-RPC; the rest throws until you replace it with an
Anchor/web3.js implementation. No component needs to change.

```ts
export interface PrepumpClient {
  getBalance(wallet: string): Promise<bigint | null>;
  fetchRound(id: number): Promise<Round | undefined>;
  fetchCommitment(wallet: string, roundId: number): Promise<Commitment | null>;
  commit(params, onPhase): Promise<string>;
  claim(params, onPhase): Promise<string>;
}
```

`onPhase` drives the UI through `awaiting-signature` → `submitted` →
`confirmed`. A commitment is never shown as successful before the client
reports `confirmed`.

Set `NEXT_PUBLIC_SOLANA_RPC` to a dedicated endpoint. The default is the public
Solana endpoint, which is rate limited; when a balance read fails the wallet
menu says "Unavailable" rather than guessing.

### 3. Fill in the links

`lib/links.ts` holds the X, Telegram, docs, terms and privacy URLs. They are
`#` placeholders and are the only ones left in the interface.

### 4. Bring back history

Past rounds, the history table and per-round detail pages were removed rather
than filled with invented launches. `PAST_ROUNDS` in `lib/rounds.ts` is where
they return from, once real rounds exist.

---

## Wallets

`providers/WalletProvider.tsx` detects injected providers directly:

| Wallet   | Detection                                            |
| -------- | ---------------------------------------------------- |
| Phantom  | `window.phantom.solana` or `window.solana.isPhantom`  |
| Solflare | `window.solflare.isSolflare`                          |
| Backpack | `window.backpack.isBackpack`                          |

It reconnects silently through `connect({ onlyIfTrusted: true })` and follows
`accountChanged` and `disconnect` events. The connect dialog lists wallets
typographically with a single brand-coloured dot each, no third-party logos,
and says which are detected and which need installing.

PREPUMP never asks for a seed phrase, private key or recovery phrase, and the
amount, network and action are shown before any signature request.

---

## Copy rules kept in this build

- No guaranteed-return language anywhere.
- No fake urgency, no invented numbers, no placeholder addresses.
- Nothing about the token is shown before a round closes.
- Fees, lock conditions and refund behaviour are stated where the user acts,
  or explicitly marked as not yet disclosed.
- The risk notice appears in the footer and in the mobile menu.
