"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Account } from "viem";
import { usePrivy, useWallets, useLogin, useLogout } from "@privy-io/react-auth";
import { accountFromEip1193 } from "@/lib/wallet/walletAdapter";

const CONFIGURED_ADMIN = (process.env.NEXT_PUBLIC_ADMIN_ADDRESS || "").trim().toLowerCase() || null;
const PRIVY_APP_ID = (process.env.NEXT_PUBLIC_PRIVY_APP_ID || "").trim();

type WalletState = {
  /** True only when Privy is ready and an embedded wallet is provisioned. */
  connected: boolean;
  /** Privy auth state — true after successful login, may precede wallet provisioning. */
  authenticated: boolean;
  /** Privy SDK ready (no longer loading). */
  ready: boolean;
  /** Embedded wallet checksummed address. */
  address: string | null;
  /** viem Account adapter that signs via Privy's EIP-1193 provider. */
  account: Account | null;
  /** Contract owner / admin address (from env). */
  ownerAddress: string | null;
  isOwner: boolean;
  /** Trigger Privy login flow. */
  connect: () => Promise<void>;
  /** End Privy session. */
  disconnect: () => Promise<void>;
  /** Open Privy's "export key" flow (only safe place for raw key handling). */
  exportKey: () => Promise<void>;
};

const WalletCtx = createContext<WalletState | null>(null);

export function useWallet() {
  const v = useContext(WalletCtx);
  if (!v) throw new Error("useWallet must be used within WalletProvider");
  return v;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // When Privy isn't configured, expose a no-op provider so the rest of the
  // app keeps rendering and shows clear "connect wallet" affordances.
  if (!PRIVY_APP_ID) return <NoPrivyShell>{children}</NoPrivyShell>;
  return <PrivyBackedWallet>{children}</PrivyBackedWallet>;
}

function NoPrivyShell({ children }: { children: React.ReactNode }) {
  const value: WalletState = useMemo(() => ({
    connected: false,
    authenticated: false,
    ready: true,
    address: null,
    account: null,
    ownerAddress: CONFIGURED_ADMIN,
    isOwner: false,
    connect: async () => { console.warn("Privy is not configured"); },
    disconnect: async () => {},
    exportKey: async () => {},
  }), []);
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

function PrivyBackedWallet({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, exportWallet } = usePrivy();
  const { wallets } = useWallets();
  const { login } = useLogin();
  const { logout } = useLogout();

  const [account, setAccount] = useState<Account | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  // Pick the user's Privy embedded wallet (not an injected/external one).
  const embedded = useMemo(
    () => wallets.find(w => w.walletClientType === "privy") ?? wallets[0] ?? null,
    [wallets],
  );

  useEffect(() => {
    let cancelled = false;
    if (!embedded || !authenticated) {
      setAccount(null);
      setAddress(null);
      return;
    }
    (async () => {
      try {
        const provider = await embedded.getEthereumProvider();
        const addr = embedded.address as `0x${string}`;
        if (cancelled) return;
        setAddress(addr);
        setAccount(accountFromEip1193(provider, addr));
      } catch (err) {
        console.error("[Judgix] Failed to wire embedded wallet:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [embedded, authenticated]);

  const connect = useCallback(async () => {
    try {
      await login();
    } catch (err) {
      console.error("[Judgix] Privy login failed:", err);
    }
  }, [login]);

  const disconnect = useCallback(async () => {
    try { await logout(); } catch {}
    setAccount(null);
    setAddress(null);
  }, [logout]);

  const exportKey = useCallback(async () => {
    try { await exportWallet(); } catch (err) {
      console.error("[Judgix] Export wallet failed:", err);
    }
  }, [exportWallet]);

  const isOwner = !!(address && CONFIGURED_ADMIN && address.toLowerCase() === CONFIGURED_ADMIN);

  const value: WalletState = {
    connected: !!account && !!address,
    authenticated,
    ready,
    address,
    account,
    ownerAddress: CONFIGURED_ADMIN,
    isOwner,
    connect,
    disconnect,
    exportKey,
  };

  // Reference `user` so eslint-disable noise doesn't surface in CI.
  void user;

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
