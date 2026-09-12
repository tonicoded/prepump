# PREPUMP — technical setup

Two surfaces, one codebase:

| Route            | Who sees it | What it does                                              |
| ---------------- | ----------- | --------------------------------------------------------- |
| `/`              | Everyone    | The public launch page. Stays **COMING SOON**.             |
| `/how-it-works`  | Everyone    | Explainer.                                                 |
| `/dev`           | You         | The meme machine: run a round and launch on pump.fun.      |

The public pages never read the dev state, and `/dev` never changes what a
visitor sees on `/`.

---

## 1. Environment

```bash
cp .env.example .env.local
```

`.env.local` is git-ignored. Nothing with a `NEXT_PUBLIC_` prefix may hold a
secret — that prefix compiles the value into the browser bundle.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `DEV_PORTAL_ENABLED` | `/dev` in production | `/dev` always works in `npm run dev`. In production it 404s unless this is `true`. |
| `DEV_PORTAL_ACCESS_TOKEN` | optional | Set it and every `/api/dev/*` call must carry it; leave it empty and none is asked for. `DEV_PORTAL_ENABLED` is what decides whether `/dev` exists. |
| `PREPUMP_EXECUTION_MODE` | launching | `simulate` (default) or `live`. |
| `SOLANA_RPC_URL` | live launch | Must be **mainnet** — pump.fun does not exist on devnet. Use Helius/QuickNode/Triton; the public endpoint is rate limited. |
| `LAUNCH_WALLET_SECRET_KEY` | launching | Base58 secret key (Phantom → export private key) or a `[1,2,3,…]` byte array. Keep it on your laptop; a deployment does not need it. |
| `NEXT_PUBLIC_DEPOSIT_ADDRESS` | deployed `/dev` | The launch wallet's public address. Lets a deployed site take deposits and show the balance without holding the key. |
| `PINATA_JWT` | optional | Leave empty and uploads go through pump.fun's own IPFS endpoint, no account needed. Set it to own the pin and the gateway instead. |
| `PUMPFUN_DEV_BUY_SOL` | live launch | SOL bought in the same transaction as the create. Default `0.01`. |
| `PUMPFUN_SLIPPAGE`, `PUMPFUN_PRIORITY_FEE` | live launch | Defaults `10` and `0.00005`. |
| `TOKEN_LINK_*` | metadata | Website, X and Telegram written into the token's IPFS metadata. Already filled in. |
| `TOKEN_IMAGE_SIZE` | generation | The square the artwork is resized to before pinning. Default `512`. |
| `OPENAI_API_KEY` | generation | Optional. Without it the generator uses a local fallback list and no image. |
| `OPENAI_MODEL` | generation | Text model for the meme concept. Default `gpt-5.6-luna` (cheap and fast); `gpt-5.6-terra` or `gpt-6-astra` for stranger ideas. |
| `OPENAI_IMAGE_MODEL` | generation | Artwork model. Default `gpt-image-2.5-flare`; `gpt-image-2.5-sunburst` is the most capable and slower. |
| `OPENAI_IMAGE_QUALITY` | generation | `low`, `medium` (default), `high`, `xhigh` or `max`. |
| `OPENAI_IMAGE_SIZE` | generation | Default `1024x1024`. Square is what pump.fun shows. |

### The launch wallet

Use a **burner**, funded with only what a launch costs. It signs the create
transaction and pays for it. Roughly what it needs:

| Item | Cost |
| --- | --- |
| Mint account rent + pump.fun create | ~0.02 SOL |
| Dev buy | `PUMPFUN_DEV_BUY_SOL` |
| Priority fee | `PUMPFUN_PRIORITY_FEE` |

The portal refuses to launch below that total and tells you the shortfall.

---

## 2. Running a round

```bash
npm run dev      # http://localhost:3000/dev
```

The machine walks one round from top to bottom:

1. **Open deposits** — the round starts accepting buys.
2. **Connect wallet / Buy N SOL** — pool, wallet count, your share and your
   token allocation update live.
3. **Lock deposits** — no more buys. An optional one-line prompt steers the
   generator.
4. **Run T-0** — the button while deposits are locked. It generates the name,
   ticker, tagline and description from `OPENAI_MODEL`, then the artwork from
   `OPENAI_IMAGE_MODEL`, and **only once both are in** does it create the
   token on pump.fun. Until then the card shows a blurred image and `$????`.

   Untick *Launch automatically* to stop after generation and inspect the meme
   before launching by hand. If the artwork call fails the round still gets its
   token, an amber warning appears, and the automatic launch is held back so
   you decide: relaunch the generator, or launch anyway with the PREPUMP mark
   as token art.
5. **Open on pump.fun** — the mint, the transaction and the coin page.

Round state lives in `localStorage`, so a refresh keeps your place. **Reset**
clears it and bumps the round number.

---

## 3. Going live

Set in `.env.local`:

```
PREPUMP_EXECUTION_MODE=live
SOLANA_RPC_URL=<your mainnet RPC>
LAUNCH_WALLET_SECRET_KEY=<burner secret key>
PINATA_JWT=<pinata jwt>
```

Restart the dev server. `/dev` now shows a red **LIVE MAINNET · REAL SOL** chip
and the launch button turns red. Before it fires you must type
`LAUNCH 001` (the round number) by hand.

What then happens, server-side only:

1. Check the launch wallet's balance against the cost above.
2. Pin the image to IPFS, then pin a metadata JSON that points at it.
3. Ask `pumpportal.fun/api/trade-local` for a serialized create transaction.
4. Sign it locally with a freshly generated mint keypair and the launch wallet.
5. Broadcast through your own RPC and poll until the signature confirms.
6. Return the mint, the signature, the pump.fun URL and the IPFS URIs.

The secret key never leaves the server and is never sent to PumpPortal — the
local-transaction API returns an unsigned transaction, so no third party can
move funds on the wallet's behalf.

**This spends real SOL and creates a real token that anyone can trade. There is
no undo.**

---

## 3b. How the artwork is made

Each round samples a subject, situation and comedy lens from lists in
`lib/round/meme.ts` — an animal having a low-stakes crashout, an appliance with
unearned confidence, a statue with unnecessary lore — so rounds do not all
land on the same cat or the same trading joke. The text model also gets a small
live web-search budget to pick up the structure and language of current meme
trends. It may borrow the comedic grammar, but is explicitly forbidden from
copying characters, catchphrases, celebrities or brands.

The model is told that the **name and ticker must describe the character in the
picture**, while the tagline supplies the actual punchline. Cliches such as
“to the moon”, “diamond hands”, “HODL” and generic adjective-plus-animal names
are rejected in the prompt.

The house style is fixed in one constant: a believable found photo with phone
camera flaws, cut out as a low-fi sticker on a flat acid-green background with a
hard white outline. The prompt explicitly avoids glossy surfaces, perfect
symmetry, cinematic light, mascot poses and other common AI-image tells. It also
forbids text, real people and existing meme characters. That is the same basic
look as the stickers on the public page, but rougher and more photographic.

The image comes back at `OPENAI_IMAGE_SIZE`, then sharp crops it to a
`TOKEN_IMAGE_SIZE` square webp before it is pinned. That keeps the payload
small and gives pump.fun exactly the square it displays.

To steer one round by hand, type a direction into the field that appears when
deposits lock. It replaces the random subject for that round only.

The dev portal also offers seven creative modes: live trend, classic meme
remix, brand parody, stock parody, office crashout, animal lore and cursed
object. Quick ideas include a McDonald's night-shift cat, a Wojak board meeting
and an NVIDIA pigeon. Classic mode deliberately uses a rough, recompressed
forum-drawing style; the other modes keep the found-photo sticker style.

Brand and stock modes are labelled as unofficial parody in the generated token
description. Stock mode is a cultural/visual reference only: it does not track,
hold or distribute the named stock. A real stock-reward product needs a separate
fee engine and cannot be represented honestly through ordinary pump.fun token
metadata.

The command-line generator accepts the same modes through `.env.local`:

```bash
ROUND_MEME_MODE=classic
ROUND_THEME="Wojak presenting one terrible idea to an empty boardroom"
```

## 3c. Running a real round from the command line

The dev portal is for testing the flow. A real round is run from the terminal,
by you, when the countdown reaches zero. There is no scheduler and no bot: a
Solana program cannot wake itself up, so something has to press the button, and
that something is you.

The deposit wallet **is** the launch wallet. People send SOL to that address
during the round window; at T-0 the script reads what arrived, uses it to buy on
pump.fun, and pays everyone back in tokens.

Set the window in `.env.local`:

```
ROUND_ID=1
ROUND_OPENS_AT=2026-09-15T18:00:00Z
ROUND_CLOSES_AT=2026-09-22T20:00:00Z
ROUND_RESERVE_SOL=0.05
DEV_CUT_PERCENT=2
```

`ROUND_ID` is only the starting floor. The CLI reads `.round/` and advances the
number automatically after every launch; you do not edit `.env.local` between
rounds. `scan`, `launch`, `go` and `auto` continue the highest unlaunched round
or start the next one. `distribute` selects the latest unfinished launch, while
`rewards` and `owner` select the latest launched coin. Use `--round <id>` only
as an explicit recovery or inspection override.

Then:

```bash
npm run round -- status              # config, wallet, balance, window
npm run round -- scan                # who deposited what
npm run round -- launch --yes        # generate the meme, create it on pump.fun
npm run round -- distribute --yes    # send every depositor their share
npm run round -- rewards --yes       # claim creator fees to the dev wallet
npm run round -- rewards --all --yes # claim every owner and sweep to main
npm run round -- owner               # show this round's coin-owner wallet
npm run round -- go --yes            # launch, then distribute
npm run round -- auto --yes          # wait for T-0, then do all of it
```

Note the bare `--`. Without it npm swallows flags like `--yes` instead of
passing them to the script.

For an ad-hoc round, prefer an exact lower boundary when an earlier test falls
inside the same rolling hour:

```bash
npm run round -- scan --after 2026-09-12T18:15:00Z
npm run round -- go --yes --after 2026-09-12T18:15:00Z
```

`--after` uses the supplied UTC timestamp as the opening time and the command's
start time as the close. It cannot be combined with `--last`.

**What `launch` does.** It rescans deposits, works out the buy amount as
`min(total deposited, wallet balance − reserve)`, generates name, ticker,
description and artwork, while preparing one fresh owner wallet for that round.
Only after the artwork passes its checks does the permanent deposit wallet fund
that owner with the buy plus required launch and payout costs. The fresh wallet
creates the token, receives the initial buy, distributes the tokens and owns
that coin's creator-reward vault. Public round
data lands in `.round/round-001.json`; its private key is stored separately in
`.round/owners/` with `0600` permissions. The entire `.round/` directory is
git-ignored.

The launch output prints the owner address and key-file path. To import it into
a wallet, reveal the base58 secret explicitly (this writes the secret to your
terminal history/output, so only do it privately):

```bash
npm run round -- owner --round 1 --show-secret
```

It refuses to run before `ROUND_CLOSES_AT` unless you pass `--now`, refuses to
launch a round twice unless you pass `--force`, and refuses to launch without
artwork unless you pass `--no-art`.

**Running it hands-off.** `auto` waits for `ROUND_CLOSES_AT` and then runs
scan, launch and distribute by itself. Add `--rewards` and it passes the creator
fees on to holders afterwards too.

```bash
npm run round -- auto --yes --rewards
```

Leave it running in a terminal and walk away. Everything that could refuse the
launch — a missing wallet, a bad window, a round that already launched — is
checked before the wait starts, not after it. There is still no scheduler
anywhere: close the terminal and nothing fires.

`ROUND_OPENS_AT` is optional. Left empty it is taken as `ROUND_CLOSES_AT` minus
`ROUND_LENGTH_HOURS`, which defaults to one week.

**What `distribute` does.** It reads how many tokens the buy actually produced,
keeps `DEV_CUT_PERCENT`, and splits the rest strictly in proportion to each
wallet's deposit. Payouts go out five per transaction, each one recorded in the
round file, so re-running the command retries only what failed.

The deposit scanner reads transaction details sequentially with a short pause,
which keeps it usable on rate-limited public RPC endpoints. It also loads the
deposit signatures from every earlier `.round/round-*.json` record and excludes
them. Overlapping rolling windows such as repeated `--last 60` scans therefore
cannot count the same deposit in two rounds. Incoming transfers from generated
owner wallets are also excluded, so creator-reward sweeps returning to the
deposit wallet can never be mistaken for a participant deposit.

**Creator rewards.** pump.fun pays the coin's creator a share of every trade,
into a vault owned by the per-round owner wallet. `rewards` automatically loads
the matching owner key and claims into that wallet. Legacy rounds without a
separate owner continue using `LAUNCH_WALLET_SECRET_KEY`.

Add `--split` to share it with holders instead: it snapshots who holds the coin
at that moment and pays out in proportion to their balance, keeping
`DEV_CUT_PERCENT` back. The bonding curve holds the unsold supply so it is
excluded, as is the creator wallet itself, and shares below `--min` (0.00001 SOL)
are dropped rather than costing more in fees than they are worth. If nobody
holds the coin, nothing is claimed and the vault keeps the SOL.

Every new coin has a separate creator vault because every round now has a
separate creator wallet. `--mint <address>` finds the matching local round and
uses its owner key when claiming or splitting rewards.

To collect every generated owner-wallet at once, use:

```bash
npm run round -- rewards --all --yes
```

The command first claims the permanent wallet once for legacy coins, then
claims each generated owner wallet independently. Everything above
`WALLET_FLOOR_SOL` (plus a small transfer-fee buffer) is swept into the
permanent `LAUNCH_WALLET_SECRET_KEY` / deposit wallet. It keeps that floor in
every owner so the wallet can pay for future creator-fee claims. The operation
is safe to repeat: a previously claimed vault reports nothing new, while any
balance left behind by an interrupted sweep is recovered on the next run. One
failed owner is reported but does not prevent the remaining owners from being
processed.

Before signing, every claim is simulated in full. Claims whose estimated net
wallet increase after network fees, priority fees and any new token-account
rent is less than `0.00005 SOL` are deferred until more rewards accumulate.
The exact transaction returned for that simulation is reused for the claim, so
PumpPortal is contacted only once per wallet. Override the safety margin only
when necessary with `--min-claim <sol>`.

**Deposits that cannot be paid.** Someone sending from an exchange has no wallet
of their own in the transaction, so the sender cannot be identified. Those
amounts are reported separately by `scan` and excluded from the split.

**The floor on a launch.** Measured across three real launches, the cost on top
of the buy is:

| Part | Cost |
| --- | --- |
| Rent for the mint, metadata and token accounts | ~0.0071 SOL, flat |
| pump.fun's cut of the dev buy | ~1.70% of the buy |
| Priority fee | `PUMPFUN_PRIORITY_FEE` |

So the wallet needs roughly `0.009 + buy × 1.02`. The defaults carry a little
margin over the measured figures; tune them with `ROUND_CREATE_COST_SOL` and
`PUMPFUN_BUY_FEE_PERCENT` if pump.fun changes its pricing.

Older guides quote a flat 0.02 SOL creation fee. That is out of date: pump.fun
moved it into the first buy, and since the launch wallet *is* the first buyer it
shows up as the percentage above rather than as a separate charge.

`npm run round -- status` prints the minimum for your settings and how far short
the wallet is.

**A cheap test round.** Fund the wallet with ~0.02 SOL, send a dollar of SOL to
it **from a different wallet**, then:

```bash
npm run round scan --last 60
npm run round launch --yes --now --last 60
```

`--last 60` uses the past hour as the window so you do not have to set
timestamps, and `--now` skips the wait for the closing time. Add `--buy 0` to
create the token without any buy at all, or `--buy 0.004` to pin the amount.
A deposit sent from the launch wallet to itself is not counted: the scanner
ignores anything the wallet signed.

**Where the image and metadata live.** pump.fun's create instruction takes a
URI pointing at a metadata JSON, so something has to host it. Two ways:

| | Setup | Notes |
| --- | --- | --- |
| pump.fun IPFS *(default)* | none | One request, no account. The same endpoint their website uses. Returns `ipfs.io` URLs. |
| Pinata | free account, `PINATA_JWT` | You own the pin, and `PINATA_GATEWAY_URL` decides which gateway serves it. |

Both put the files on IPFS for real. The difference matters because the
`ipfs.io` gateway is being retired for direct fetches and now answers with a
service-worker notice instead of the JSON, while Pinata's gateway still serves
the raw file. Tokens launched through pump.fun's own site carry the same
`ipfs.io` URLs, so nothing is broken — but if you want both the metadata and
the image on a gateway that serves them straight, use Pinata.

**The browser never calls Solana directly.** `api.mainnet-beta.solana.com`
answers browser origins with `403 Access forbidden`, and a paid endpoint in
`NEXT_PUBLIC_SOLANA_RPC` would put its key in the client bundle. So the page
posts to `/api/rpc` on your own domain, which forwards to `SOLANA_RPC_URL`
server side and only allows the handful of read methods the interface needs.
Point `NEXT_PUBLIC_SOLANA_RPC` at a browser-capable endpoint to skip the hop;
set to a public Solana endpoint it is ignored, because that cannot work.

**Rate limits.** Scanning uses batched RPC calls with exponential backoff, so
the public endpoint works, just slowly. A paid RPC in `SOLANA_RPC_URL` turns a
several-minute scan into seconds. Worth it for a launch.

## 3b-2. Previewing memes without launching

```bash
npm run round -- memes --count 9                 # 9 previews, default mode
npm run round -- memes --mode animal --count 6   # one mode
npm run round -- memes --theme "office goose"    # steer the batch
```

Nothing is launched; it only spends OpenAI credits. Each image lands in
`.round/previews/<timestamp>/` with a labelled `sheet.png` contact sheet and a
`memes.json` of names, tickers, taglines, styles and slogans.

Every meme samples four things independently: a subject (animals, archetypes,
statues, objects, food), a beat (what just happened to it), a comedy lens and a
**visual style** — hype toy over a stock ticker, green cut-out sticker, found
phone photo, deep-fried reaction image, fake-rich flex photo, cursed stock photo,
bootleg action figure, office clip art, Renaissance portrait, security camera
still, claymation, or classic forum drawing for the `classic` mode. Styles that
suit it carry a short ALL-CAPS slogan printed on a shirt, cap, box or whiteboard
(`STOP BEING POOR` energy). Each mode only draws from styles that fit it.

## 4. What is real and what is not

| Piece | Status |
| --- | --- |
| pump.fun token creation | **Real.** Mainnet, from your wallet. |
| Meme text | **Real** with an OpenAI key; a local fallback list otherwise. |
| Meme artwork | **Real** image generation, pinned to IPFS and used as the token's image. |
| IPFS image + metadata | **Real** via Pinata. |
| Launch wallet balance | **Real**, read over JSON-RPC. |
| Connected wallet balance | **Real**, read over JSON-RPC. |
| Deposits, shares and payouts via `npm run round` | **Real.** Read from chain, paid out in SPL transfers. |
| Pool numbers inside `/dev` | **Local bookkeeping**, for testing the UI. |

There is no escrow program. Deposits sit in your wallet between the open and
the launch, which means depositors are trusting you to run the script and pay
out — there is nothing on chain forcing it, and no refund path if a round is
abandoned. Say so plainly wherever you ask people to deposit.

Replacing that trust with a PDA, a snapshot at lock time and a claim
instruction is the one piece of real protocol work left. Everything the UI
would need from such a program already sits behind one interface,
`PrepumpClient` in `services/chain.ts`.

---

## 5. Where the code lives

```
scripts/round.ts                 the operator CLI you run at T-0
lib/round/config.ts              env → typed round config
lib/round/deposits.ts            reads incoming SOL, groups it by sender
lib/round/meme.ts                OpenAI text + artwork
lib/round/pumpfun.ts             IPFS pin, create, sign, broadcast
lib/round/distribute.ts          proportional SPL payouts
lib/round/store.ts               .round/round-XXX.json
app/dev/page.tsx                 route, gated on DEV_PORTAL_ENABLED
app/api/dev/status/route.ts      config + launch wallet balance
app/api/dev/generate/route.ts    meme generation
app/api/dev/launch/route.ts      simulate or live launch
components/dev/DevPortal.tsx     the single-screen machine
lib/server/env.ts                env parsing, access control
lib/dev/tokenomics.ts            supply split and share maths
services/server/*                thin server-only wrappers around lib/round
```

## 5b. Deploying /dev

The public pages need nothing. To reach `/dev` on your own domain, set at the
host:

```
DEV_PORTAL_ENABLED=true
NEXT_PUBLIC_DEPOSIT_ADDRESS=<the launch wallet address>
NEXT_PUBLIC_SOLANA_RPC=<your RPC>
SOLANA_RPC_URL=<your RPC>
OPENAI_API_KEY=<key>          # only if you want to generate from the browser
```

**Leave `LAUNCH_WALLET_SECRET_KEY` off the host.** With only the public address
set, a deployed `/dev` can take deposits and show balances, while creating the
token stays on your laptop where the key lives. Nothing on the server can move
the wallet's funds.

`DEV_PORTAL_ACCESS_TOKEN` is optional. Leave it empty and `/dev` is reachable by
anyone who knows the path, which on a domain only you use is a fair trade. Set
it and a field appears at the bottom of `/dev`; paste it once and it is kept for
that tab.

## 6. Security notes

- `/dev` and every `/api/dev/*` route are gated by `DEV_PORTAL_ENABLED` and, in
  production, by `DEV_PORTAL_ACCESS_TOKEN` compared in constant time.
- The dev page is `noindex, nofollow`.
- Secrets are read only inside `"server-only"` modules.
- Never paste a seed phrase anywhere in this project. A secret key for a burner
  is what the launch wallet takes, and nothing else needs one.
