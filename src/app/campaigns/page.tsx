"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchCampaign,
  fetchVerdict,
  fetchReviewedCampaignIds,
  fetchCampaignIds,
} from "@/lib/genlayer/contract";
import { Campaign, Verdict, Decision, DonorRiskLevel } from "@/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampaignTrustCard } from "@/components/campaign/CampaignTrustCard";

const DECISION_FILTERS: Array<{ value: "ALL" | Decision; label: string }> = [
  { value: "ALL", label: "ALL" },
  { value: "verified", label: "VERIFIED" },
  { value: "caution", label: "CAUTION" },
  { value: "high_risk", label: "HIGH RISK" },
  { value: "reject", label: "REJECTED" },
];

const RISK_FILTERS: Array<{ value: "ALL" | DonorRiskLevel; label: string }> = [
  { value: "ALL", label: "ANY" },
  { value: "low", label: "LOW" },
  { value: "medium", label: "MEDIUM" },
  { value: "high", label: "HIGH" },
  { value: "critical", label: "CRITICAL" },
];

const SORTS = [
  { value: "trust", label: "Highest authenticity" },
  { value: "evidence", label: "Highest evidence strength" },
  { value: "risk", label: "Highest donor risk" },
  { value: "new", label: "Newest" },
];

export default function CampaignsPage() {
  const [decision, setDecision] = useState<"ALL" | Decision>("ALL");
  const [risk, setRisk] = useState<"ALL" | DonorRiskLevel>("ALL");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("trust");

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Donor dashboard shows reviewed campaigns only.
        let ids = await fetchReviewedCampaignIds().catch(() => [] as string[]);
        if (ids.length === 0) {
          // Fallback while the contract is fresh — show everything that has a
          // verdict by walking the global index. Per-id misses are dropped.
          ids = await fetchCampaignIds(0, 500).catch(() => [] as string[]);
        }
        const pairs = await Promise.all(
          ids.map(async (id) => {
            const [c, v] = await Promise.all([
              fetchCampaign(id).catch(() => null),
              fetchVerdict(id).catch(() => null),
            ]);
            return c && v ? { c, v } : null;
          }),
        );
        if (cancelled) return;
        const cs: Campaign[] = [];
        const vs: Record<string, Verdict> = {};
        for (const p of pairs) {
          if (!p) continue;
          cs.push(p.c);
          vs[p.c.id] = p.v;
        }
        setCampaigns(cs);
        setVerdicts(vs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const list = useMemo(() => {
    let out = campaigns.filter(c => verdicts[c.id]);
    if (decision !== "ALL") out = out.filter(c => verdicts[c.id]?.decision === decision);
    if (risk !== "ALL") out = out.filter(c => verdicts[c.id]?.donorRiskLevel === risk);
    if (q.trim()) {
      const s = q.toLowerCase();
      out = out.filter(c =>
        c.title.toLowerCase().includes(s)
        || c.beneficiarySummary.toLowerCase().includes(s)
        || c.regionSummary.toLowerCase().includes(s)
        || c.category.toLowerCase().includes(s)
        || c.creator.toLowerCase().includes(s)
      );
    }
    const riskRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    out.sort((a, b) => {
      const va = verdicts[a.id]; const vb = verdicts[b.id];
      switch (sort) {
        case "evidence": return (vb?.evidenceStrength ?? 0) - (va?.evidenceStrength ?? 0);
        case "risk": return (riskRank[vb?.donorRiskLevel ?? "low"]) - (riskRank[va?.donorRiskLevel ?? "low"]);
        case "new": return (a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1;
        default: return (vb?.authenticityScore ?? 0) - (va?.authenticityScore ?? 0);
      }
    });
    return out;
  }, [campaigns, verdicts, decision, risk, q, sort]);

  const noFilters = decision === "ALL" && risk === "ALL" && !q.trim();

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="case-stamp text-slate">Donor dashboard · {loading ? "Loading from contract…" : "On-chain"}</div>
          <h1 className="font-serif-display text-4xl mt-1">Public Trust Reports</h1>
          <p className="text-deeptext/70 mt-2 max-w-2xl">
            Every campaign here has a GenLayer consensus verdict on file. Judgix does not handle donations.
            Use the verdict as one signal before deciding off-protocol.
          </p>
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search title, beneficiary, region, creator…"
          className="border border-mist bg-white rounded-md px-3 py-2 text-sm w-full max-w-sm"
        />
      </div>

      <div className="mt-6 paper-card p-4 flex flex-wrap gap-3 items-center">
        <div className="flex flex-wrap gap-2">
          {DECISION_FILTERS.map(d => (
            <button
              key={d.value}
              onClick={() => setDecision(d.value)}
              className={`case-stamp px-3 py-1.5 rounded-md border ${decision === d.value ? "bg-plum text-cloud border-plum" : "border-mist hover:border-evidence"}`}
            >{d.label}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <select value={risk} onChange={e => setRisk(e.target.value as any)} className="border border-mist rounded-md px-3 py-1.5 text-sm">
            {RISK_FILTERS.map(r => <option key={r.value} value={r.value}>Donor risk · {r.label}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} className="border border-mist rounded-md px-3 py-1.5 text-sm">
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="paper-card mt-8 p-12 text-center case-stamp text-slate">Loading trust reports…</div>
      ) : list.length === 0 ? (
        noFilters ? (
          <EmptyState
            eyebrow="Empty docket"
            title="No verdicts on file yet."
            description="Once creators open case files and a review is triggered, public trust reports will appear here."
            primaryAction={{ href: "/create", label: "Open a case file" }}
          />
        ) : (
          <EmptyState
            eyebrow="No matches"
            title="No trust reports match these filters."
            description="Loosen the decision, risk, or search filters to widen the docket."
          />
        )
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
          {list.map(c => (
            <CampaignTrustCard key={c.id} campaign={c} verdict={verdicts[c.id]} />
          ))}
        </div>
      )}

      <p className="text-xs text-slate mt-10 text-center">
        Judgix V1 publishes trust verdicts only. There are no donate, fund, refund or payout actions in this product.
      </p>
    </div>
  );
}
