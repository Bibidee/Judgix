"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { CampaignCard } from "@/components/campaign/CampaignCard";
import { PaperCard, MonoStat } from "@/components/ui/PaperCard";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  fetchCampaign,
  fetchCampaignReview,
  fetchCreatorCampaigns,
  fetchCreatorReputation,
} from "@/lib/genlayer/contract";
import { Campaign, CampaignReview } from "@/types";
import { shortAddress } from "@/lib/scoring";

export default function CreatorPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [reviews, setReviews] = useState<Record<string, CampaignReview>>({});
  const [reputation, setReputation] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [ids, rep] = await Promise.all([
          fetchCreatorCampaigns(address).catch(() => [] as string[]),
          fetchCreatorReputation(address).catch(() => null),
        ]);
        setReputation(rep ?? null);

        const fetched: Campaign[] = [];
        const revs: Record<string, CampaignReview> = {};
        for (const id of ids) {
          const c = await fetchCampaign(id).catch(() => null);
          if (!c) continue;
          fetched.push(c);
          const r = await fetchCampaignReview(id).catch(() => null);
          if (r) revs[id] = r;
        }
        setCampaigns(fetched);
        setReviews(revs);
      } finally {
        setLoading(false);
      }
    })();
  }, [address]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <div className="case-stamp text-slate">
        <Link href="/campaigns" className="hover:underline">Case Files</Link> / Creator / {shortAddress(address)}
      </div>

      <header className="paper-card p-6">
        <div className="case-stamp text-slate">Creator profile · on-chain</div>
        <h1 className="font-serif-display text-3xl mt-1">{shortAddress(address)}</h1>
        <div className="font-mono text-xs text-slate mt-1 break-all">{address}</div>
      </header>

      {reputation && (
        <PaperCard eyebrow="Reputation" title="On-chain track record">
          <div className="grid md:grid-cols-3 gap-3">
            <MonoStat label="Reputation score" value={String(reputation.reputation_score ?? 0)} accent="#0F5E4A" />
            <MonoStat label="Risk score" value={String(reputation.risk_score ?? 0)} accent="#D90368" />
            <MonoStat label="Campaigns" value={String(reputation.campaigns_created ?? 0)} />
            <MonoStat label="Verified" value={String(reputation.verified_campaigns ?? 0)} accent="#0F5E4A" />
            <MonoStat label="Risky" value={String(reputation.risky_campaigns ?? 0)} accent="#B45A2B" />
            <MonoStat label="Rejected" value={String(reputation.rejected_campaigns ?? 0)} accent="#9B0345" />
            <MonoStat label="Updates" value={String(reputation.updates_submitted ?? 0)} />
            <MonoStat label="Disputes" value={String(reputation.disputes_received ?? 0)} />
            <MonoStat label="Confirmed disputes" value={String(reputation.disputes_confirmed ?? 0)} accent="#9B0345" />
          </div>
        </PaperCard>
      )}

      <section>
        <div className="case-stamp text-slate">All case files by this creator</div>
        <h2 className="font-serif-display text-3xl mt-1">Track record</h2>

        {loading ? (
          <div className="paper-card mt-6 p-12 text-center case-stamp text-slate">
            Loading creator&apos;s campaigns from the GenLayer Studio Network…
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            eyebrow="No campaigns"
            title="This creator hasn&apos;t opened a case file."
            description="Once they submit a campaign it will appear here alongside their consensus track record."
            primaryAction={{ href: "/campaigns", label: "Browse all campaigns" }}
          />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
            {campaigns.map(c => <CampaignCard key={c.id} campaign={c} review={reviews[c.id]} />)}
          </div>
        )}
      </section>
    </div>
  );
}
