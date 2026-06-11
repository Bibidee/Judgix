"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PaperCard, MonoStat } from "@/components/ui/PaperCard";
import { useWallet } from "@/lib/wallet/WalletProvider";
import {
  fetchProtocolConfig,
  fetchProtocolStats,
  adminPause,
  adminUnpause,
  adminSetReviewFee,
  adminSetKeeper,
  adminSetSchemaVersion,
  explainContractError,
} from "@/lib/genlayer/contract";
import { ProtocolConfig, ProtocolStats } from "@/types";

export default function AdminPage() {
  const { connected, sendWrite, isOwner, connect } = useWallet();
  const [cfg, setCfg] = useState<ProtocolConfig | null>(null);
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [feeGen, setFeeGen] = useState("");
  const [keeper, setKeeper] = useState("");
  const [schema, setSchema] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const [c, s] = await Promise.all([
      fetchProtocolConfig().catch(() => null),
      fetchProtocolStats().catch(() => null),
    ]);
    setCfg(c);
    setStats(s);
    if (c) {
      const gen = Number(c.reviewFeeWei) / 1e18;
      setFeeGen(gen.toFixed(4));
      setKeeper(c.keeper);
      setSchema(c.evidenceSchemaVersion);
    }
  }

  async function run<T>(label: string, fn: () => Promise<T>) {
    if (!sendWrite) return;
    setError(""); setBusy(label);
    try { await fn(); await refresh(); } catch (err) { setError(explainContractError(err)); }
    finally { setBusy(""); }
  }

  if (!connected) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="case-stamp text-slate">Restricted</div>
        <h1 className="font-serif-display text-4xl mt-2">Admin</h1>
        <p className="text-deeptext/70 mt-3">Sign in with the protocol admin wallet to continue.</p>
        <button onClick={connect} className="mt-6 bg-coral text-cloud px-5 py-2.5 rounded-md font-medium">Enter Judgix</button>
      </div>
    );
  }
  if (!isOwner) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="case-stamp text-raspberry">Access denied</div>
        <h1 className="font-serif-display text-4xl mt-2">Admin only</h1>
        <p className="text-deeptext/70 mt-3">The connected wallet is not the protocol admin.</p>
        <Link href="/campaigns" className="text-evidence text-sm mt-4 inline-block hover:underline">Back to trust reports →</Link>
      </div>
    );
  }

  const paused = !!cfg?.paused;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div>
        <div className="case-stamp text-slate">Protocol admin</div>
        <h1 className="font-serif-display text-4xl mt-1">Judgix admin</h1>
        <p className="text-deeptext/70 mt-2 max-w-2xl">
          Limited maintenance only. Admin cannot approve, reject, score, or override GenLayer consensus.
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <MonoStat label="Status" value={paused ? "PAUSED" : "LIVE"} accent={paused ? "#9B0345" : "#0F5E4A"} />
        <MonoStat label="Review fee" value={`${feeGen || "—"} GEN`} />
        <MonoStat label="Schema" value={cfg?.evidenceSchemaVersion ?? "—"} />
        <MonoStat label="Protocol fees" value={`${(Number(cfg?.protocolFeesWei ?? 0) / 1e18).toFixed(4)} GEN`} />
        <MonoStat label="Campaigns" value={String(stats?.campaigns ?? 0)} />
        <MonoStat label="Reviews" value={String(stats?.reviews ?? 0)} />
        <MonoStat label="Appeals" value={String(stats?.appeals ?? 0)} />
        <MonoStat label="Flags" value={String(stats?.flags ?? 0)} />
      </div>

      <PaperCard eyebrow="Protocol" title="Live state">
        <div className="flex gap-3">
          {paused ? (
            <button disabled={!!busy} onClick={() => run("unpause", () => adminUnpause(sendWrite!))} className="bg-coral text-cloud px-4 py-2 rounded-md text-sm">
              {busy === "unpause" ? "Working…" : "Unpause protocol"}
            </button>
          ) : (
            <button disabled={!!busy} onClick={() => run("pause", () => adminPause(sendWrite!))} className="border border-raspberry text-raspberry px-4 py-2 rounded-md text-sm">
              {busy === "pause" ? "Working…" : "Pause protocol"}
            </button>
          )}
        </div>
      </PaperCard>

      <PaperCard eyebrow="Configuration" title="Review fee">
        <div className="flex items-end gap-3">
          <label className="block flex-1">
            <span className="case-stamp text-slate">Fee (GEN)</span>
            <input className="mt-1 w-full border border-mist rounded px-3 py-2 text-sm" value={feeGen} onChange={e => setFeeGen(e.target.value)} />
          </label>
          <button
            disabled={!!busy}
            onClick={() => {
              const v = Number(feeGen);
              if (!Number.isFinite(v) || v < 0) { setError("Fee must be a non-negative number."); return; }
              const wei = BigInt(Math.round(v * 1e18));
              run("fee", () => adminSetReviewFee(sendWrite!, wei.toString()));
            }}
            className="bg-plum text-cloud px-4 py-2 rounded-md text-sm"
          >{busy === "fee" ? "Working…" : "Update fee"}</button>
        </div>
      </PaperCard>

      <PaperCard eyebrow="Configuration" title="Keeper address (optional)">
        <div className="flex items-end gap-3">
          <label className="block flex-1">
            <span className="case-stamp text-slate">Keeper wallet</span>
            <input className="mt-1 w-full border border-mist rounded px-3 py-2 text-sm font-mono" value={keeper} onChange={e => setKeeper(e.target.value)} placeholder="0x…" />
          </label>
          <button
            disabled={!!busy}
            onClick={() => run("keeper", () => adminSetKeeper(sendWrite!, keeper))}
            className="bg-plum text-cloud px-4 py-2 rounded-md text-sm"
          >{busy === "keeper" ? "Working…" : "Update keeper"}</button>
        </div>
        <p className="case-stamp text-slate mt-2">
          Reviews remain permissionless even when a keeper is set.
        </p>
      </PaperCard>

      <PaperCard eyebrow="Configuration" title="Evidence schema version">
        <div className="flex items-end gap-3">
          <label className="block flex-1">
            <span className="case-stamp text-slate">Schema version</span>
            <input className="mt-1 w-full border border-mist rounded px-3 py-2 text-sm" value={schema} onChange={e => setSchema(e.target.value)} />
          </label>
          <button
            disabled={!!busy}
            onClick={() => run("schema", () => adminSetSchemaVersion(sendWrite!, schema))}
            className="bg-plum text-cloud px-4 py-2 rounded-md text-sm"
          >{busy === "schema" ? "Working…" : "Update schema"}</button>
        </div>
      </PaperCard>

      {error && <div className="border border-raspberry/30 bg-raspberry/10 text-raspberry rounded-md p-3 text-sm">{error}</div>}
    </div>
  );
}
