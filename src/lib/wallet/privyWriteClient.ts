"use client";

import { useCallback } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { abi as genlayerAbi } from "genlayer-js";
const { calldata, transactions } = genlayerAbi;
import { localnet } from "genlayer-js/chains";
import { encodeFunctionData } from "viem";
import type { Address, Hex } from "viem";
import { JUDGIX_CONTRACT_ADDRESS } from "@/lib/genlayer/sdk";

/**
 * GenLayer Studio writes via Privy's embedded-wallet broadcast path.
 *
 * The genlayer-js SDK's writeContract path internally calls
 * `account.signTransaction` (a viem local-account method), which Privy
 * embedded wallets do not implement — that's the eth_signTransaction
 * timeout we saw in the wild. Instead, we re-create the SDK's own
 * EVM-level tx envelope by hand using its public encoding utilities and
 * hand the resulting EVM call to Privy's `sendTransaction`, which signs
 * and broadcasts in one shot using the iframe-managed key.
 *
 * Wire shape (recovered from genlayer-js dist/index.cjs line ~462+):
 *
 *   inner       = calldata.encode({ method: functionName, args })
 *   serialized  = transactions.serialize([inner, leaderOnly])
 *   data        = consensusMainContract.addTransaction(
 *                    senderAddress,
 *                    recipient (Judgix contract),
 *                    numInitialValidators,
 *                    maxRotations,
 *                    serialized,
 *                 )
 *   tx          = to: consensusMainContract.address, data, value, chainId
 */

const STUDIO_CHAIN_ID = 61999;

/**
 * Extract a tx hash from whatever shape the wallet client returned.
 * Privy's `useSendTransaction` has shipped at least three result shapes
 * across versions: a bare hex string, `{ hash }`, and a viem-style
 * `{ transactionHash }`. We accept all of them.
 */
export function extractTxHash(result: unknown): string | null {
  if (!result) return null;
  if (typeof result === "string") {
    return result.startsWith("0x") ? result : null;
  }
  const r = result as any;
  return (
    r.hash ||
    r.transactionHash ||
    r.txHash ||
    r.receipt?.transactionHash ||
    r.transaction_hash ||
    null
  );
}

function consensusContract() {
  // STUDIO chain shares the same consensus contract config as localnet.
  const c = (localnet as any).consensusMainContract;
  if (!c?.address || !c?.abi) {
    throw new Error("[Judgix privyWriteClient] consensusMainContract config missing from chain definition");
  }
  return c as { address: Address; abi: any };
}

function defaults() {
  const ln = localnet as any;
  return {
    initialValidators: Number(ln.defaultNumberOfInitialValidators ?? 5),
    maxRotations: Number(ln.defaultConsensusMaxRotations ?? 3),
  };
}

export type SendWrite = (
  functionName: string,
  args: any[],
  opts?: { value?: bigint; leaderOnly?: boolean; consensusMaxRotations?: number },
) => Promise<{ hash: string }>;

export function usePrivyWriteClient(): { sendWrite: SendWrite | null; ready: boolean; address: string | null } {
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const embedded = wallets.find(w => w.walletClientType === "privy") ?? wallets[0] ?? null;
  const address = embedded?.address ?? null;
  const ready = !!sendTransaction && !!address;

  const sendWrite = useCallback<SendWrite>(async (functionName, args, opts = {}) => {
    if (!sendTransaction) {
      throw new Error("[Judgix privyWriteClient] Privy sendTransaction is not ready. Sign in first.");
    }
    if (!address) {
      throw new Error("[Judgix privyWriteClient] No embedded wallet address. Sign in first.");
    }
    const cc = consensusContract();
    const d = defaults();
    const value = opts.value ?? 0n;
    const leaderOnly = opts.leaderOnly ?? false;
    const maxRotations = opts.consensusMaxRotations ?? d.maxRotations;

    console.log("[Judgix privyWriteClient] preparing write", { functionName, argsCount: args.length, value: value.toString() });

    // 1. Encode the GenLayer call (method + args) into the SDK calldata.
    const inner = calldata.encode({ method: functionName, args });
    // 2. Serialize [inner, leaderOnly] as the SDK does for writeContract.
    const serialized = transactions.serialize([inner, leaderOnly] as any);

    // 3. Wrap in consensus contract's `addTransaction(...)` call.
    const data = encodeFunctionData({
      abi: cc.abi,
      functionName: "addTransaction",
      args: [
        address as Address,
        JUDGIX_CONTRACT_ADDRESS,
        d.initialValidators,
        maxRotations,
        serialized,
      ],
    });

    console.log("[Judgix privyWriteClient] sending via Privy sendTransaction", {
      to: cc.address,
      dataLength: data.length,
      chainId: STUDIO_CHAIN_ID,
    });

    const result = await sendTransaction({
      to: cc.address,
      data,
      value,
      chainId: STUDIO_CHAIN_ID,
    } as any);

    console.log("[Judgix privyWriteClient] raw sendTransaction result", result);
    const hash = extractTxHash(result);
    if (!hash) {
      console.warn("[Judgix privyWriteClient] could not extract hash from result — caller must verify via on-chain status", result);
      throw new Error("Privy sendTransaction returned no recognizable tx hash. The transaction may still have been submitted; the caller will verify by reading on-chain state.");
    }
    console.log("[Judgix privyWriteClient] tx hash", hash);
    return { hash };
  }, [sendTransaction, address]);

  return { sendWrite: ready ? sendWrite : null, ready, address };
}
