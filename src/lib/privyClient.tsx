"use client";

import { PrivyProvider } from "@privy-io/react-auth";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

/**
 * Wraps the app with Privy auth + embedded-wallet provisioning.
 *
 * UI hygiene: we configure Privy to only handle the parts we explicitly hand
 * off to it (login modal, signing prompts, key export). Every other surface
 * — headers, dashboards, account drawer — is custom Judgix UI built against
 * `useWallet()` from `WalletProvider`, which sits on top of Privy.
 */
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
        appearance: {
          theme: "dark",
          accentColor: "#22D3EE",
          // Force-light surfaces in the Privy modal to match Relief Signal palette
          logo: undefined,
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
