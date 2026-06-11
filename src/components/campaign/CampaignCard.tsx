import Link from "next/link";
import { Campaign, CampaignReview } from "@/types";
import { CampaignStatusBadge, RiskBadge } from "@/components/ui/StampedBadge";
import { formatCurrency, formatDate, shortAddress, scoreColor } from "@/lib/scoring";

export function CampaignCard({ campaign, review }: { campaign: Campaign; review?: CampaignReview }) {
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
