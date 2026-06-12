import Link from "next/link";
import { Campaign, Verdict, Decision, DonorRiskLevel } from "@/types";
import { shortAddress } from "@/lib/scoring";

const DECISION_STYLE: Record<Decision, { color: string; bg: string }> = {
  verified: { color: "#0F5E4A", bg: "#7AE7C7" },
  caution: { color: "#7A4E00", bg: "#FFD166" },
  high_risk: { color: "#FFFFFF", bg: "#FF6B5E" },
  reject: { color: "#FFFFFF", bg: "#D90368" },
};

const RISK_STYLE: Record<DonorRiskLevel, { color: string; bg: string }> = {
  low: { color: "#0F5E4A", bg: "#7AE7C7" },
  medium: { color: "#7A4E00", bg: "#FFD166" },
  high: { color: "#FFFFFF", bg: "#FF6B5E" },
  critical: { color: "#FFFFFF", bg: "#D90368" },
};

function chip({ color, bg }: { color: string; bg: string }, label: string) {
  return (
    <span className="case-stamp px-2 py-0.5 rounded" style={{ background: bg, color }}>{label}</span>
  );
}

function statusStyle(status: string): { color: string; bg: string } {
  switch (status) {
    case "CANCELLED": return { color: "#FFFFFF", bg: "#6D5A7D" };
    case "READY_FOR_REVIEW": return { color: "#7A4E00", bg: "#FFD166" };
    case "UNDER_REVIEW": return { color: "#FFFFFF", bg: "#22D3EE" };
    case "CREATED":
    case "EVIDENCE_COMMITTED":
    case "EVIDENCE_REVEALED":
      return { color: "#171321", bg: "#F2E9FF" };
    case "FLAGGED": return { color: "#FFFFFF", bg: "#D90368" };
    case "APPEALED":
    case "APPEAL_EVIDENCE_COMMITTED":
    case "APPEAL_EVIDENCE_REVEALED":
    case "READY_FOR_APPEAL_REVIEW":
      return { color: "#7A4E00", bg: "#FFD166" };
    case "HIDDEN":
    case "SPAM":
      return { color: "#FFFFFF", bg: "#24162F" };
    default:
      return { color: "#171321", bg: "#DCE9F2" };
  }
}

export function CampaignTrustCard({ campaign, verdict }: { campaign: Campaign; verdict?: Verdict }) {
  const decisionStyle = verdict ? DECISION_STYLE[verdict.decision] : { color: "#171321", bg: "#DCE9F2" };
  const riskStyle = verdict ? RISK_STYLE[verdict.donorRiskLevel] : { color: "#171321", bg: "#DCE9F2" };

  return (
    <Link href={`/campaigns/${campaign.id}`} className="block paper-card p-5 hover:border-evidence transition">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="case-stamp text-slate">{campaign.id} · {campaign.category}</div>
          <h3 className="font-serif-display text-xl mt-1 text-deeptext line-clamp-2">{campaign.title}</h3>
        </div>
        {verdict
          ? chip(decisionStyle, verdict.decision.replace(/_/g, " "))
          : chip(statusStyle(campaign.status), campaign.status.replace(/_/g, " "))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="case-stamp text-slate">Funding goal</div>
          <div className="font-mono">{campaign.currency} {campaign.fundingGoal.toLocaleString()}</div>
        </div>
        <div>
          <div className="case-stamp text-slate">Creator</div>
          <div className="font-mono">{shortAddress(campaign.creator)}</div>
        </div>
        <div>
          <div className="case-stamp text-slate">Region</div>
          <div className="text-sm">{campaign.regionSummary || "—"}</div>
        </div>
        <div>
          <div className="case-stamp text-slate">Beneficiary</div>
          <div className="text-sm line-clamp-1">{campaign.beneficiarySummary || "—"}</div>
        </div>
      </div>

      {verdict && (
        <div className="mt-4 border-t border-mist pt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="case-stamp text-slate">Authenticity</span>
            <span className="font-mono text-lg" style={{ color: decisionStyle.color }}>
              {verdict.authenticityScore}/100
            </span>
          </div>
          {chip(riskStyle, `Risk · ${verdict.donorRiskLevel}`)}
        </div>
      )}
    </Link>
  );
}
