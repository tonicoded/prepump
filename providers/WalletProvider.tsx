"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ConnectionStatus, WalletId, WalletMeta } from "@/lib/types";
import { client } from "@/services/chain";

type InjectedProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: {
    onlyIfTrusted?: boolean;
  }) => Promise<{ publicKey?: { toString(): string } }>;
  disconnect: () => Promise<void>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    phantom?: { solana?: InjectedProvider };
    solflare?: InjectedProvider;
    backpack?: InjectedProvider;
    solana?: InjectedProvider;
  }
}

const WALLETS: Omit<WalletMeta, "detected">[] = [
  {
    id: "phantom",
    name: "Phantom",
    tint: "#ab9ff2",
    url: "https://phantom.app/download",
  },
  {
    id: "solflare",
    name: "Solflare",
    tint: "#fc7227",
    url: "https://solflare.com/download",
  },
  {
    id: "backpack",
    name: "Backpack",
    tint: "#e33e3f",
    url: "https://backpack.app/downloads",
  },
];

function getProvider(id: WalletId): InjectedProvider | undefined {
  if (typeof window === "undefined") return undefined;
  switch (id) {
    case "phantom":
      return window.phantom?.solana?.isPhantom
        ? window.phantom.solana
        : window.solana?.isPhantom
          ? window.solana
          : undefined;
    case "solflare":
      return window.solflare?.isSolflare ? window.solflare : undefined;
    case "backpack":
      return window.backpack?.isBackpack ? window.backpack : undefined;
  }
}

type WalletContextValue = {
  status: ConnectionStatus;
  address: string | null;
  walletId: WalletId | null;
  walletName: string | null;
  balance: bigint | null;
  wallets: WalletMeta[];
  error: string | null;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  connect: (id: WalletId) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  debit: (lamports: bigint) => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const LAST_WALLET_KEY = "prepump.last-wallet";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [address, setAddress] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<WalletId | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [detected, setDetected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Extensions inject late; re-scan for a few seconds after mount.
  useEffect(() => {
    const scan = () => {
      setDetected({
        phantom: !!getProvider("phantom"),
        solflare: !!getProvider("solflare"),
        backpack: !!getProvider("backpack"),
      });
    };
    scan();
    const t1 = setTimeout(scan, 400);
    const t2 = setTimeout(scan, 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const loadBalance = useCallback(async (addr: string) => {
    const value = await client.getBalance(addr);
    if (mounted.current) setBalance(value);
  }, []);

  const finalize = useCallback(
    async (id: WalletId, addr: string) => {
      setAddress(addr);
      setWalletId(id);
      setStatus("connected");
      setError(null);
      localStorage.setItem(LAST_WALLET_KEY, id);
      await loadBalance(addr);
    },
    [loadBalance],
  );

  const connect = useCallback(
    async (id: WalletId) => {
      setError(null);
      setStatus("connecting");
      try {
        const provider = getProvider(id);
        if (!provider) throw new Error("Wallet not detected");
        const res = await provider.connect();
        const pk = res?.publicKey ?? provider.publicKey;
        if (!pk) throw new Error("No public key returned");
        await finalize(id, pk.toString());
        setModalOpen(false);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Could not connect wallet";
        setError(
          /user rejected|declined/i.test(message)
            ? "Connection request rejected."
            : message,
        );
        setStatus("disconnected");
      }
    },
    [finalize],
  );

  const disconnect = useCallback(async () => {
    if (walletId) {
      try {
        await getProvider(walletId)?.disconnect();
      } catch {
        /* provider already gone */
      }
    }
    localStorage.removeItem(LAST_WALLET_KEY);
    setAddress(null);
    setWalletId(null);
    setBalance(null);
    setStatus("disconnected");
  }, [walletId]);

  // Silent reconnect for a previously trusted wallet.
  useEffect(() => {
    const last = localStorage.getItem(LAST_WALLET_KEY) as WalletId | null;
    if (!last) return;
    let cancelled = false;
    const attempt = async () => {
      const provider = getProvider(last);
      if (!provider) return;
      try {
        const res = await provider.connect({ onlyIfTrusted: true });
        const pk = res?.publicKey ?? provider.publicKey;
        if (pk && !cancelled) await finalize(last, pk.toString());
      } catch {
        /* not trusted — user connects manually */
      }
    };
    const t = setTimeout(attempt, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [finalize]);

  // React to account switches and in-wallet disconnects.
  useEffect(() => {
    if (!walletId) return;
    const provider = getProvider(walletId);
    if (!provider?.on) return;
    const onAccountChanged = (pk: unknown) => {
      const key = pk as { toString(): string } | null;
      if (key) {
        setAddress(key.toString());
        void loadBalance(key.toString());
      } else {
        void disconnect();
      }
    };
    const onDisconnect = () => void disconnect();
    provider.on("accountChanged", onAccountChanged);
    provider.on("disconnect", onDisconnect);
    return () => {
      provider.off?.("accountChanged", onAccountChanged);
      provider.off?.("disconnect", onDisconnect);
    };
  }, [walletId, disconnect, loadBalance]);

  const wallets = useMemo<WalletMeta[]>(
    () => WALLETS.map((w) => ({ ...w, detected: !!detected[w.id] })),
    [detected],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      address,
      walletId,
      walletName: walletId
        ? (wallets.find((w) => w.id === walletId)?.name ?? null)
        : null,
      balance,
      wallets,
      error,
      modalOpen,
      openModal: () => {
        setError(null);
        setModalOpen(true);
      },
      closeModal: () => setModalOpen(false),
      connect,
      disconnect,
      refreshBalance: async () => {
        if (address) await loadBalance(address);
      },
      debit: (lamports: bigint) =>
        setBalance((b) => (b === null ? b : b > lamports ? b - lamports : 0n)),
    }),
    [
      status,
      address,
      walletId,
      balance,
      wallets,
      error,
      modalOpen,
      connect,
      disconnect,
      loadBalance,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
