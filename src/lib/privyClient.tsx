"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { defineChain } from "viem";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

/**
 * GenLayer Studio Network as a viem Chain. Privy uses this to validate
 * `chainId` on `useSendTransaction` calls and to look up the RPC for
 * broadcasting. We point it at our same-origin proxy so the embedded
 * iframe can submit the signed tx without hitting CORS on studio's API.
 */
const studioChain = defineChain({
  id: 61999,
  name: "GenLayer Studio Network",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: ["/api/genlayer"] },
  },
  testnet: true,
});

export function JudgixPrivyProvider({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID) {
    if (typeof window !== "undefined") {
      console.warn("[Judgix] NEXT_PUBLIC_PRIVY_APP_ID is not set. Wallet login is disabled.");
    }
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google"],
        defaultChain: studioChain,
        supportedChains: [studioChain],
        appearance: {
          theme: "dark",
          accentColor: "#22D3EE",
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
