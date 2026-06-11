"use client";

import { toAccount } from "viem/accounts";
import type { Account, Hex, SignableMessage } from "viem";

/**
 * Build a viem Account that signs through an EIP-1193 provider (Privy's
 * embedded wallet exposes one via `wallet.getEthereumProvider()`).
 *
 * We hand this Account to genlayer-js's createClient so that writes are
 * signed by the Privy-managed key. No private key ever lives in the
 * frontend's memory or in localStorage.
 */
export function accountFromEip1193(
  provider: any,
  address: `0x${string}`,
): Account {
  return toAccount({
    address,
    async signMessage({ message }: { message: SignableMessage }) {
      const m = typeof message === "string" ? message : (message as any).raw;
      const sig = await provider.request({
        method: "personal_sign",
        params: [m, address],
      });
      return sig as Hex;
    },
    async signTransaction(transaction: any) {
      const sig = await provider.request({
        method: "eth_signTransaction",
        params: [transaction],
      });
      return sig as Hex;
    },
    async signTypedData(typedData: any) {
      const sig = await provider.request({
        method: "eth_signTypedData_v4",
        params: [address, JSON.stringify(typedData)],
      });
      return sig as Hex;
    },
  });
}
