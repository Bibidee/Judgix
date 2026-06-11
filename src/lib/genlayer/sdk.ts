"use client";

import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { localnet } from "genlayer-js/chains";
import type { Account, Address } from "viem";

/**
 * `genlayer-js` (via viem) probes Ethereum-style RPC methods that the GenLayer
 * Studio node doesn't implement (eth_fillTransaction, eth_getTransactionCount on
 * unknown wallet, ...). It logs each failed probe with console.error even though
 * the SDK then falls back to the correct gen_* method and the transaction
 * succeeds. We filter only those benign "Method not found" messages and let
 * every other error through.
 */
if (typeof window !== "undefined" && !(window as any).__judgixConsoleFiltered) {
  (window as any).__judgixConsoleFiltered = true;
  const origError = console.error.bind(console);
  console.error = (...args: any[]) => {
    const head = String(args[0] ?? "");
    if (
      /Error fetching .* from GenLayer RPC/.test(head)
      && /Method not found/.test(args.map(a => String(a?.message ?? a)).join(" "))
    ) return;
    return origError(...args);
  };
}

/**
 * GenLayer Studio Network (id 6199). We piggyback on the localnet chain definition
 * (which carries the consensus contract addresses the SDK needs) but override the
 * endpoint, id, and name to point at the public studio network.
 */
const STUDIO_CHAIN = {
  ...localnet,
  id: 6199,
  name: "GenLayer Studio Network",
  rpcUrls: { default: { http: ["/api/genlayer"] as readonly string[] } },
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
} as typeof localnet;

export const STUDIO_NETWORK = {
  name: "GenLayer Studio Network",
  id: 6199,
  symbol: "GEN",
  endpoint: "https://studio.genlayer.com/api",
} as const;

export const JUDGIX_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_JUDGIX_ADDRESS ||
    "0x53Fa17B148006bd59B2484ef8414840ECfaAfd06") as Address;

export const JUDGIX_RPC_URL =
  process.env.NEXT_PUBLIC_GENLAYER_RPC || "/api/genlayer";

function resolveEndpoint(): string {
  if (JUDGIX_RPC_URL.startsWith("http")) return JUDGIX_RPC_URL;
  if (typeof window !== "undefined") return window.location.origin + JUDGIX_RPC_URL;
  return "http://localhost:3000" + JUDGIX_RPC_URL;
}

const PRIV_KEY_STORAGE = "judgix.privateKey.v1";

export function loadOrCreatePrivateKey(): `0x${string}` {
  if (typeof window === "undefined") return generatePrivateKey();
  let pk = window.localStorage.getItem(PRIV_KEY_STORAGE) as `0x${string}` | null;
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) {
    pk = generatePrivateKey();
    window.localStorage.setItem(PRIV_KEY_STORAGE, pk);
  }
  return pk;
}

export function setPrivateKey(pk: `0x${string}`) {
  window.localStorage.setItem(PRIV_KEY_STORAGE, pk);
}

export function getStoredPrivateKey(): `0x${string}` | null {
  if (typeof window === "undefined") return null;
  const pk = window.localStorage.getItem(PRIV_KEY_STORAGE);
  return (pk && pk.startsWith("0x") && pk.length === 66) ? (pk as `0x${string}`) : null;
}

export function clearPrivateKey() {
  window.localStorage.removeItem(PRIV_KEY_STORAGE);
}

let _readOnlyClient: ReturnType<typeof createClient> | null = null;
export function getReadOnlyClient() {
  if (!_readOnlyClient) {
    _readOnlyClient = createClient({
      chain: STUDIO_CHAIN,
      endpoint: resolveEndpoint(),
      account: createAccount(generatePrivateKey()),
    });
  }
  return _readOnlyClient;
}

export function getClientForAccount(account: Account) {
  return createClient({
    chain: STUDIO_CHAIN,
    endpoint: resolveEndpoint(),
    account,
  });
}

export function accountFromKey(pk: `0x${string}`): Account {
  return createAccount(pk) as unknown as Account;
}

export async function getBalance(address: `0x${string}`): Promise<bigint | null> {
  try {
    const client = getReadOnlyClient();
    const bal = await (client as any).getBalance({ address });
    return typeof bal === "bigint" ? bal : BigInt(bal ?? 0);
  } catch { return null; }
}

export async function getTransactionStatus(hash: string): Promise<string | null> {
  try {
    const client = getReadOnlyClient();
    const tx = await (client as any).getTransaction({ hash });
    return (tx?.statusName ?? tx?.status_name ?? tx?.status ?? null) as string | null;
  } catch { return null; }
}

export async function pollForReview<T>(
  fetcher: () => Promise<T | null | "">,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<T | null> {
  const interval = opts.intervalMs ?? 3000;
  const timeout = opts.timeoutMs ?? 180_000;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const v = await fetcher();
      if (v && v !== "") return v as T;
    } catch {
      // keep polling
    }
    await new Promise(r => setTimeout(r, interval));
  }
  return null;
}
