"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchCampaign, fetchVerdict, fetchReviewedCampaignIds, fetchCampaignIds } from "@/lib/genlayer/contract";
import { Campaign, Verdict, Decision } from "@/types";
import { shortAddress } from "@/lib/scoring";

const DECISION_COLOR: Record<Decision, string> = {
  verified: "#0F5E4A",
  caution: "#7A4E00",
  high_risk: "#B45A2B",
  reject: "#9B0345",
};

function HeroVerdictCard({
  featured,
  verdictById,
  loading,
}: {
  featured: Campaign[];
  verdictById: Record<string, Verdict>;
  loading: boolean;
}) {
  const ordered = [...featured].sort((a, b) => (verdictById[b.id] ? 1 : 0) - (verdictById[a.id] ? 1 : 0));
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (ordered.length <= 1) return;
    const t = setInterval(() => {
      setPhase("out");
      setTimeout(() => {
        setI(prev => (prev + 1) % ordered.length);
        setPhase("in");
      }, 350);
    }, 4500);
    return () => clearInterval(t);
  }, [ordered.length]);

  if (loading && ordered.length === 0) {
    return (
      <div className="paper-card !bg-cloud p-6 text-deeptext">
        <div className="flex items-center gap-2">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-mint opacity-75 animate-ping"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-mint"></span>
          </span>
          <span className="case-stamp text-slate">Loading verdicts from the Studio Network…</span>
        </div>
        <div className="mt-4 space-y-3 animate-pulse">
          <div className="h-7 bg-mist/70 rounded w-3/4" />
          <div className="h-4 bg-mist/60 rounded w-1/2" />
          <div className="h-16 bg-mist/40 rounded" />
        </div>
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <div className="paper-card !bg-cloud p-6 text-deeptext">
        <div className="case-stamp text-slate">Live on the Studio Network</div>
        <h3 className="font-serif-display text-2xl mt-2">No case files yet</h3>
        <p className="text-sm mt-3 text-deeptext/80">
          As creators open case files and validators reach consensus, recent verdicts will rotate
          through this card in real time.
        </p>
        <Link href="/create" className="inline-block mt-4 case-stamp text-evidence hover:underline">
          Open the first case file →
        </Link>
      </div>
    );
  }

  const current = ordered[i % ordered.length];
  const verdict = verdictById[current.id];
  const color = verdict ? DECISION_COLOR[verdict.decision] : "#6D5A7D";

  return (
    <div className="paper-card !bg-cloud p-6 text-deeptext relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-mint opacity-75 animate-ping"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-mint"></span>
          </span>
          <span className="case-stamp text-slate">Live · GenLayer Studio Network</span>
        </div>
        {ordered.length > 1 && (
          <div className="flex gap-1.5 max-w-[40%] flex-wrap justify-end">
            {ordered.map((_, idx) => (
              <span
                key={idx}
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{ background: idx === i % ordered.length ? color : "#DCE9F2" }}
              />
            ))}
          </div>
        )}
      </div>

      <Link
        key={current.id}
        href={`/campaigns/${current.id}`}
        className="block mt-3"
        style={{
          transition: "opacity 350ms ease, transform 350ms ease",
          opacity: phase === "in" ? 1 : 0,
          transform: phase === "in" ? "translateY(0)" : "translateY(6px)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="case-stamp text-slate">Case file · {current.id}</div>
          <span className="case-stamp text-slate">{current.status.replace(/_/g, " ")}</span>
        </div>
        <h3 className="font-serif-display text-2xl mt-2 line-clamp-2">{current.title}</h3>

        {verdict ? (
          <>
            <div className="mt-4 flex items-center justify-between border-y border-mist py-3">
              <div>
                <div className="case-stamp text-slate">Decision</div>
                <div className="font-serif-display text-xl uppercase" style={{ color }}>
                  {verdict.decision.replace(/_/g, " ")}
                </div>
              </div>
              <div className="text-right">
                <div className="case-stamp text-slate">Authenticity</div>
                <div className="font-mono text-3xl" style={{ color }}>
                  {verdict.authenticityScore}/100
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm line-clamp-3">
              {verdict.reasoning[0] ?? "GenLayer consensus verdict on file."}
            </p>
          </>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between border-y border-mist py-3">
              <div>
                <div className="case-stamp text-slate">Beneficiary</div>
                <div className="font-serif-display text-lg">{current.beneficiarySummary || "—"}</div>
              </div>
              <div className="text-right">
                <div className="case-stamp text-slate">Creator</div>
                <div className="font-mono text-sm">{shortAddress(current.creator)}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-deeptext/80 line-clamp-3">
              {current.story || "Awaiting GenLayer consensus review."}
            </p>
          </>
        )}
      </Link>
    </div>
  );
}

export default function LandingPage() {
  const [featured, setFeatured] = useState<Campaign[]>([]);
  const [verdictById, setVerdictById] = useState<Record<string, Verdict>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Prefer reviewed campaigns, fall back to the global index.
        let ids = await fetchReviewedCampaignIds().catch(() => [] as string[]);
        if (ids.length === 0) ids = await fetchCampaignIds(0, 60).catch(() => [] as string[]);
        const recent = [...ids].reverse().slice(0, 30);

        const pairs = await Promise.all(
          recent.map(async (id) => {
            const [c, v] = await Promise.all([
              fetchCampaign(id).catch(() => null),
              fetchVerdict(id).catch(() => null),
            ]);
            return c ? { c, v } : null;
          }),
        );
        if (cancelled) return;

        const out: Campaign[] = [];
        const verdicts: Record<string, Verdict> = {};
        for (const p of pairs) {
          if (!p) continue;
          out.push(p.c);
          if (p.v) verdicts[p.c.id] = p.v;
        }
        out.sort((a, b) => (verdicts[b.id] ? 1 : 0) - (verdicts[a.id] ? 1 : 0));
        setFeatured(out);
        setVerdictById(verdicts);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <section className="bg-plum text-cloud">
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            <div className="case-stamp text-cyan">Relief Signal Desk · est. 2026</div>
            <h1 className="font-serif-display text-5xl md:text-6xl mt-3 leading-[1.05]">
              Crowdfunding runs on trust.<br />
              <span className="text-cyan">Judgix</span> makes that trust reviewable.
            </h1>
            <p className="mt-6 text-cloud/80 max-w-xl">
              Creators open case files and commit sanitised evidence. GenLayer validators reach consensus on
              authenticity and donor risk. Public trust verdicts live on-chain for anyone to read.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/create" className="bg-coral text-cloud px-5 py-3 rounded-md font-medium hover:opacity-90">
                Open a Case File
              </Link>
              <Link href="/campaigns" className="border border-cyan text-cyan px-5 py-3 rounded-md font-medium hover:bg-cyan hover:text-plum transition">
                Browse Trust Reports
              </Link>
            </div>
          </div>
          <div className="md:col-span-5">
            <HeroVerdictCard featured={featured} verdictById={verdictById} loading={loading} />
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="case-stamp text-slate">How it works</div>
        <h2 className="font-serif-display text-4xl mt-2">Four steps from claim to consensus</h2>
        <div className="grid md:grid-cols-4 gap-4 mt-8">
          {[
            ["01", "Open a case file", "Creator submits public campaign details — title, story, beneficiary summary, use-of-funds."],
            ["02", "Commit sanitised evidence", "Sensitive documents are summarised. Raw private records never go on-chain."],
            ["03", "GenLayer consensus", "Anyone can trigger review by paying a small fee. Validators reach consensus on authenticity and donor risk."],
            ["04", "Public trust report", "Donors browse the verdict, reasoning, risk flags and required improvements before deciding off-protocol."],
          ].map(([n, t, d]) => (
            <div key={n} className="paper-card p-5">
              <div className="case-stamp text-coral">Step {n}</div>
              <h4 className="font-serif-display text-xl mt-1">{t}</h4>
              <p className="text-sm mt-2 text-deeptext/80">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-lilac/60 border-y border-mist">
        <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-10">
          <div>
            <div className="case-stamp text-evidence">Why crowdfunding needs consensus</div>
            <h2 className="font-serif-display text-4xl mt-2">A deterministic contract cannot read a story.</h2>
            <p className="mt-4 text-deeptext/80">
              Deciding whether a medical emergency sounds consistent, whether evidence supports the claim, or whether a campaign reuses a known scam template is a judgement problem. Validators may reasonably disagree; GenLayer consensus converges them into a structured verdict the chain can rely on.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Story consistency", "Internal logic of the timeline."],
              ["Evidence strength", "Whether sanitised summaries support the claim."],
              ["Funding goal realism", "Plausibility of the requested amount."],
              ["Plagiarism risk", "Detection of reused scam templates."],
              ["Beneficiary clarity", "Who actually benefits."],
              ["Donor safety", "Whether donating is reasonable today."],
            ].map(([h, d]) => (
              <div key={h} className="paper-card p-4">
                <div className="case-stamp text-coral">{h}</div>
                <p className="text-sm mt-1">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-plum text-cloud">
        <div className="max-w-7xl mx-auto px-6 py-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-serif-display text-3xl">Verify the story before the money moves.</h3>
            <p className="text-cloud/70 mt-2">Open a case file or browse public trust reports.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/create" className="bg-coral text-cloud px-5 py-3 rounded-md font-medium">Open a Case File</Link>
            <Link href="/campaigns" className="border border-cyan text-cyan px-5 py-3 rounded-md">Explore</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
