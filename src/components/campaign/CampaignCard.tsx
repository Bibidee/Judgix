import Link from "next/link";
import { Campaign, CampaignReview } from "@/types";
import { CampaignStatusBadge, RiskBadge } from "@/components/ui/StampedBadge";
import { formatCurrency, formatDate, shortAddress, scoreColor } from "@/lib/scoring";

export type CreatorReputation = {
  campaigns_created?: number;
  verified_campaigns?: number;
  risky_campaigns?: number;
  rejected_campaigns?: number;
  reputation_score?: number;
  risk_score?: number;
};

function ReputationBadge({ rep }: { rep: CreatorReputation }) {
  const total = Number(rep.campaigns_created ?? 0);
  const verified = Number(rep.verified_campaigns ?? 0);
  const risky = Number(rep.risky_campaigns ?? 0);
  const rejected = Number(rep.rejected_campaigns ?? 0);
  const repScore = Number(rep.reputation_score ?? 0);

  if (total <= 1 && verified === 0 && risky === 0 && rejected === 0) {
    return (
      <span className="case-stamp px-2 py-0.5 rounded border border-mist text-slate" title="First case file from this creator">
        first-time creator
      </span>
    );
  }

  let label = `${verified} verified · ${total} total`;
  let bg = "#7AE7C7", fg = "#0F5E4A";
  if (rejected > 0 || repScore < -10) { bg = "#D90368"; fg = "#FFFFFF"; label = `${rejected} rejected · ${total} total`; }
  else if (risky > 0) { bg = "#FFD166"; fg = "#7A4E00"; label = `${risky} risky · ${total} total`; }
  else if (verified === 0) { bg = "#DCE9F2"; fg = "#171321"; label = `${total} campaign${total === 1 ? "" : "s"}`; }

  return (
    <span className="case-stamp px-2 py-0.5 rounded" style={{ background: bg, color: fg }} title={`Reputation score ${repScore}`}>
      {label}
    </span>
  );
}

export function CampaignCard({ campaign, review, reputation }: { campaign: Campaign; review?: CampaignReview; reputation?: CreatorReputation }) {
  return (
    <Link href={`/campaigns/${campaign.id}`} className="block paper-card p-5 hover:border-evidence transition">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="case-stamp text-slate">{campaign.id} · {campaign.category}</div>
          <h3 className="font-serif-display text-xl mt-1 text-deeptext">{campaign.title}</h3>
        </div>
        <CampaignStatusBadge status={campaign.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="case-stamp text-slate">Funding goal</div>
          <div className="font-mono">{formatCurrency(campaign.fundingGoal, campaign.currency)}</div>
        </div>
        <div>
          <div className="case-stamp text-slate">Creator</div>
          <div className="font-mono">{shortAddress(campaign.creator)}</div>
          {reputation && <div className="mt-1"><ReputationBadge rep={reputation} /></div>}
        </div>
        <div>
          <div className="case-stamp text-slate">Evidence</div>
          <div className="font-mono">{campaign.evidence.length} item(s)</div>
        </div>
        <div>
          <div className="case-stamp text-slate">Last reviewed</div>
          <div className="font-mono">{review ? formatDate(review.createdAt) : "—"}</div>
        </div>
      </div>

      {review && (
        <div className="mt-4 flex items-center justify-between border-t border-mist pt-3">
          <div className="flex items-center gap-2">
            <span className="case-stamp text-slate">Integrity</span>
            <span className="font-mono text-lg" style={{ color: scoreColor(review.authenticityScore) }}>
              {review.authenticityScore}/100
            </span>
          </div>
          <RiskBadge level={review.riskLevel} />
        </div>
      )}
    </Link>
  );
}
