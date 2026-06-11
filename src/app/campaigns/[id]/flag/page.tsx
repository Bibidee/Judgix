"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PaperCard } from "@/components/ui/PaperCard";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { fetchCampaign, flagCampaign, explainContractError } from "@/lib/genlayer/contract";
import { Campaign } from "@/types";

const REASONS = [
  "Story appears fabricated",
  "Beneficiary identity unclear",
  "Evidence summary is suspicious",
  "Funding goal looks unreasonable",
  "Duplicate of a known scam template",
  "Suspicious wallet behaviour",
  "Other",
];

export default function FlagCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { connected, account, connect } = useWallet();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [reasonPick, setReasonPick] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchCampaign(id).then(setCampaign).catch(() => {});
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!connected || !account) { setError("Connect a wallet first."); return; }

    const reason = (reasonPick === "Other" ? details : `${reasonPick}${details ? ": " + details : ""}`).trim();
    if (!reason) { setError("Please provide a reason."); return; }

    setBusy(true);
    try {
      setStage("Filing flag on-chain…");
      await flagCampaign(account, id, reason, {
        onHash: h => setStage(`flag_campaign broadcast · ${h.slice(0, 10)}…`),
      });
      setDone(true);
    } catch (err) {
      setError(explainContractError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="case-stamp text-slate">
        <Link href={`/campaigns/${id}`} className="hover:underline">{id}</Link> / Flag
      </div>
      <h1 className="font-serif-display text-4xl mt-1">File a public flag</h1>
      <p className="text-deeptext/70 mt-2">
        Flagging <strong>{campaign?.title || id}</strong>. Flags are a public signal in V1 — they do not
        change the GenLayer verdict and are not an on-chain dispute. The flag is recorded against your wallet.
      </p>

      {!connected && (
        <div className="mt-6 paper-card p-4 flex items-center justify-between border-coral/40">
          <p className="text-sm">Sign in to file a flag.</p>
          <button onClick={connect} className="bg-coral text-cloud px-4 py-2 rounded-md">Enter Judgix</button>
        </div>
      )}

      {done ? (
        <PaperCard className="mt-8" eyebrow="Flag filed" title="Thank you">
          <p className="text-sm">Your flag is recorded on-chain and is visible to validators and the public.</p>
          <Link href={`/campaigns/${id}`} className="text-evidence text-sm mt-4 inline-block hover:underline">Back to trust report →</Link>
        </PaperCard>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6 mt-8">
          <PaperCard>
            <div className="grid gap-4">
              <label className="block">
                <span className="case-stamp text-slate">Reason</span>
                <select className="mt-1 w-full border border-mist rounded px-3 py-2 text-sm" value={reasonPick} onChange={e => setReasonPick(e.target.value)}>
                  {REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="case-stamp text-slate">Details (optional unless reason is &quot;Other&quot;)</span>
                <textarea className="mt-1 w-full border border-mist rounded px-3 py-2 text-sm min-h-[120px]" value={details} onChange={e => setDetails(e.target.value)} />
              </label>
            </div>
          </PaperCard>
          {busy && stage && (
            <div className="paper-card p-4 border-cyan/40"><div className="case-stamp text-evidence">Working</div><p className="text-sm mt-1">{stage}</p></div>
          )}
          {error && <div className="border border-raspberry/30 bg-raspberry/10 text-raspberry rounded-md p-3 text-sm">{error}</div>}
          <div className="flex justify-end">
            <button disabled={busy || !connected} className="bg-raspberry text-cloud px-5 py-3 rounded-md disabled:opacity-60">
              {busy ? stage || "Working…" : "File flag on-chain"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
