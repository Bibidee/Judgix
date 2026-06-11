"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Account } from "viem";
import {
  loadOrCreatePrivateKey,
  setPrivateKey,
  clearPrivateKey,
  accountFromKey,
} from "@/lib/genlayer/sdk";
import { generatePrivateKey } from "genlayer-js";
import { fetchContractOwner } from "@/lib/genlayer/contract";

type WalletState = {
  connected: boolean;
  address: string | null;
  account: Account | null;
  ownerAddress: string | null;
  isOwner: boolean;
  privateKey: `0x${string}` | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  importKey: (pk: `0x${string}`) => void;
  rotateKey: () => void;
};

const WalletCtx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [privateKey, setPrivKey] = useState<`0x${string}` | null>(null);
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const [autoConnected, setAutoConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const wasConnected = window.localStorage.getItem("judgix.connected") === "1";
    if (wasConnected) {
      const pk = loadOrCreatePrivateKey();
      const acc = accountFromKey(pk);
      setAccount(acc); setPrivKey(pk);
    }
    setAutoConnected(true);
    fetchContractOwner().then(o => o && setOwnerAddress(o)).catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    const pk = loadOrCreatePrivateKey();
    const acc = accountFromKey(pk);
    setAccount(acc); setPrivKey(pk);
    if (typeof window !== "undefined") window.localStorage.setItem("judgix.connected", "1");
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null); setPrivKey(null);
    if (typeof window !== "undefined") window.localStorage.removeItem("judgix.connected");
  }, []);

  const importKey = useCallback((pk: `0x${string}`) => {
    setPrivateKey(pk);
    const acc = accountFromKey(pk);
    setAccount(acc); setPrivKey(pk);
    if (typeof window !== "undefined") window.localStorage.setItem("judgix.connected", "1");
  }, []);

  const rotateKey = useCallback(() => {
    const pk = generatePrivateKey();
    setPrivateKey(pk);
    const acc = accountFromKey(pk);
    setAccount(acc); setPrivKey(pk);
    if (typeof window !== "undefined") window.localStorage.setItem("judgix.connected", "1");
  }, []);

  const address = account?.address ?? null;
  const isOwner = !!(address && ownerAddress && address.toLowerCase() === ownerAddress.toLowerCase());

  return (
    <WalletCtx.Provider
      value={{
        connected: !!account && autoConnected,
        address,
        account,
        ownerAddress,
        isOwner,
        privateKey,
        connect,
        disconnect,
        importKey,
        rotateKey,
      }}
    >
      {children}
    </WalletCtx.Provider>
  );
}

export function useWallet() {
  const v = useContext(WalletCtx);
  if (!v) throw new Error("useWallet must be used within WalletProvider");
  return v;
}

export function _resetKeyAndDisconnect() {
  clearPrivateKey();
  if (typeof window !== "undefined") window.localStorage.removeItem("judgix.connected");
}
