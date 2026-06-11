"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignStatusBadge } from "@/components/ui/StampedBadge";
import { VerdictPanel } from "@/components/verdict/VerdictPanel";
import { EvidenceBoard, PublicSignalList } from "@/components/evidence/EvidenceBoard";
import { PaperCard, MonoStat } from "@/components/ui/PaperCard";
import { formatCurrency, formatDate, shortAddress } from "@/lib/scoring";
import {
  fetchCampaign,
  fetchCampaignReview,
  fetchUpdatesForCampaign,
  fetchDisputesForCampaign,
  fetchCreatorReputation,
} from "@/lib/genlayer/contract";
import { Campaign, CampaignReview, CampaignUpdate, Dispute } from "@/types";
import { useWallet } from "@/lib/wallet/WalletProvider";

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address, connected } = useWallet();

  const [c, setC] = useState<Campaign | null>(null);
  const [review, setReview] = useState<CampaignReview | null>(null);
  const [updates, setUpdates] = useState<CampaignUpdate[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [reputation, setReputation] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const onChain = await fetchCampaign(id);
        if (cancelled) return;
        if (!onChain) { setNotFoundState(true); return; }
        setC(onChain);
        setLoading(false); // header can paint now — everything else streams in

        // Fire each fetch independently so each section renders as soon as
        // its own RPC returns, instead of waiting on the slowest one.
        fetchCampaignReview(id).then(r => { if (!cancelled) setReview(r ?? null); }).catch(() => {});
        fetchUpdatesForCampaign(id).then(u => { if (!cancelled) setUpdates(u as CampaignUpdate[]); }).catch(() => {});
        fetchDisputesForCampaign(id).then(d => { if (!cancelled) setDisputes(d as Dispute[]); }).catch(() => {});
        if (onChain.creator) {
          fetchCreatorReputation(onChain.creator).then(rep => { if (!cancelled) setReputation(rep); }).catch(() => {});
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <div className="max-w-7xl mx-auto px-6 py-20 text-center text-slate case-stamp">Loading case file from the GenLayer Studio Network…</div>;
  }
  if (notFoundState || !c) return notFound();

  const isCreator = !!(connected && address && address.toLowerCase() === c.creator.toLowerCase());
  const canUpdate = isCreator;
  const canFlag = connected;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <div className="case-stamp text-slate">
        <Link href="/campaigns" className="hover:underline">Case Files</Link> / {c.id}
        <span className="ml-2 text-evidence">· On-chain</span>
      </div>

      <header className="paper-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="case-stamp text-slate">{c.id} · {c.category} · {c.country}</div>
            <h1 className="font-serif-display text-4xl mt-1">{c.title}</h1>
            <div className="mt-2 text-sm text-deeptext/80">Beneficiary · {c.beneficiary}</div>
          </div>
          <CampaignStatusBadge status={c.status} />
        </div>
        <div className="grid md:grid-cols-4 gap-3 mt-6">
          <MonoStat label="Funding goal" value={formatCurrency(c.fundingGoal, c.currency)} />
          <MonoStat label="Creator" value={shortAddress(c.creator)} />
          <MonoStat label="Wallet" value={shortAddress(c.walletAddress)} />
          <MonoStat label="Deadline" value={c.deadline ? formatDate(c.deadline) : "—"} />
        </div>
      </header>

      {review ? (
        <VerdictPanel review={review} />
      ) : (
        <PaperCard eyebrow="Pending review" title="Awaiting GenLayer consensus">
          <p>This campaign is awaiting GenLayer consensus review. Donors should wait for a verdict before relying on this case file.</p>
        </PaperCard>
      )}

      <PaperCard eyebrow="Donor advisory" title="Risk note for donors">
        <p className="text-deeptext/80">
          Judgix provides decentralised evidence review, not a legal guarantee. Use the verdict as one input
          among others. {review?.recommendedAction}
        </p>
      </PaperCard>

      <PaperCard eyebrow="Campaign story" title="What is happening">
        <p className="text-deeptext/90 leading-relaxed whitespace-pre-line">{c.story}</p>
        <div className="grid md:grid-cols-2 gap-4 mt-5">
          <div><div className="case-stamp text-slate">Problem statement</div><p className="text-sm mt-1">{c.problemStatement}</p></div>
          <div><div className="case-stamp text-slate">Who benefits</div><p className="text-sm mt-1">{c.whoBenefits}</p></div>
          <div><div className="case-stamp text-slate">Timeline of events</div><p className="text-sm mt-1">{c.timelineOfEvents}</p></div>
          <div><div className="case-stamp text-slate">Use of funds</div><p className="text-sm mt-1">{c.useOfFunds}</p></div>
        </div>
      </PaperCard>

      <PaperCard eyebrow="Evidence board" title="Documents reviewed by validators">
        <EvidenceBoard items={c.evidence} />
      </PaperCard>

      <PaperCard eyebrow="Public signals" title="Independent corroboration">
        <PublicSignalList signals={c.publicSignals} />
      </PaperCard>

      {review && (
        <div className="grid md:grid-cols-2 gap-5">
          <PaperCard eyebrow="Risk notes" title="Red flags">
            {review.redFlags.length === 0
              ? <p className="text-slate text-sm">No material red flags identified.</p>
              : <ul className="space-y-2 text-sm">
                  {review.redFlags.map((f, i) => (
                    <li key={i} className="flex gap-2"><span className="text-raspberry">●</span><span>{f}</span></li>
                  ))}
                </ul>}
          </PaperCard>
          <PaperCard eyebrow="Positive signals" title="What checks out">
            {review.positiveSignals.length === 0
              ? <p className="text-slate text-sm">No positive signals recorded yet.</p>
              : <ul className="space-y-2 text-sm">
                  {review.positiveSignals.map((f, i) => (
                    <li key={i} className="flex gap-2"><span className="text-[#0F5E4A]">●</span><span>{f}</span></li>
                  ))}
                </ul>}
          </PaperCard>
        </div>
      )}

      <PaperCard eyebrow="Consensus review" title="How this verdict was produced">
        <ul className="space-y-2 text-sm text-deeptext/85">
          <li>· Validators independently assessed the submitted evidence under non-deterministic review.</li>
          <li>· The structured verdict was committed on-chain via the Judgix intelligent contract.</li>
          <li>· State changes flow from decentralised consensus, not a single moderator.</li>
        </ul>
        {review?.reviewTxHash && (
          <div className="mt-4 font-mono text-xs text-slate truncate">Tx · {review.reviewTxHash}</div>
        )}
      </PaperCard>

      <PaperCard eyebrow="Update trail" title="Progress posted by the creator">
        {updates.length === 0
          ? <p className="text-slate text-sm">No updates posted yet.</p>
          : <ul className="space-y-4">
              {updates.map(u => (
                <li key={u.id} className="border border-mist rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-serif-display text-lg">{u.title}</h4>
                    <span className="case-stamp text-slate">{formatDate(u.createdAt)}</span>
                  </div>
                  <p className="text-sm mt-1 text-deeptext/85">{u.body}</p>
                  {u.review && (
                    <div className="mt-3 border-t border-mist pt-3">
                      <div className="case-stamp text-evidence">Update review · {u.review.verdict.replace(/_/g, " ")}</div>
                      <p className="text-sm mt-1">{u.review.reasoningSummary}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>}
        {canUpdate ? (
          <div className="mt-4">
            <Link href={`/campaigns/${c.id}/update`} className="text-evidence text-sm hover:underline">Submit an update →</Link>
          </div>
        ) : (
          <div className="mt-4 case-stamp text-slate">
            Only the campaign creator can post updates{isCreator ? "" : connected ? " (connect creator wallet)" : " (connect wallet)"}.
          </div>
        )}
      </PaperCard>

      <PaperCard eyebrow="Disputes" title="Challenges filed against this case">
        {disputes.length === 0
          ? <p className="text-slate text-sm">No disputes filed.</p>
          : <ul className="space-y-3">
              {disputes.map(d => (
                <li key={d.id} className="border border-mist rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="case-stamp text-raspberry">{d.reason} · severity {d.severity}</div>
                    <span className="case-stamp text-slate">{formatDate(d.createdAt)}</span>
                  </div>
                  <p className="text-sm mt-1">{d.description}</p>
                  {d.review && (
                    <div className="mt-3 border-t border-mist pt-3">
                      <div className="case-stamp text-evidence">Dispute verdict · {d.review.verdict.replace(/_/g, " ")}</div>
                      <p className="text-sm mt-1">{d.review.reasoningSummary}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>}
        {canFlag ? (
          <div className="mt-4">
            <Link href={`/campaigns/${c.id}/flag`} className="text-raspberry text-sm hover:underline">Flag this campaign →</Link>
          </div>
        ) : (
          <div className="mt-4 case-stamp text-slate">Connect a wallet to file a dispute.</div>
        )}
      </PaperCard>

      {reputation && (
        <PaperCard eyebrow="Creator reputation" title="On-chain track record">
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
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-slate font-mono break-all">Creator · {c.creator}</p>
            <Link href={`/creators/${c.creator}`} className="text-evidence text-sm hover:underline">
              View all campaigns by this creator →
            </Link>
          </div>
        </PaperCard>
      )}

      <PaperCard eyebrow="On-chain audit trail" title="Public record">
        <div className="font-mono text-xs space-y-2 text-deeptext/80">
          <div>· {formatDate(c.createdAt)} — Case file opened by {shortAddress(c.creator)}</div>
          {review && <div>· {formatDate(review.createdAt)} — GenLayer verdict {review.verdict} ({review.authenticityScore}/100)</div>}
          {updates.map(u => <div key={u.id}>· {formatDate(u.createdAt)} — Update {u.id} posted{u.review ? ` (${u.review.verdict})` : ""}</div>)}
          {disputes.map(d => <div key={d.id}>· {formatDate(d.createdAt)} — Dispute {d.id} filed{d.review ? ` (${d.review.verdict})` : ""}</div>)}
        </div>
      </PaperCard>
    </div>
  );
}
