"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { shortAddress } from "@/lib/scoring";
import { STUDIO_NETWORK } from "@/lib/genlayer/sdk";

export function WalletButton() {
  const { connected, authenticated, ready, address, connect, disconnect, exportKey, isOwner, ownerAddress } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  if (!ready) {
    return (
      <button disabled className="bg-cloud/10 text-cloud/60 border border-cyan/20 px-3 py-1.5 rounded-md text-sm">
        Loading…
      </button>
    );
  }

  if (!authenticated || !connected) {
    return (
      <button onClick={connect} className="bg-cyan text-plum px-3 py-1.5 rounded-md text-sm font-medium">
        Enter Judgix
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
        {isOwner && <span className="case-stamp text-cyan">admin</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] paper-card p-0 z-50 text-deeptext overflow-hidden">
          <div className="bg-plum text-cloud px-4 py-3">
            <div className="case-stamp text-cyan">Judgix wallet</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-mint" />
              <span className="font-mono text-sm">{shortAddress(address || "")}</span>
              {isOwner && <span className="case-stamp bg-cyan text-plum px-1.5 py-0.5 rounded">ADMIN</span>}
            </div>
            <div className="case-stamp text-cyan/70 mt-1">Privy embedded · {STUDIO_NETWORK.name}</div>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="case-stamp text-slate">Address</span>
                <button onClick={copyAddress} className="case-stamp text-evidence hover:underline">
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="mt-1 font-mono text-xs break-all border border-mist rounded px-2 py-1.5 bg-cloud">{address}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-mist rounded p-2">
                <div className="case-stamp text-slate">Network</div>
                <div className="font-mono truncate">{STUDIO_NETWORK.name}</div>
                <div className="case-stamp text-slate mt-0.5">chain {STUDIO_NETWORK.id} · {STUDIO_NETWORK.symbol}</div>
              </div>
              <div className="border border-mist rounded p-2">
                <div className="case-stamp text-slate">Role</div>
                <div className="font-mono">{isOwner ? "Admin" : "Public"}</div>
              </div>
            </div>

            {ownerAddress && (
              <div className="border border-mist rounded p-2 text-xs">
                <div className="case-stamp text-slate">Protocol admin</div>
                <div className="font-mono break-all">{ownerAddress}</div>
              </div>
            )}

            <details className="border border-mist rounded">
              <summary className="case-stamp text-slate px-3 py-2 cursor-pointer">Advanced · export key</summary>
              <div className="p-3 border-t border-mist text-xs space-y-2">
                <p className="text-slate">
                  Privy will display your embedded wallet's private key in a secure modal. Never paste it in a chat,
                  email, or unfamiliar app.
                </p>
                <button onClick={exportKey} className="w-full bg-plum text-cloud py-1.5 rounded">
                  Open secure export
                </button>
              </div>
            </details>

            <button onClick={() => { disconnect(); setOpen(false); }} className="w-full border border-raspberry text-raspberry text-sm py-1.5 rounded hover:bg-raspberry hover:text-cloud transition">
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
