"use client";

import { toAccount } from "viem/accounts";
import type { Account, Hex, SignableMessage } from "viem";

/**
 * viem Account that signs through an EIP-1193 provider (Privy embedded
 * wallet via `wallet.getEthereumProvider()`).
 *
 * Every method logs the RPC call we send to the provider so we can see in
 * the browser console whether Privy received the request and what it
 * returned. Each call has a 25s timeout — a hung provider is the most
 * common failure mode (Privy embedded wallets do not implement
 * `eth_signTransaction`; that path will reject here instead of hanging).
 */

const TIMEOUT_MS = 25_000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`[Judgix walletAdapter] ${label} timed out after ${TIMEOUT_MS}ms — the embedded wallet did not respond. This usually means the provider does not implement that RPC method.`)),
      TIMEOUT_MS,
    );
    p.then(v => { clearTimeout(t); resolve(v); },
           e => { clearTimeout(t); reject(e); });
  });
}

async function callProvider(provider: any, method: string, params: any[]): Promise<any> {
  console.log("[Judgix walletAdapter] →", method, params);
  try {
    const res = await withTimeout(provider.request({ method, params }), method);
    console.log("[Judgix walletAdapter] ←", method, res);
    return res;
  } catch (err) {
    console.error("[Judgix walletAdapter] ✗", method, err);
    throw err;
  }
}

export function accountFromEip1193(
  provider: any,
  address: `0x${string}`,
): Account {
  if (!provider) {
    throw new Error("[Judgix walletAdapter] accountFromEip1193 called without a provider");
  }
  console.log("[Judgix walletAdapter] adapter created for", address);

  return toAccount({
    address,
    async signMessage({ message }: { message: SignableMessage }) {
      const m = typeof message === "string" ? message : (message as any).raw;
      const sig = await callProvider(provider, "personal_sign", [m, address]);
      return sig as Hex;
    },
    async signTransaction(transaction: any) {
      // Privy embedded wallets typically do NOT implement eth_signTransaction.
      // This will surface a real error in <25s instead of hanging forever.
      const sig = await callProvider(provider, "eth_signTransaction", [transaction]);
      return sig as Hex;
    },
    async signTypedData(typedData: any) {
      const sig = await callProvider(provider, "eth_signTypedData_v4", [address, JSON.stringify(typedData)]);
      return sig as Hex;
    },
  });
}
