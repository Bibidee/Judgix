import { CampaignReview } from "@/types";
import { scoreColor, formatDate } from "@/lib/scoring";
import { RiskBadge } from "@/components/ui/StampedBadge";

export function VerdictPanel({ review }: { review: CampaignReview }) {
  return (
    <div className="paper-card overflow-hidden">
      <div className="bg-plum text-cloud p-6">
        <div className="case-stamp text-cyan">Consensus Verdict</div>
        <div className="flex items-start justify-between mt-2 gap-4">
          <h2 className="font-serif-display text-3xl">{review.verdict.replace(/_/g, " ")}</h2>
          <div className="text-right">
            <div className="case-stamp text-cyan">Authenticity</div>
            <div className="font-mono text-4xl" style={{ color: scoreColor(review.authenticityScore) }}>
              {review.authenticityScore}<span className="text-cloud/60 text-xl">/100</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <RiskBadge level={review.riskLevel} />
          <span className="case-stamp text-cyan">Confidence · {review.confidence || "—"}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-mist border-b border-mist">
        <Cell label="Evidence" value={review.evidenceQuality} />
        <Cell label="Story" value={review.storyConsistency} />
        <Cell label="Public signal" value={review.publicSignalStrength} />
        <Cell label="Plagiarism" value={review.plagiarismRisk} />
        <Cell label="Goal realism" value={review.fundingGoalRealism} />
      </div>

      <div className="p-6 space-y-4">
        <div>
          <div className="case-stamp text-slate">Recommended donor action</div>
          <p className="mt-1 text-deeptext">{review.recommendedAction}</p>
        </div>
        <div>
          <div className="case-stamp text-slate">Reasoning summary</div>
          <p className="mt-1 text-deeptext">{review.reasoningSummary}</p>
        </div>
        <div className="divider-dashed pt-3 grid grid-cols-2 gap-3 text-xs font-mono text-slate">
          <div>Review ID · {review.id}</div>
          <div>Reviewed · {formatDate(review.createdAt)}</div>
          {review.reviewTxHash && (
            <div className="col-span-2 truncate">Tx · {review.reviewTxHash}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4">
      <div className="case-stamp text-slate">{label}</div>
      <div className="font-mono text-sm mt-1">{value}</div>
    </div>
  );
}
