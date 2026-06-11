"use client";

import { useEffect, useMemo, useState } from "react";
import { CampaignCard } from "@/components/campaign/CampaignCard";
import { CATEGORIES } from "@/lib/constants";
import { knownCampaignIds } from "@/lib/storage/drafts";
import { fetchCampaign, fetchCampaignReview, fetchCampaignIds, fetchCreatorReputation } from "@/lib/genlayer/contract";
import { Campaign, CampaignReview } from "@/types";
import { EmptyState } from "@/components/ui/EmptyState";

const STATUS_FILTERS = ["ALL", "VERIFIED", "PENDING_REVIEW", "NEEDS_MORE_EVIDENCE", "RISKY", "SUSPICIOUS"];
const SORTS = [
  { value: "trust", label: "Highest trust score" },
  { value: "new", label: "Newest" },
  { value: "risk", label: "Highest risk" },
  { value: "updated", label: "Most recently updated" },
];

export default function CampaignsPage() {
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("trust");

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [reviews, setReviews] = useState<Record<string, CampaignReview>>({});
  const [reputations, setReputations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let ids = await fetchCampaignIds(0, 500);
        if (ids.length === 0) ids = await knownCampaignIds();
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

        // Fetch reputation once per unique creator (in parallel)
        const uniqueCreators = Array.from(new Set(fetched.map(c => c.creator).filter(Boolean)));
        const repPairs = await Promise.all(
          uniqueCreators.map(addr =>
            fetchCreatorReputation(addr).then(r => [addr, r] as const).catch(() => [addr, null] as const),
          ),
        );
        const repMap: Record<string, any> = {};
        for (const [addr, rep] of repPairs) if (rep) repMap[addr] = rep;
        setReputations(repMap);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const list = useMemo(() => {
    let out = [...campaigns];
    if (status !== "ALL") out = out.filter(c => c.status === status);
    if (category !== "ALL") out = out.filter(c => c.category === category);
    if (q.trim()) {
      const s = q.toLowerCase();
      out = out.filter(c =>
        c.title.toLowerCase().includes(s)
        || c.beneficiary.toLowerCase().includes(s)
        || c.creator.toLowerCase().includes(s)
        || c.category.toLowerCase().includes(s)
        || c.country.toLowerCase().includes(s)
      );
    }
    const riskRank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    out.sort((a, b) => {
      const ra = reviews[a.id]; const rb = reviews[b.id];
      switch (sort) {
        case "new": return b.createdAt - a.createdAt;
        case "updated": return b.updatedAt - a.updatedAt;
        case "risk": return (riskRank[rb?.riskLevel || "LOW"] || 0) - (riskRank[ra?.riskLevel || "LOW"] || 0);
        default: return (rb?.authenticityScore || 0) - (ra?.authenticityScore || 0);
      }
    });
    return out;
  }, [status, category, q, sort, campaigns, reviews]);

  const noFiltersActive = status === "ALL" && category === "ALL" && !q.trim();

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="case-stamp text-slate">
            Campaign Explorer · {loading ? "Loading from contract…" : "On-chain"}
          </div>
          <h1 className="font-serif-display text-4xl mt-1">All Case Files</h1>
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search title, beneficiary, creator…"
          className="border border-mist bg-white rounded-md px-3 py-2 text-sm w-full max-w-sm"
        />
      </div>

      <div className="mt-6 paper-card p-4 flex flex-wrap gap-3 items-center">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`case-stamp px-3 py-1.5 rounded-md border ${status === s ? "bg-plum text-cloud border-plum" : "border-mist text-deeptext hover:border-evidence"}`}
            >
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <select value={category} onChange={e => setCategory(e.target.value)} className="border border-mist rounded-md px-3 py-1.5 text-sm">
            <option value="ALL">All categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} className="border border-mist rounded-md px-3 py-1.5 text-sm">
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="paper-card mt-8 p-12 text-center case-stamp text-slate">
          Loading case files from the GenLayer Studio Network…
        </div>
      ) : list.length === 0 ? (
        noFiltersActive ? (
          <EmptyState
            eyebrow="Empty docket"
            title="No case files yet."
            description="Open the first case file and let GenLayer validators produce a structured authenticity verdict."
            primaryAction={{ href: "/submit", label: "Open a case file" }}
          />
        ) : (
          <EmptyState
            eyebrow="No matches"
            title="No case files match these filters."
            description="Try clearing the search box or relaxing the status / category filters."
          />
        )
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
          {list.map(c => <CampaignCard key={c.id} campaign={c} review={reviews[c.id]} reputation={reputations[c.creator]} />)}
        </div>
      )}
    </div>
  );
}
