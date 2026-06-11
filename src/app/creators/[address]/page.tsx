"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PaperCard, MonoStat } from "@/components/ui/PaperCard";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  fetchCampaign,
  fetchVerdict,
  fetchCreatorCampaigns,
  fetchCreatorReputation,
} from "@/lib/genlayer/contract";
import { Campaign, Verdict, CreatorReputation } from "@/types";
import { shortAddress } from "@/lib/scoring";
import { CampaignTrustCard } from "@/components/campaign/CampaignTrustCard";

export default function CreatorProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [reputation, setReputation] = useState<CreatorReputation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
        setCampaigns(cs);
        setVerdicts(vs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <div className="case-stamp text-slate">
        <Link href="/campaigns" className="hover:underline">Trust reports</Link> / Creator / {shortAddress(address)}
      </div>

      <header className="paper-card p-6">
        <div className="case-stamp text-slate">Creator profile · on-chain</div>
        <h1 className="font-serif-display text-3xl mt-1">{shortAddress(address)}</h1>
        <div className="font-mono text-xs text-slate mt-1 break-all">{address}</div>
      </header>

      {reputation && (
        <PaperCard eyebrow="Reputation" title="On-chain track record">
          <div className="grid md:grid-cols-3 gap-3">
            <MonoStat label="Reviewed campaigns" value={String(reputation.reviewedCampaigns)} />
            <MonoStat label="Verified" value={String(reputation.verifiedCount)} accent="#0F5E4A" />
            <MonoStat label="Caution" value={String(reputation.cautionCount)} accent="#7A4E00" />
            <MonoStat label="High risk" value={String(reputation.highRiskCount)} accent="#B45A2B" />
            <MonoStat label="Rejected" value={String(reputation.rejectedCount)} accent="#9B0345" />
            <MonoStat label="Avg authenticity" value={String(reputation.averageAuthenticityScore)} />
            <MonoStat label="Avg evidence" value={String(reputation.averageEvidenceStrength)} />
            <MonoStat label="Flags received" value={String(reputation.flagCount)} accent="#9B0345" />
            <MonoStat label="Appeals" value={String(reputation.appealCount)} />
          </div>
        </PaperCard>
      )}

      <section>
        <div className="case-stamp text-slate">All case files by this creator</div>
        <h2 className="font-serif-display text-3xl mt-1">Track record</h2>

        {loading ? (
          <div className="paper-card mt-6 p-12 text-center case-stamp text-slate">Loading…</div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            eyebrow="No campaigns"
            title="This creator hasn&apos;t opened a case file."
            description="Once they submit a campaign it will appear here alongside their consensus track record."
            primaryAction={{ href: "/campaigns", label: "Browse trust reports" }}
          />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
            {campaigns.map(c => <CampaignTrustCard key={c.id} campaign={c} verdict={verdicts[c.id]} />)}
          </div>
        )}
      </section>
    </div>
  );
}
