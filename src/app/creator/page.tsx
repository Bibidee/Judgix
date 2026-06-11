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

        {loading ? (
          <div className="paper-card mt-6 p-12 text-center case-stamp text-slate">
            Loading your case files from the contract…
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            eyebrow="No case files yet"
            title="You haven&apos;t opened a case file."
            description="Once you submit a campaign it will appear here regardless of status — drafts, awaiting review, reviewed, or appealed."
            primaryAction={{ href: "/create", label: "Open a case file" }}
            secondaryAction={{ href: "/campaigns", label: "Browse public trust reports" }}
          />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
            {campaigns.map(c => <CampaignTrustCard key={c.id} campaign={c} verdict={verdicts[c.id]} />)}
          </div>
        )}
      </section>

      <p className="text-xs text-slate text-center">
        Public trust reports at <Link href="/campaigns" className="underline">/campaigns</Link> only show case files
        that have a GenLayer consensus verdict on file. Use this workspace to track yours through every status.
      </p>
    </div>
  );
}
