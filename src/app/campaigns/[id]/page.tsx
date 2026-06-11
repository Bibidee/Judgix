"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaperCard, MonoStat } from "@/components/ui/PaperCard";
import { formatDate, shortAddress } from "@/lib/scoring";
import {
  fetchCampaign,
  fetchVerdict,
  fetchEvidence,
  fetchProtocolConfig,
  fetchCreatorReputation,
  fetchFlagIdsForCampaign,
  triggerReview,
  cancelCampaign,
  explainContractError,
} from "@/lib/genlayer/contract";
import { Campaign, Verdict, SanitisedEvidence, CreatorReputation, Decision, DonorRiskLevel } from "@/types";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { pollForReview } from "@/lib/genlayer/sdk";

const DECISION_COLOR: Record<Decision, string> = {
  verified: "#0F5E4A",
  caution: "#7A4E00",
  high_risk: "#B45A2B",
  reject: "#9B0345",
};
const DECISION_BG: Record<Decision, string> = {
  verified: "#7AE7C7",
  caution: "#FFD166",
  high_risk: "#FF6B5E",
  reject: "#D90368",
};

const RISK_COPY: Record<DonorRiskLevel, string> = {
  low: "Low donor risk",
  medium: "Medium donor risk",
  high: "High donor risk",
  critical: "Critical donor risk",
};

export default function CampaignTrustReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { connected, sendWrite, address } = useWallet();

  const [c, setC] = useState<Campaign | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [evidence, setEvidence] = useState<SanitisedEvidence | null>(null);
  const [reputation, setReputation] = useState<CreatorReputation | null>(null);
  const [reviewFeeWei, setReviewFeeWei] = useState<bigint | null>(null);
  const [flags, setFlags] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerStage, setTriggerStage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const onChain = await fetchCampaign(id);
        if (cancelled) return;
        if (!onChain) { setNotFoundState(true); return; }
        setC(onChain);
        setLoading(false);

        fetchVerdict(id).then(v => { if (!cancelled) setVerdict(v); }).catch(() => {});
        fetchEvidence(id).then(e => { if (!cancelled) setEvidence(e); }).catch(() => {});
        fetchFlagIdsForCampaign(id).then(f => { if (!cancelled) setFlags(f); }).catch(() => {});
        if (onChain.creator) {
          fetchCreatorReputation(onChain.creator).then(r => { if (!cancelled) setReputation(r); }).catch(() => {});
        }
        fetchProtocolConfig().then(cfg => { if (cfg && !cancelled) setReviewFeeWei(BigInt(cfg.reviewFeeWei || "0")); }).catch(() => {});
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="max-w-7xl mx-auto px-6 py-20 text-center text-slate case-stamp">Loading trust report…</div>;
  if (notFoundState || !c) return notFound();

  const isCreator = !!(connected && address && address.toLowerCase() === c.creator.toLowerCase());
  const isReadyForReview = c.status === "READY_FOR_REVIEW";
  const canCancel = isCreator && !["UNDER_REVIEW", "REVIEWED", "APPEALED", "APPEAL_REVIEWED"].includes(c.status);

  async function onTriggerReview() {
    if (!sendWrite) return;
    setError("");
    setTriggering(true);
    try {
      setTriggerStage("Paying review fee and submitting trigger_review…");
      const fee = reviewFeeWei ?? BigInt(10_000_000_000_000_000); // 0.01 GEN fallback
      await triggerReview(sendWrite, c!.id, fee, {
        onHash: h => setTriggerStage(`Tx broadcast — awaiting consensus… ${h.slice(0, 10)}…`),
      });
      setTriggerStage("Polling for verdict…");
      const v = await pollForReview(() => fetchVerdict(c!.id), { intervalMs: 5000, timeoutMs: 300_000 });
      if (v) setVerdict(v);
      const fresh = await fetchCampaign(c!.id);
      if (fresh) setC(fresh);
    } catch (err) {
      setError(explainContractError(err));
    } finally {
      setTriggering(false);
      setTriggerStage("");
    }
  }

  async function onCancel() {
    if (!sendWrite) return;
    setError("");
    try {
      await cancelCampaign(sendWrite, c!.id);
      const fresh = await fetchCampaign(c!.id);
      if (fresh) setC(fresh);
    } catch (err) {
      setError(explainContractError(err));
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <div className="case-stamp text-slate">
        <Link href="/campaigns" className="hover:underline">Trust reports</Link> / {c.id}
        <span className="ml-2 text-evidence">· On-chain</span>
      </div>

      <header className="paper-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="case-stamp text-slate">{c.id} · {c.category} · {c.regionSummary}</div>
            <h1 className="font-serif-display text-4xl mt-1">{c.title}</h1>
            <div className="mt-2 text-sm text-deeptext/80">Beneficiary · {c.beneficiarySummary}</div>
          </div>
          <span className="case-stamp px-2 py-1 rounded border border-mist text-slate">{c.status.replace(/_/g, " ")}</span>
        </div>
        <div className="grid md:grid-cols-4 gap-3 mt-6">
          <MonoStat label="Funding goal" value={`$${c.fundingGoal.toLocaleString()}`} />
          <MonoStat label="Creator" value={shortAddress(c.creator)} />
          <MonoStat label="Schema" value={c.schemaVersion ?? "—"} />
          <MonoStat label="Created" value={c.createdAt ? formatDate(c.createdAt) : "—"} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {isReadyForReview && (
            <button
              onClick={onTriggerReview}
              disabled={triggering || !connected}
              className="bg-coral text-cloud px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60"
            >
              {triggering ? (triggerStage || "Triggering…") : `Trigger GenLayer review · ${weiLabel(reviewFeeWei)}`}
            </button>
          )}
          {connected && (
            <Link href={`/campaigns/${c.id}/flag`} className="border border-mist text-deeptext px-4 py-2 rounded-md text-sm hover:border-raspberry hover:text-raspberry">
              Flag campaign
            </Link>
          )}
          {canCancel && (
            <button onClick={onCancel} className="border border-raspberry text-raspberry px-4 py-2 rounded-md text-sm">
              Cancel campaign
            </button>
          )}
        </div>
        {error && <div className="mt-4 border border-raspberry/30 bg-raspberry/10 text-raspberry rounded-md p-3 text-sm">{error}</div>}
      </header>

      {verdict ? (
        <VerdictPanel verdict={verdict} />
      ) : (
        <PaperCard eyebrow="Consensus review" title={c.status === "READY_FOR_REVIEW" ? "Ready for GenLayer review" : "Awaiting GenLayer consensus"}>
          <p className="text-deeptext/80">
            {c.status === "READY_FOR_REVIEW"
              ? "Anyone can pay the review fee and trigger consensus review. The caller does not control the verdict — GenLayer validators do."
              : "A verdict will appear here once a review is triggered and consensus is reached."}
          </p>
        </PaperCard>
      )}

      <PaperCard eyebrow="Campaign story" title="What is happening">
        <p className="text-deeptext/90 leading-relaxed whitespace-pre-line">{c.story}</p>
        <div className="grid md:grid-cols-2 gap-4 mt-5">
          <div><div className="case-stamp text-slate">Timeline</div><p className="text-sm mt-1">{c.timeline}</p></div>
          <div><div className="case-stamp text-slate">Beneficiary summary</div><p className="text-sm mt-1">{c.beneficiarySummary}</p></div>
        </div>
      </PaperCard>

      <PaperCard eyebrow="Use of funds" title="Breakdown">
        {c.useOfFunds.length === 0
          ? <p className="text-slate text-sm">No breakdown provided.</p>
          : <ul className="divide-y divide-mist">
              {c.useOfFunds.map((u, i) => (
                <li key={i} className="py-3 flex items-center justify-between gap-4">
                  <span>{u.item}</span>
                  <span className="font-mono">${u.amount.toLocaleString()}</span>
                </li>
              ))}
            </ul>
        }
      </PaperCard>

      <PaperCard eyebrow="Sanitised evidence" title="What's been disclosed">
        {evidence ? (
          <div className="space-y-3 text-sm">
            <div><div className="case-stamp text-slate">Summary</div><p className="mt-1">{evidence.evidenceSummary}</p></div>
            <div className="grid md:grid-cols-2 gap-3">
              <div><div className="case-stamp text-slate">Proof type</div><p className="mt-1">{evidence.proofType}</p></div>
              <div><div className="case-stamp text-slate">Beneficiary relationship</div><p className="mt-1">{evidence.beneficiaryRelationship ?? "—"}</p></div>
              <div><div className="case-stamp text-slate">Third-party verification</div><p className="mt-1">{evidence.thirdPartyVerification ?? "—"}</p></div>
              <div><div className="case-stamp text-slate">Social proof</div><p className="mt-1">{evidence.socialProofSummary ?? "—"}</p></div>
            </div>
            <div><div className="case-stamp text-slate">Redaction statement</div><p className="mt-1">{evidence.redactionStatement}</p></div>
            {evidence.documentHash && (
              <div className="font-mono text-xs text-slate break-all">Doc hash · {evidence.documentHash}</div>
            )}
          </div>
        ) : (
          <p className="text-slate text-sm">No sanitised evidence has been revealed yet.</p>
        )}
      </PaperCard>

      {c.publicProofLinks.length > 0 && (
        <PaperCard eyebrow="Public proof links" title="Independent corroboration">
          <ul className="space-y-2">
            {c.publicProofLinks.map((l, i) => (
              <li key={i} className="text-sm font-mono break-all">
                <a href={l} target="_blank" rel="noreferrer" className="text-evidence">{l}</a>
              </li>
            ))}
          </ul>
        </PaperCard>
      )}

      {reputation && (
        <PaperCard eyebrow="Creator reputation" title="On-chain track record">
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
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-slate font-mono break-all">Creator · {c.creator}</p>
            <Link href={`/creators/${c.creator}`} className="text-evidence text-sm hover:underline">View creator profile →</Link>
          </div>
        </PaperCard>
      )}

      <PaperCard eyebrow="Public signal" title="Flags filed against this campaign">
        {flags.length === 0
          ? <p className="text-slate text-sm">No flags filed.</p>
          : <p className="text-sm text-deeptext/85">{flags.length} flag{flags.length === 1 ? "" : "s"} on file. Flags are public signals only — they do not change the GenLayer verdict.</p>
        }
        {connected && (
          <div className="mt-3">
            <Link href={`/campaigns/${c.id}/flag`} className="text-raspberry text-sm hover:underline">File a flag →</Link>
          </div>
        )}
      </PaperCard>

      <p className="text-xs text-slate text-center">
        Judgix provides decentralised evidence review, not a legal guarantee. There are no donation actions in V1.
      </p>
    </div>
  );
}

function VerdictPanel({ verdict }: { verdict: Verdict }) {
  const color = DECISION_COLOR[verdict.decision];
  const bg = DECISION_BG[verdict.decision];
  return (
    <div className="paper-card overflow-hidden">
      <div className="bg-plum text-cloud p-6">
        <div className="case-stamp text-cyan">GenLayer consensus verdict</div>
        <div className="flex items-start justify-between mt-2 gap-4">
          <h2 className="font-serif-display text-3xl uppercase">{verdict.decision.replace(/_/g, " ")}</h2>
          <div className="text-right">
            <div className="case-stamp text-cyan">Authenticity</div>
            <div className="font-mono text-4xl" style={{ color }}>
              {verdict.authenticityScore}<span className="text-cloud/60 text-xl">/100</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="case-stamp px-2 py-0.5 rounded" style={{ background: bg, color }}>{verdict.recommendedDonorAction.replace(/_/g, " ")}</span>
          <span className="case-stamp text-cyan">{RISK_COPY[verdict.donorRiskLevel]}</span>
          <span className="case-stamp text-cyan">Confidence · {verdict.confidence}%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-mist border-b border-mist">
        <Cell label="Evidence strength" value={`${verdict.evidenceStrength}/100`} />
        <Cell label="Donor risk" value={verdict.donorRiskLevel.toUpperCase()} />
        <Cell label="Decision" value={verdict.decision.toUpperCase()} />
        <Cell label="Recommended action" value={verdict.recommendedDonorAction.replace(/_/g, " ").toUpperCase()} />
      </div>

      <div className="p-6 space-y-4">
        {verdict.reasoning.length > 0 && (
          <div>
            <div className="case-stamp text-slate">Reasoning</div>
            <ul className="mt-1 space-y-2 text-sm">
              {verdict.reasoning.map((r, i) => (
                <li key={i} className="flex gap-2"><span className="text-evidence">●</span><span>{r}</span></li>
              ))}
            </ul>
          </div>
        )}
        {verdict.riskFlags.length > 0 && (
          <div>
            <div className="case-stamp text-raspberry">Risk flags</div>
            <ul className="mt-1 space-y-2 text-sm">
              {verdict.riskFlags.map((r, i) => (
                <li key={i} className="flex gap-2"><span className="text-raspberry">●</span><span>{r}</span></li>
              ))}
            </ul>
          </div>
        )}
        {verdict.requiredImprovements.length > 0 && (
          <div>
            <div className="case-stamp text-slate">Required improvements</div>
            <ul className="mt-1 space-y-2 text-sm">
              {verdict.requiredImprovements.map((r, i) => (
                <li key={i} className="flex gap-2"><span className="text-coral">●</span><span>{r}</span></li>
              ))}
            </ul>
          </div>
        )}
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

function weiLabel(wei: bigint | null): string {
  if (!wei) return "0.01 GEN";
  const gen = Number(wei) / 1e18;
  return `${gen.toFixed(gen >= 0.01 ? 2 : 4)} GEN`;
}
