"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PaperCard, MonoStat } from "@/components/ui/PaperCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampaignTrustCard } from "@/components/campaign/CampaignTrustCard";
import {
  fetchCampaign,
  fetchVerdict,
  fetchCreatorCampaigns,
  fetchCreatorReputation,
} from "@/lib/genlayer/contract";
import { Campaign, Verdict, CreatorReputation } from "@/types";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { shortAddress } from "@/lib/scoring";

export default function CreatorDashboard() {
  const { connected, address, connect } = useWallet();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [reputation, setReputation] = useState<CreatorReputation | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => {
    if (!address) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [ids, rep] = await Promise.all([
          fetchCreatorCampaigns(address).catch(() => [] as string[]),
          fetchCreatorReputation(address).catch(() => null),
        ]);
        if (cancelled) return;
        setReputation(rep);

        const pairs = await Promise.all(
          ids.map(async (id) => {
            const [c, v] = await Promise.all([
              fetchCampaign(id).catch(() => null),
              fetchVerdict(id).catch(() => null),
            ]);
            return c ? { c, v } : null;
          }),
        );
        if (cancelled) return;
        const cs: Campaign[] = [];
        const vs: Record<string, Verdict> = {};
        for (const p of pairs) {
          if (!p) continue;
          cs.push(p.c);
          if (p.v) vs[p.c.id] = p.v;
        }
        // Newest first (createdAt may not be a sortable string, but ids carry
        // timestamps and the global index is insertion order — reverse the
        // contract list).
        cs.reverse();
        setCampaigns(cs);
        setVerdicts(vs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  if (!connected) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="case-stamp text-slate">Creator workspace</div>
        <h1 className="font-serif-display text-4xl mt-2">Your case files</h1>
        <p className="text-deeptext/70 mt-3 max-w-xl mx-auto">
          Sign in to see every case file you have opened — drafts, awaiting review, reviewed, and appealed.
        </p>
        <button onClick={connect} className="mt-6 bg-coral text-cloud px-5 py-2.5 rounded-md font-medium">
          Enter Judgix
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <header className="paper-card p-6">
        <div className="case-stamp text-slate">Creator workspace · on-chain</div>
        <h1 className="font-serif-display text-3xl mt-1">Your case files</h1>
        <div className="font-mono text-xs text-slate mt-1 break-all">{address}</div>
        <div className="mt-4">
          <Link href={`/creators/${address}`} className="text-evidence text-sm hover:underline">
            View your public reputation profile →
          </Link>
        </div>
      </header>

      {reputation && (
        <PaperCard eyebrow="Reputation" title="On-chain track record">
          <div className="grid md:grid-cols-3 gap-3">
            <MonoStat label="Total campaigns" value={String(reputation.totalCampaigns)} />
            <MonoStat label="Reviewed" value={String(reputation.reviewedCampaigns)} />
            <MonoStat label="Verified" value={String(reputation.verifiedCount)} accent="#0F5E4A" />
            <MonoStat label="Caution" value={String(reputation.cautionCount)} accent="#7A4E00" />
            <MonoStat label="High risk" value={String(reputation.highRiskCount)} accent="#B45A2B" />
            <MonoStat label="Rejected" value={String(reputation.rejectedCount)} accent="#9B0345" />
            <MonoStat label="Avg authenticity" value={String(reputation.averageAuthenticityScore)} />
            <MonoStat label="Avg evidence" value={String(reputation.averageEvidenceStrength)} />
            <MonoStat label="Flags received" value={String(reputation.flagCount)} accent="#9B0345" />
          </div>
        </PaperCard>
      )}

      <section>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="case-stamp text-slate">Every case file you have opened</div>
            <h2 className="font-serif-display text-3xl mt-1">Your docket</h2>
          </div>
          <Link href="/create" className="bg-coral text-cloud px-4 py-2 rounded-md text-sm font-medium">
            Open new case file
          </Link>
        </div>

        {(() => {
          const cancelledCount = campaigns.filter(c => c.status === "CANCELLED").length;
          const visible = showCancelled ? campaigns : campaigns.filter(c => c.status !== "CANCELLED");
          return (
            <>
              {cancelledCount > 0 && (
                <div className="paper-card mt-6 p-3 flex items-center justify-between text-sm">
                  <div className="case-stamp text-slate">
                    {cancelledCount} cancelled case file{cancelledCount === 1 ? "" : "s"} hidden
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />
                    <span className="case-stamp text-evidence">Show cancelled</span>
                  </label>
                </div>
              )}

              {loading ? (
                <div className="paper-card mt-6 p-12 text-center case-stamp text-slate">
                  Loading your case files from the contract…
                </div>
              ) : visible.length === 0 ? (
                campaigns.length === 0 ? (
                  <EmptyState
                    eyebrow="No case files yet"
                    title="You haven&apos;t opened a case file."
                    description="Once you submit a campaign it will appear here regardless of status — drafts, awaiting review, reviewed, or appealed."
                    primaryAction={{ href: "/create", label: "Open a case file" }}
                    secondaryAction={{ href: "/campaigns", label: "Browse public trust reports" }}
                  />
                ) : (
                  <EmptyState
                    eyebrow="Only cancelled case files"
                    title="Every case file you have is cancelled."
                    description="Toggle &quot;Show cancelled&quot; above to see them, or open a new case file."
                    primaryAction={{ href: "/create", label: "Open a case file" }}
                  />
                )
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
                  {visible.map(c => <CampaignTrustCard key={c.id} campaign={c} verdict={verdicts[c.id]} />)}
                </div>
              )}
            </>
          );
        })()}
      </section>

      <PaperCard eyebrow="What you can do with a case file" title="Edit, cancel, and reviewed campaigns">
        <ul className="text-sm space-y-2 text-deeptext/85">
          <li>· Case files on Judgix are <strong>immutable on-chain</strong>. The contract does not expose an edit method, so the title, story, evidence and goal cannot be changed once submitted.</li>
          <li>· If you opened a case file by mistake or twice, <strong>cancel it</strong> from its trust report before review is triggered. Cancelled case files are hidden here by default.</li>
          <li>· Once a case file is <strong>under review or reviewed</strong>, it cannot be cancelled, edited or removed. The GenLayer verdict is the public record.</li>
          <li>· If you spot factual issues with a reviewed case file, file an <strong>appeal</strong> with new sanitised evidence — the appeal flow re-runs consensus instead of editing the original record.</li>
        </ul>
      </PaperCard>

      <p className="text-xs text-slate text-center">
        Public trust reports at <Link href="/campaigns" className="underline">/campaigns</Link> only show case files
        that have a GenLayer consensus verdict on file. Use this workspace to track yours through every status.
      </p>
    </div>
  );
}
