"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CampaignStatusBadge, RiskBadge } from "@/components/ui/StampedBadge";
import { formatDate, shortAddress } from "@/lib/scoring";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { fetchCampaign, fetchCampaignReview, fetchCampaignIds, fetchDisputesForCampaign, reviewCampaign } from "@/lib/genlayer/contract";
import { pollForReview } from "@/lib/genlayer/sdk";
import { knownCampaignIds } from "@/lib/storage/drafts";
import { Campaign, CampaignReview, Dispute } from "@/types";
import { EmptyState } from "@/components/ui/EmptyState";

const TABS = ["Pending", "Flagged", "High risk", "Recently reviewed", "Dispute queue"];

export default function ReviewDashboard() {
  const { connected, account, isOwner, connect } = useWallet();
  const [tab, setTab] = useState("Pending");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [reviews, setReviews] = useState<Record<string, CampaignReview>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const [disputesByCampaign, setDisputesByCampaign] = useState<Record<string, Dispute[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      let ids = await fetchCampaignIds(0, 500);
      if (ids.length === 0) ids = await knownCampaignIds();
      const fetched: Campaign[] = [];
      const revs: Record<string, CampaignReview> = {};
      const dps: Record<string, Dispute[]> = {};
      for (const id of ids) {
        const c = await fetchCampaign(id).catch(() => null);
        if (c) {
          fetched.push(c);
          const r = await fetchCampaignReview(id).catch(() => null);
          if (r) revs[id] = r;
          const d = await fetchDisputesForCampaign(id).catch(() => []);
          if (d.length) dps[id] = d as Dispute[];
        }
      }
      setCampaigns(fetched); setReviews(revs); setDisputesByCampaign(dps);
    } finally {
      setLoading(false);
    }
  }

  function rowsFor(t: string) {
    switch (t) {
      case "Pending":
        return campaigns.filter(c => c.status === "PENDING_REVIEW" || !reviews[c.id]);
      case "Flagged":
        return campaigns.filter(c => (disputesByCampaign[c.id]?.length ?? 0) > 0);
      case "High risk":
        return campaigns.filter(c => reviews[c.id] && ["HIGH", "CRITICAL"].includes(reviews[c.id].riskLevel));
      case "Recently reviewed":
        return [...campaigns].filter(c => reviews[c.id])
          .sort((a, b) => (reviews[b.id]?.createdAt || 0) - (reviews[a.id]?.createdAt || 0));
      case "Dispute queue":
        return campaigns.filter(c => (disputesByCampaign[c.id] ?? []).some(d => !d.review));
      default: return campaigns;
    }
  }

  async function trigger(id: string) {
    if (!account || !isOwner) return;
    setRunning(id); setStage("Triggering review_campaign on-chain…");
    try {
      await reviewCampaign(account, id, {
        onHash: () => setStage("Tx broadcast — awaiting consensus…"),
      });
      setStage("Polling for verdict…");
      const r = await pollForReview(() => fetchCampaignReview(id), { intervalMs: 4000, timeoutMs: 240_000 });
      if (r) setReviews(rev => ({ ...rev, [id]: r }));
    } catch (e) {
      // surface as alert; details remain on console
      console.error(e);
    } finally {
      setRunning(null); setStage("");
    }
  }

  const rows = rowsFor(tab);

  // Hard gate: the review docket is a moderator workspace. Non-owners must
  // not see the pending / flagged / dispute queues at all.
  if (!connected) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="case-stamp text-slate">Restricted area</div>
        <h1 className="font-serif-display text-4xl mt-2">Review Docket</h1>
        <p className="text-deeptext/70 mt-3 max-w-xl mx-auto">
          The review docket is restricted to the contract owner. Connect a wallet to continue.
        </p>
        <button onClick={connect} className="mt-6 bg-coral text-cloud px-5 py-2.5 rounded-md font-medium">
          Connect wallet
        </button>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="case-stamp text-raspberry">Access denied</div>
        <h1 className="font-serif-display text-4xl mt-2">Moderator only</h1>
        <p className="text-deeptext/70 mt-3 max-w-xl mx-auto">
          This workspace is restricted to the Judgix contract owner. The connected wallet does not
          have moderator privileges, so the pending, flagged, high-risk and dispute queues are hidden.
        </p>
        <div className="mt-6 inline-block paper-card p-4 text-left">
          <div className="case-stamp text-slate">Looking for something else?</div>
          <ul className="mt-2 text-sm space-y-1">
            <li>· <Link href="/campaigns" className="text-evidence hover:underline">Browse case files</Link></li>
            <li>· <Link href="/submit" className="text-evidence hover:underline">Open a new case file</Link></li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="case-stamp text-slate">Moderator workspace · {loading ? "Loading from contract…" : "On-chain"}</div>
      <h1 className="font-serif-display text-4xl mt-1">Review Docket</h1>
      <p className="text-deeptext/70 mt-2">Trigger consensus review, monitor risk, and clear the dispute queue.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`case-stamp px-3 py-1.5 rounded-md border ${tab === t ? "bg-plum text-cloud border-plum" : "border-mist hover:border-evidence"}`}
          >{t}</button>
        ))}
      </div>

      {loading ? (
        <div className="paper-card mt-6 p-12 text-center case-stamp text-slate">Loading docket from the GenLayer Studio Network…</div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          eyebrow="Empty docket"
          title="No case files to review yet."
          description="Once creators submit campaigns they will appear in these queues for moderator review."
          primaryAction={{ href: "/submit", label: "Open a case file" }}
          secondaryAction={{ href: "/campaigns", label: "Browse case files" }}
        />
      ) : (
      <div className="paper-card mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-lilac/40">
            <tr className="text-left">
              {["Case file", "Submitted", "Evidence", "Creator", "Status", "Risk", "Action"].map(h => (
                <th key={h} className="case-stamp text-slate px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate">Nothing in this queue.</td></tr>
            ) : rows.map(c => {
              const r = reviews[c.id];
              const isRunning = running === c.id;
              return (
                <tr key={c.id} className="border-t border-mist">
                  <td className="px-4 py-3">
                    <Link href={`/campaigns/${c.id}`} className="font-serif-display text-base hover:underline">{c.title}</Link>
                    <div className="case-stamp text-slate">{c.id} · {c.category}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.evidence.length}</td>
                  <td className="px-4 py-3 font-mono text-xs">{shortAddress(c.creator)}</td>
                  <td className="px-4 py-3"><CampaignStatusBadge status={c.status} /></td>
                  <td className="px-4 py-3">{r ? <RiskBadge level={r.riskLevel} /> : <span className="case-stamp text-slate">—</span>}</td>
                  <td className="px-4 py-3">
                    {isOwner ? (
                      <button
                        onClick={() => trigger(c.id)}
                        disabled={isRunning}
                        className="bg-cyan text-plum case-stamp px-3 py-1.5 rounded-md disabled:opacity-60"
                      >{isRunning ? (stage || "Running…") : r ? `${r.verdict.replace(/_/g, " ")} · ${r.authenticityScore}/100` : "Run GenLayer review"}</button>
                    ) : (
                      <span className="case-stamp text-slate">moderator only</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
