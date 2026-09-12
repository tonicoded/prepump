"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  DevConfigStatus,
  DevRoundPhase,
  GeneratedMeme,
  LaunchReceipt,
  LaunchWalletStatus,
} from "@/lib/dev/types";
import {
  calculatePoolShare,
  calculateTokenAllocation,
  HOLDER_ALLOCATION_PERCENT,
} from "@/lib/dev/tokenomics";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { browserRpcUrl, waitForConfirmation } from "@/lib/round/rpc";
import { useWallet } from "@/providers/WalletProvider";
import { shortAddress } from "@/lib/format";
import {
  DEFAULT_MEME_MODE,
  MEME_MODES,
  type MemeMode,
} from "@/lib/round/meme-modes";

// Bump when persisted round semantics change. v3 clears legacy pools that
// remained visible after their coin had already launched.
const STORAGE_KEY = "prepump.dev.round.v3";
const MYSTERY_ART = "/meme-mystery.png";
const PRESETS = [0.1, 0.5, 1, 5];
const CREATIVE_PRESETS: {
  label: string;
  mode: MemeMode;
  theme: string;
}[] = [
  {
    label: "McDonald's cat",
    mode: "brand",
    theme:
      "a dead-serious cat working the overnight shift at McDonald's during a tiny fry emergency",
  },
  {
    label: "Wojak board meeting",
    mode: "classic",
    theme:
      "Wojak presenting one terrible idea to an empty boardroom with total confidence",
  },
  {
    label: "NVIDIA pigeon",
    mode: "stock",
    theme:
      "an NVIDIA-obsessed pigeon guarding one graphics card like a Wall Street analyst",
  },
  {
    label: "CEO capybara",
    mode: "workplace",
    theme:
      "a capybara CEO calling an emergency meeting because the office printer blinked",
  },
  {
    label: "Cursed air fryer",
    mode: "cursed",
    theme:
      "a dented air fryer receiving an employee of the month award it made itself",
  },
];

type RoundState = {
  phase: DevRoundPhase;
  roundId: number;
  totalSol: number;
  participants: number;
  ownSol: number;
  token: GeneratedMeme | null;
  receipt: LaunchReceipt | null;
  lastDeposit?: string;
};

const initialState = (roundId: number): RoundState => ({
  ...INITIAL,
  roundId,
});

const INITIAL: RoundState = {
  phase: "UPCOMING",
  roundId: 1,
  totalSol: 0,
  participants: 0,
  ownSol: 0,
  token: null,
  receipt: null,
};

const PHASE_LABEL: Record<DevRoundPhase, string> = {
  UPCOMING: "Round closed",
  OPEN: "Deposits open",
  LOCKED: "Deposits locked",
  GENERATING: "Cooking the meme",
  READY: "Ready to launch",
  LAUNCHED: "Live on pump.fun",
};

export function DevPortal({ config }: { config: DevConfigStatus }) {
  const {
    status: walletStatus,
    address,
    openModal,
    sendTransaction,
    refreshBalance,
  } = useWallet();
  const connected = walletStatus === "connected";
  const live = config.executionMode === "live";

  const [state, setState] = useState<RoundState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [amount, setAmount] = useState("1");
  const [theme, setTheme] = useState("");
  const [memeMode, setMemeMode] = useState<MemeMode>(DEFAULT_MEME_MODE);
  const [confirmation, setConfirmation] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [wallet, setWallet] = useState<LaunchWalletStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [autoLaunch, setAutoLaunch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [depositing, setDepositing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ------------------------------- state ------------------------------- */

  useEffect(() => {
    let saved: RoundState | null = null;
    let token = "";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw) as RoundState;
      token = sessionStorage.getItem("prepump.dev.token") ?? "";
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      // A round that the operator has already moved past must not linger.
      if (saved && saved.roundId === config.roundId) setState(saved);
      else setState(initialState(config.roundId));
      setAccessToken(token);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [config.roundId]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* image payload too large for this browser — session only */
    }
  }, [hydrated, state]);

  const api = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const response = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(accessToken ? { "x-dev-token": accessToken } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json()) as T & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }
      return payload;
    },
    [accessToken],
  );

  const refreshWallet = useCallback(async () => {
    try {
      const result = await api<{ wallet: LaunchWalletStatus }>("/api/dev/status");
      setWallet(result.wallet);
      setStatusError(
        result.wallet.address ? null : "No deposit wallet configured on the server.",
      );
    } catch (cause) {
      setWallet(null);
      const message =
        cause instanceof Error ? cause.message : "Could not reach the server.";
      setStatusError(
        /401|token/i.test(message)
          ? "Enter the dev access token at the bottom of this card."
          : message,
      );
    }
  }, [api]);

  useEffect(() => {
    if (!config.launchWalletConfigured) return;
    const timer = setTimeout(() => void refreshWallet(), 250);
    return () => clearTimeout(timer);
  }, [config.launchWalletConfigured, refreshWallet, accessToken]);

  /**
   * A launch performed by `npm run round` happens outside this browser, so it
   * cannot update React or localStorage directly. While a local deposit is still
   * displayed, watch the chain for a later transaction signed by the launch
   * wallet. Incoming deposits do not qualify; a signed outgoing transaction
   * means the operator has started settling/launching and the old pool is no
   * longer available.
   */
  useEffect(() => {
    if (
      !hydrated ||
      !state.lastDeposit ||
      state.totalSol <= 0 ||
      !wallet?.address
    ) {
      return;
    }

    const watchedDeposit = state.lastDeposit;
    const launchAddress = wallet.address;
    let cancelled = false;
    let checking = false;

    const checkForExternalLaunch = async () => {
      if (checking || cancelled) return;
      checking = true;
      try {
        const connection = new Connection(browserRpcUrl(), "confirmed");
        const publicKey = new PublicKey(launchAddress);
        const newer = await connection.getSignaturesForAddress(publicKey, {
          until: watchedDeposit,
          limit: 25,
        });

        for (const entry of newer) {
          if (entry.err) continue;
          const transaction = await connection.getParsedTransaction(
            entry.signature,
            { maxSupportedTransactionVersion: 0 },
          );
          const signedByLaunchWallet = transaction?.transaction.message.accountKeys.some(
            (key) => key.signer && key.pubkey.toBase58() === launchAddress,
          );
          if (!signedByLaunchWallet) continue;

          if (!cancelled) {
            setState((current) =>
              current.lastDeposit === watchedDeposit
                ? {
                    ...current,
                    phase: "UPCOMING",
                    totalSol: 0,
                    participants: 0,
                    ownSol: 0,
                    token: null,
                    receipt: null,
                    lastDeposit: undefined,
                  }
                : current,
            );
            void refreshWallet();
          }
          return;
        }
      } catch {
        // A temporary RPC failure must not erase the pool or disturb deposits.
        // The next poll retries automatically.
      } finally {
        checking = false;
      }
    };

    void checkForExternalLaunch();
    const timer = window.setInterval(() => void checkForExternalLaunch(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    hydrated,
    refreshWallet,
    state.lastDeposit,
    state.totalSol,
    wallet?.address,
  ]);

  /* ------------------------------ actions ------------------------------ */

  const share = calculatePoolShare(state.ownSol, state.totalSol);
  const allocation = calculateTokenAllocation(state.ownSol, state.totalSol);
  const revealed = state.token !== null;
  const parsedAmount = Number(amount);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

  /**
   * A real transfer from the connected wallet to the deposit wallet. The
   * operator's `npm run round scan` reads exactly these transactions back.
   */
  const buy = async () => {
    if (!validAmount) {
      setError("Enter a SOL amount above zero.");
      return;
    }
    if (!address) return;
    if (!wallet?.address) {
      setError("The deposit wallet is not configured on the server.");
      return;
    }

    setError(null);
    setDepositing("Confirm in your wallet…");
    try {
      const connection = new Connection(browserRpcUrl(), "confirmed");
      const from = new PublicKey(address);
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");

      const transaction = new Transaction({
        feePayer: from,
        blockhash,
        lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: from,
          toPubkey: new PublicKey(wallet.address),
          lamports: Math.round(parsedAmount * 1e9),
        }),
      );

      const signature = await sendTransaction(transaction);
      setDepositing("Confirming…");
      await waitForConfirmation(connection, signature);

      setState((current) => ({
        ...current,
        totalSol: current.totalSol + parsedAmount,
        ownSol: current.ownSol + parsedAmount,
        participants: current.participants + (current.ownSol === 0 ? 1 : 0),
        lastDeposit: signature,
      }));
      setDepositing(null);
      void refreshWallet();
      void refreshBalance();
    } catch (cause) {
      setDepositing(null);
      const message =
        cause instanceof Error ? cause.message : "The deposit failed.";
      setError(
        /reject|denied|cancel/i.test(message) ? "You rejected the transfer." : message,
      );
    }
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    setState((current) => ({ ...current, phase: "GENERATING" }));
    try {
      const result = await api<{ token: GeneratedMeme }>("/api/dev/generate", {
        theme: theme || undefined,
        mode: memeMode,
        includeImage: config.openAiConfigured,
      });
      setState((current) => ({ ...current, phase: "READY", token: result.token }));

      // T-0 rule: the launch only fires once the text *and* the artwork are in.
      if (autoLaunch && result.token.imageDataUrl) {
        await launch(result.token);
        return;
      }
    } catch (cause) {
      setState((current) => ({ ...current, phase: "LOCKED" }));
      setError(cause instanceof Error ? cause.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const launch = async (token = state.token) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ receipt: LaunchReceipt }>("/api/dev/launch", {
        roundId: state.roundId,
        token: {
          name: token.name,
          ticker: token.ticker,
          description: token.description,
          imageDataUrl: token.imageDataUrl,
        },
        confirmation: confirmation.trim().toUpperCase() || undefined,
      });
      setState((current) => ({
        ...current,
        phase: "LAUNCHED",
        receipt: result.receipt,
        totalSol: 0,
        participants: 0,
        ownSol: 0,
        lastDeposit: undefined,
      }));
      setConfirmation("");
      void refreshWallet();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Launch failed.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setState(initialState(state.roundId + 1));
    setTheme("");
    setMemeMode(DEFAULT_MEME_MODE);
    setConfirmation("");
    setError(null);
  };

  const operator: {
    label: string;
    run: () => void;
    danger?: boolean;
    secondary?: boolean;
  } | null =
    state.phase === "UPCOMING"
      ? {
          label: "Open deposits",
          run: () => setState((c) => ({ ...c, phase: "OPEN" })),
        }
      : state.phase === "OPEN"
        ? {
            label: "Lock deposits",
            run: () => setState((c) => ({ ...c, phase: "LOCKED" })),
            secondary: connected,
          }
        : state.phase === "LOCKED"
          ? {
              label: autoLaunch
                ? live
                  ? "Run T-0 · generate + launch"
                  : "Run T-0 · generate + simulate"
                : "Generate the meme",
              run: () => void generate(),
              danger: autoLaunch && live,
            }
          : state.phase === "GENERATING"
            ? { label: "Cooking…", run: () => {} }
            : state.phase === "READY"
              ? {
                  label: live ? "Launch for real on pump.fun" : "Simulate launch",
                  run: () => void launch(),
                  danger: live,
                }
              : null;

  const roundLabel = `#${String(state.roundId).padStart(3, "0")}`;

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[112rem] items-center justify-center px-[clamp(0.875rem,4vw,3rem)] py-[clamp(1rem,3vh,2rem)]">
      <div className="dev-stage">
        <span className="meme-round-sticker">
          DEV LAB · ROUND {roundLabel}
        </span>

        <div className="dev-machine" data-tab={`MEME MACHINE // ${state.phase}`}>
          <div className="dev-chip-row">
            <span className="dev-chip">{PHASE_LABEL[state.phase]}</span>
            <span className={`dev-chip ${live ? "dev-chip-live" : "dev-chip-good"}`}>
              {live ? "LIVE MAINNET · REAL SOL" : "SIMULATE · NO BROADCAST"}
            </span>
          </div>

          {/* -------------------------- the meme -------------------------- */}
          <div className={`dev-reveal ${revealed ? "revealed" : ""}`}>
            <div className={`dev-art ${revealed ? "revealed" : ""}`}>
              {revealed && !state.token?.imageDataUrl ? (
                <span className="dev-art-fallback">
                  {state.token?.ticker.slice(0, 2)}
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.token?.imageDataUrl ?? MYSTERY_ART}
                  alt={
                    revealed
                      ? `${state.token?.name} artwork`
                      : "Hidden token artwork"
                  }
                />
              )}
              <span className="dev-art-mark">?</span>
              <span className="dev-art-scan" aria-hidden />
            </div>

            <div className="min-w-0 flex-1">
              <p className="dev-ticker">${state.token?.ticker ?? "????"}</p>
              <p className="dev-name">{state.token?.name ?? "Unnamed until T-0"}</p>
              <p className="dev-tagline">
                {state.token?.tagline ??
                  "Name, ticker and artwork are generated after deposits lock."}
              </p>
            </div>
          </div>

          {/* ------------------------- buy / connect ---------------------- */}
          {state.phase === "OPEN" &&
            (connected ? (
              <>
                <div className="dev-buy">
                  <input
                    value={amount}
                    onChange={(event) =>
                      setAmount(
                        event.target.value
                          .replace(/,/g, ".")
                          .replace(/[^0-9.]/g, "")
                          .replace(/(\..*)\./g, "$1"),
                      )
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label="Amount of SOL to buy"
                  />
                  <span className="dev-buy-unit">SOL</span>
                </div>

                <div className="dev-presets">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={parsedAmount === preset}
                      onClick={() => setAmount(String(preset))}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="dev-action"
                  onClick={() => void buy()}
                  disabled={!validAmount || depositing !== null || !wallet?.address}
                >
                  {depositing ??
                    (wallet?.address
                      ? `Send ${validAmount ? parsedAmount : 0} SOL`
                      : "Deposit wallet unavailable")}
                </button>

                {statusError && <p className="dev-warn">{statusError}</p>}

                {wallet?.address && (
                  <p className="dev-note">
                    Goes to {wallet.address.slice(0, 6)}…{wallet.address.slice(-6)}
                    {state.lastDeposit && (
                      <>
                        {" · "}
                        <a
                          className="dev-link"
                          href={`https://solscan.io/tx/${state.lastDeposit}`}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          last deposit
                        </a>
                      </>
                    )}
                  </p>
                )}
              </>
            ) : (
              <button type="button" className="dev-action" onClick={openModal}>
                Connect wallet
              </button>
            ))}

          {state.phase === "LOCKED" && (
            <div className="dev-creative-lab">
              <div className="dev-creative-fields">
                <select
                  className="dev-theme dev-mode-select"
                  value={memeMode}
                  onChange={(event) =>
                    setMemeMode(event.target.value as MemeMode)
                  }
                  aria-label="Meme creative mode"
                >
                  {MEME_MODES.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <input
                  className="dev-theme"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                  placeholder="Character, brand, stock, meme or weird situation…"
                  maxLength={180}
                />
              </div>
              <p className="dev-mode-help">
                {MEME_MODES.find((mode) => mode.id === memeMode)?.description}
              </p>
              <div className="dev-idea-row" aria-label="Quick meme ideas">
                {CREATIVE_PRESETS.map((idea) => (
                  <button
                    key={idea.label}
                    type="button"
                    onClick={() => {
                      setMemeMode(idea.mode);
                      setTheme(idea.theme);
                    }}
                  >
                    {idea.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(state.phase === "READY" || (state.phase === "LOCKED" && autoLaunch)) &&
            live && (
            <input
              className="dev-confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={`Type LAUNCH ${String(state.roundId).padStart(3, "0")}`}
              autoComplete="off"
            />
          )}

          {(state.phase === "LOCKED" || state.phase === "READY") && (
            <label className="dev-toggle">
              <input
                type="checkbox"
                checked={autoLaunch}
                onChange={(event) => setAutoLaunch(event.target.checked)}
              />
              <span>Launch automatically once name, ticker and art are ready</span>
            </label>
          )}

          {/* --------------------------- operator ------------------------- */}
          {operator && (
            <div className="dev-op-row">
              <button
                type="button"
                className={`dev-action ${operator.danger ? "dev-action-danger" : ""} ${
                  operator.secondary ? "dev-action-quiet" : ""
                }`}
                onClick={operator.run}
                disabled={busy}
              >
                {busy
                  ? state.phase === "GENERATING"
                    ? "Cooking the meme…"
                    : "Working…"
                  : operator.label}
              </button>
              <button type="button" className="dev-action-ghost" onClick={reset}>
                Reset
              </button>
            </div>
          )}

          {state.phase === "LAUNCHED" && state.receipt && (
            <>
              <div className="dev-op-row">
                <a
                  className="dev-action text-center"
                  href={state.receipt.pumpFunUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open on pump.fun
                </a>
                <button type="button" className="dev-action-ghost" onClick={reset}>
                  New round
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <a
                  className="dev-link"
                  href={state.receipt.explorerTx}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Transaction
                </a>
                <span className="dev-note">
                  MINT {shortAddress(state.receipt.mint, 6, 6)} ·{" "}
                  {state.receipt.mode === "live" ? "REAL" : "SIMULATED"} · DEV BUY{" "}
                  {state.receipt.devBuySol} SOL
                </span>
              </div>
            </>
          )}

          {error && <p className="dev-error">{error}</p>}

          {state.token?.imageError && (
            <p className="dev-warn">
              {state.token.imageError} The launch falls back to the PREPUMP
              mark as token art.
            </p>
          )}

          {/* --------------------------- readout -------------------------- */}
          <div className="dev-readout">
            <div>
              <span>Pool</span>
              <strong>{state.totalSol.toFixed(2)} SOL</strong>
            </div>
            <div>
              <span>Wallets</span>
              <strong>{state.participants}</strong>
            </div>
            <div>
              <span>Your buy</span>
              <strong>{state.ownSol.toFixed(2)} SOL</strong>
            </div>
            <div>
              <span>Your share</span>
              <strong className="accent">{(share * 100).toFixed(2)}%</strong>
            </div>
            <div>
              <span>Allocation</span>
              <strong>{allocation.toLocaleString()}</strong>
            </div>
            <div>
              <span>Launch wallet</span>
              <strong>
                {wallet?.balanceSol !== null && wallet?.balanceSol !== undefined
                  ? `${wallet.balanceSol.toFixed(3)} SOL`
                  : "—"}
              </strong>
            </div>
          </div>

          <p className="dev-note">
            <span>
              {HOLDER_ALLOCATION_PERCENT}% of supply to holders ·{" "}
              {connected && address
                ? shortAddress(address, 4, 4)
                : "wallet not connected"}
            </span>
            <span className="dev-note-extra">
              {" "}
              · deposits are real transfers, paid back in tokens by the operator
              script · RPC {config.rpcHost}
            </span>
          </p>

          {config.accessTokenConfigured && (
            <input
              className="dev-theme"
              type="password"
              value={accessToken}
              onChange={(event) => {
                setAccessToken(event.target.value);
                sessionStorage.setItem("prepump.dev.token", event.target.value);
              }}
              placeholder="Dev access token"
              autoComplete="off"
            />
          )}
        </div>
      </div>
    </div>
  );
}
