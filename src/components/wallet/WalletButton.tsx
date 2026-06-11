"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { shortAddress } from "@/lib/scoring";
import { JUDGIX_RPC_URL, STUDIO_NETWORK } from "@/lib/genlayer/sdk";

export function WalletButton() {
  const { connected, address, privateKey, connect, disconnect, isOwner, importKey, rotateKey, ownerAddress } = useWallet();
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [pkInput, setPkInput] = useState("");
  const [copied, setCopied] = useState<"" | "address" | "key">("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function copy(value: string, kind: "address" | "key") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(""), 1200);
    } catch {}
  }

  function downloadBackup() {
    if (!privateKey || !address) return;
    const payload = { address, privateKey, contract: "0x479047Ecf0Ead0cC072c9fE10F8605ae4E23D2f8", endpoint: JUDGIX_RPC_URL, createdAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `judgix-wallet-${address.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!connected) {
    return (
      <button onClick={connect} className="bg-cyan text-plum px-3 py-1.5 rounded-md text-sm font-medium">
        Connect wallet
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-cloud/10 hover:bg-cloud/20 text-cloud border border-cyan/40 px-3 py-1.5 rounded-md text-sm"
      >
        <span className="w-2 h-2 rounded-full bg-mint" />
        <span className="font-mono">{shortAddress(address || "")}</span>
        {isOwner && <span className="case-stamp text-cyan">moderator</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] paper-card p-0 z-50 text-deeptext overflow-hidden">
          {/* Header */}
          <div className="bg-plum text-cloud px-4 py-3">
            <div className="case-stamp text-cyan">Embedded wallet</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-mint" />
              <span className="font-mono text-sm">{shortAddress(address || "")}</span>
              {isOwner && <span className="case-stamp bg-cyan text-plum px-1.5 py-0.5 rounded">MOD</span>}
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {/* Address */}
            <div>
              <div className="flex items-center justify-between">
                <span className="case-stamp text-slate">Address</span>
                <button onClick={() => copy(address || "", "address")} className="case-stamp text-evidence hover:underline">
                  {copied === "address" ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="mt-1 font-mono text-xs break-all border border-mist rounded px-2 py-1.5 bg-cloud">{address}</div>
            </div>

            {/* Private key */}
            <div>
              <div className="flex items-center justify-between">
                <span className="case-stamp text-slate">Private key</span>
                <div className="flex gap-3">
                  <button onClick={() => setShowKey(s => !s)} className="case-stamp text-evidence hover:underline">
                    {showKey ? "Hide" : "Reveal"}
                  </button>
                  <button onClick={() => privateKey && copy(privateKey, "key")} className="case-stamp text-evidence hover:underline">
                    {copied === "key" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="mt-1 font-mono text-xs break-all border border-mist rounded px-2 py-1.5 bg-cloud min-h-[2rem]">
                {showKey ? privateKey : (privateKey ? "•".repeat(64) + " (hidden)" : "—")}
              </div>
              <p className="case-stamp text-raspberry mt-1">Never share your key. Anyone with it controls this wallet.</p>
            </div>

            {/* Network / contract info */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-mist rounded p-2">
                <div className="case-stamp text-slate">Network</div>
                <div className="font-mono truncate" title={STUDIO_NETWORK.endpoint}>
                  {STUDIO_NETWORK.name}
                </div>
                <div className="case-stamp text-slate mt-0.5">chain id {STUDIO_NETWORK.id} · {STUDIO_NETWORK.symbol}</div>
              </div>
              <div className="border border-mist rounded p-2">
                <div className="case-stamp text-slate">Role</div>
                <div className="font-mono">{isOwner ? "Moderator" : "Public"}</div>
              </div>
            </div>


            {ownerAddress && (
              <div className="border border-mist rounded p-2 text-xs">
                <div className="case-stamp text-slate">Contract owner</div>
                <div className="font-mono break-all">{ownerAddress}</div>
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={downloadBackup} className="border border-mist text-sm py-1.5 rounded hover:border-evidence">Download backup</button>
              <button onClick={() => { if (confirm("Generate a new wallet? The current key will be replaced. Download a backup first.")) rotateKey(); }} className="border border-mist text-sm py-1.5 rounded hover:border-evidence">Rotate key</button>
            </div>

            {/* Import */}
            <details className="border border-mist rounded">
              <summary className="case-stamp text-slate px-2 py-1.5 cursor-pointer">Import private key</summary>
              <div className="p-2 border-t border-mist">
                <input
                  value={pkInput}
                  onChange={e => setPkInput(e.target.value)}
                  placeholder="0x… (64 hex chars)"
                  className="w-full font-mono text-xs border border-mist rounded px-2 py-1.5"
                />
                <button
                  onClick={() => { if (pkInput.length === 66 && pkInput.startsWith("0x")) { importKey(pkInput as `0x${string}`); setPkInput(""); } }}
                  className="mt-2 w-full bg-plum text-cloud text-sm py-1.5 rounded"
                >Use this key</button>
              </div>
            </details>

            <button onClick={() => { disconnect(); setOpen(false); }} className="w-full border border-raspberry text-raspberry text-sm py-1.5 rounded hover:bg-raspberry hover:text-cloud transition">
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
