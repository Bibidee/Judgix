"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CampaignCard } from "@/components/campaign/CampaignCard";
import { fetchCampaign, fetchCampaignReview, fetchCampaignIds } from "@/lib/genlayer/contract";
import { Campaign, CampaignReview } from "@/types";

export default function LandingPage() {
  const [featured, setFeatured] = useState<Campaign[]>([]);
  const [reviewById, setReviewById] = useState<Record<string, CampaignReview>>({});

  useEffect(() => {
    (async () => {
      const ids = await fetchCampaignIds(0, 9);
      const out: Campaign[] = [];
      const rev: Record<string, CampaignReview> = {};
      for (const id of ids.slice(0, 3)) {
        const c = await fetchCampaign(id).catch(() => null);
        if (!c) continue;
        out.push(c);
        const r = await fetchCampaignReview(id).catch(() => null);
        if (r) rev[id] = r;
      }
      setFeatured(out);
      setReviewById(rev);
    })();
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="bg-plum text-cloud">
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            <div className="case-stamp text-cyan">Relief Signal Desk · est. 2026</div>
            <h1 className="font-serif-display text-5xl md:text-6xl mt-3 leading-[1.05]">
              Crowdfunding runs on trust.<br/>
              <span className="text-cyan">Judgix</span> makes that trust reviewable.
            </h1>
            <p className="mt-6 text-cloud/80 max-w-xl">
              Submit a campaign, attach evidence, and let GenLayer validators assess legitimacy,
              consistency, and donor risk before funds are promoted.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/submit" className="bg-coral text-cloud px-5 py-3 rounded-md font-medium hover:opacity-90">
                Open a Case File
              </Link>
              <Link href="/campaigns" className="border border-cyan text-cyan px-5 py-3 rounded-md font-medium hover:bg-cyan hover:text-plum transition">
                View Verified Campaigns
              </Link>
            </div>
          </div>
          <div className="md:col-span-5">
            <div className="paper-card !bg-cloud p-6 text-deeptext">
              <div className="case-stamp text-slate">How a verdict reads</div>
              <h3 className="font-serif-display text-2xl mt-2">Donor Advisory · sample</h3>
              <div className="mt-4 flex items-center justify-between border-y border-mist py-3">
                <div>
                  <div className="case-stamp text-slate">Verdict</div>
                  <div className="font-serif-display text-xl text-[#0F5E4A]">VERIFIED</div>
                </div>
                <div className="text-right">
                  <div className="case-stamp text-slate">Integrity</div>
                  <div className="font-mono text-3xl text-[#0F5E4A]">89/100</div>
                </div>
              </div>
              <p className="mt-3 text-sm">
                Independent evidence corroborates the story. Donors may contribute with normal due diligence.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="case-stamp text-slate">How it works</div>
        <h2 className="font-serif-display text-4xl mt-2">Four steps from claim to consensus</h2>
        <div className="grid md:grid-cols-4 gap-4 mt-8">
          {[
            ["01", "Open a case file", "Creator submits campaign details, evidence and public signals."],
            ["02", "Consensus review", "GenLayer validators read evidence and judge consistency."],
            ["03", "Structured verdict", "A signed JSON verdict is stored on-chain alongside the campaign."],
            ["04", "Donor advisory", "Donors and platforms see authenticity score, risk and red flags."],
          ].map(([n, t, d]) => (
            <div key={n} className="paper-card p-5">
              <div className="case-stamp text-coral">Step {n}</div>
              <h4 className="font-serif-display text-xl mt-1">{t}</h4>
              <p className="text-sm mt-2 text-deeptext/80">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why GenLayer */}
      <section className="bg-lilac/60 border-y border-mist">
        <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-10">
          <div>
            <div className="case-stamp text-evidence">Why crowdfunding needs consensus</div>
            <h2 className="font-serif-display text-4xl mt-2">A deterministic contract cannot read a story.</h2>
            <p className="mt-4 text-deeptext/80">
              Deciding whether a medical emergency sounds consistent, whether public links support the
              campaign, or whether a copied story has been reused under another name are non-deterministic
              judgement problems. Validators may reasonably disagree; GenLayer consensus converges them
              into a structured verdict the chain can rely on.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Story consistency", "Internal logic of timeline and stakes."],
              ["Evidence relevance", "Whether documents actually support the claim."],
              ["Public signal match", "Independent corroboration online."],
              ["Plagiarism risk", "Detection of reused scam templates."],
              ["Funding goal realism", "Plausibility of the requested amount."],
              ["Update accountability", "Whether progress posts hold up."],
            ].map(([h, d]) => (
              <div key={h} className="paper-card p-4">
                <div className="case-stamp text-coral">{h}</div>
                <p className="text-sm mt-1">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent cards from contract */}
      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 py-16">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="case-stamp text-slate">Recent case files · on-chain</div>
              <h2 className="font-serif-display text-4xl mt-1">From the docket</h2>
            </div>
            <Link href="/campaigns" className="text-evidence text-sm hover:underline">All campaigns →</Link>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {featured.map(c => <CampaignCard key={c.id} campaign={c} review={reviewById[c.id]} />)}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="bg-plum text-cloud">
        <div className="max-w-7xl mx-auto px-6 py-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-serif-display text-3xl">Verify the story before the money moves.</h3>
            <p className="text-cloud/70 mt-2">Open a case file or browse verified campaigns.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/submit" className="bg-coral text-cloud px-5 py-3 rounded-md font-medium">Open a Case File</Link>
            <Link href="/campaigns" className="border border-cyan text-cyan px-5 py-3 rounded-md">Explore</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
