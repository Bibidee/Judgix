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
  TxHashTimeoutError,
} from "@/lib/genlayer/contract";
import { Campaign, Verdict, SanitisedEvidence, CreatorReputation, Decision, DonorRiskLevel } from "@/types";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { pollForReview } from "@/lib/genlayer/sdk";

// States the Trigger Review action moves through. The UI message is derived
// from this so we never hard-error on a tx that may still be in flight.
type ReviewTxState =
  | "IDLE"
  | "SIGNING"
  | "BROADCASTING"
  | "TX_HASH_RECEIVED"
  | "TX_MAY_HAVE_SUBMITTED"
  | "WAITING_FOR_CONSENSUS"
  | "REVIEWED"
  | "CONSENSUS_TIMEOUT"
  | "FAILED";

const TX_STATE_MESSAGES: Record<ReviewTxState, string> = {
  IDLE: "",
  SIGNING: "Confirm the transaction in your wallet…",
  BROADCASTING: "Broadcasting trigger_review to the Studio Network…",
  TX_HASH_RECEIVED: "Transaction submitted. Waiting for GenLayer validators to finalize the review.",
  TX_MAY_HAVE_SUBMITTED: "We could not read the transaction hash yet. The transaction may still have been submitted. Checking on-chain status…",
  WAITING_FOR_CONSENSUS: "Review is on-chain and waiting for GenLayer consensus.",
  REVIEWED: "GenLayer review finalized.",
  CONSENSUS_TIMEOUT: "The review transaction may still be processing. Check the explorer or refresh later.",
  FAILED: "",
};

const TERMINAL_REVIEWED = (s: string) => s === "REVIEWED" || s === "APPEAL_REVIEWED";
const IS_UNDER_REVIEW = (s: string) => s === "UNDER_REVIEW";

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
  const [reviewState, setReviewState] = useState<ReviewTxState>("IDLE");
  const [reviewTxHash, setReviewTxHash] = useState<string | null>(null);
  const [error, setError] = useState("");

  const triggering = reviewState !== "IDLE"
    && reviewState !== "REVIEWED"
    && reviewState !== "CONSENSUS_TIMEOUT"
    && reviewState !== "FAILED";

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
  const reviewAlreadyInFlight = IS_UNDER_REVIEW(c.status) || TERMINAL_REVIEWED(c.status);
  const canCancel = isCreator && !["UNDER_REVIEW", "REVIEWED", "APPEALED", "APPEAL_REVIEWED"].includes(c.status);
  const reviewStatusMsg = TX_STATE_MESSAGES[reviewState];

  async function onTriggerReview() {
    if (!sendWrite || !c) return;
    setError("");

    // Pre-flight: never pay another review fee for a campaign that is
    // already past the trigger phase.
    try {
      const preflight = await fetchCampaign(c.id);
      if (preflight) {
        if (preflight.status && (TERMINAL_REVIEWED(preflight.status) || IS_UNDER_REVIEW(preflight.status))) {
          setC(preflight);
          const v = await fetchVerdict(c.id).catch(() => null);
          if (v) setVerdict(v);
          setError("Review already submitted. Waiting for GenLayer consensus.");
          return;
        }
      }
    } catch {/* noop */}

    setReviewState("SIGNING");

    let sawHash = false;

    try {
      const fee = reviewFeeWei ?? BigInt(10_000_000_000_000_000); // 0.01 GEN fallback

      // Slight UX cue: after a beat we're broadcasting, not just signing.
      const broadcastingTimer = setTimeout(() => setReviewState(s => s === "SIGNING" ? "BROADCASTING" : s), 1500);

      try {
        await triggerReview(sendWrite, c.id, fee, {
          onHash: h => {
            sawHash = true;
            console.log("[Judgix /campaigns trigger_review] tx hash", h);
            setReviewTxHash(h);
            setReviewState("TX_HASH_RECEIVED");
          },
        });
      } finally {
        clearTimeout(broadcastingTimer);
      }

      // If onHash never fired but writeContract returned cleanly, we still
      // count it as submitted.
      if (!sawHash) {
        setReviewState("TX_MAY_HAVE_SUBMITTED");
      }
    } catch (err) {
      if (err instanceof TxHashTimeoutError) {
        // Common case: the wallet client took >30s to surface a hash but the
        // tx may already be on-chain. Don't show "wallet never broadcast" —
        // fall back to status polling.
        console.warn("[Judgix /campaigns trigger_review] no hash in 30s — checking on-chain status");
        setReviewState("TX_MAY_HAVE_SUBMITTED");
      } else {
        const friendly = explainContractError(err);
        console.error("[Judgix /campaigns trigger_review] failed", err);
        setError(friendly);
        setReviewState("FAILED");
        return;
      }
    }

    // Verify on-chain that the tx made it. If status flips from
    // READY_FOR_REVIEW → UNDER_REVIEW / REVIEWED, the submission succeeded.
    setReviewState(s => s === "REVIEWED" ? s : "WAITING_FOR_CONSENSUS");
    try {
      const reviewed = await pollForReview(
        async () => {
          const fresh = await fetchCampaign(c.id).catch(() => null);
          if (!fresh) return null;
          if (fresh.status !== c.status) setC(fresh);
          if (TERMINAL_REVIEWED(fresh.status)) {
            const v = await fetchVerdict(c.id).catch(() => null);
            if (v) { setVerdict(v); return v; }
          }
          return null;
        },
        { intervalMs: 10_000, timeoutMs: 900_000 }, // up to 15 minutes
      );
      if (reviewed) {
        setReviewState("REVIEWED");
        return;
      }
      // Fallback: still no verdict but maybe consensus is mid-flight. We're
      // done blocking — user can wait or refresh.
      setReviewState("CONSENSUS_TIMEOUT");
    } catch (err) {
      setError(explainContractError(err));
      setReviewState("FAILED");
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
          <MonoStat label="Funding goal" value={`${c.currency} ${c.fundingGoal.toLocaleString()}`} />
          <MonoStat label="Creator" value={shortAddress(c.creator)} />
          <MonoStat label="Schema" value={c.schemaVersion ?? "—"} />
          <MonoStat label="Created" value={c.createdAt ? formatDate(c.createdAt) : "—"} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {isReadyForReview && !reviewAlreadyInFlight && (
            <button
              onClick={onTriggerReview}
              disabled={triggering || !connected}
              className="bg-coral text-cloud px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60"
            >
              {triggering
                ? (reviewState === "SIGNING" ? "Confirm in wallet…"
                  : reviewState === "BROADCASTING" ? "Broadcasting…"
                  : reviewState === "TX_HASH_RECEIVED" ? "Submitted · waiting for consensus…"
                  : reviewState === "TX_MAY_HAVE_SUBMITTED" ? "Checking on-chain status…"
                  : reviewState === "WAITING_FOR_CONSENSUS" ? "Waiting for consensus…"
                  : "Working…")
                : `Trigger GenLayer review · ${weiLabel(reviewFeeWei)}`}
            </button>
          )}
          {reviewAlreadyInFlight && (
            <span className="case-stamp text-evidence border border-evidence/40 px-3 py-2 rounded-md">
              {IS_UNDER_REVIEW(c.status) ? "Awaiting GenLayer consensus" : "Reviewed"}
            </span>
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

        {triggering && reviewStatusMsg && (
          <div className="mt-4 border border-cyan/40 bg-cyan/10 text-deeptext rounded-md p-3 text-sm">
            <div className="case-stamp text-evidence">{reviewState.replace(/_/g, " ")}</div>
            <p className="mt-1">{reviewStatusMsg}</p>
            {reviewTxHash && (
              <div className="font-mono text-xs text-slate mt-1 break-all">
                tx · <a href={`https://explorer-studio.genlayer.com/tx/${reviewTxHash}`} target="_blank" rel="noreferrer" className="text-evidence hover:underline">{reviewTxHash}</a>
              </div>
            )}
          </div>
        )}

        {reviewState === "REVIEWED" && (
          <div className="mt-4 border border-mint/50 bg-mint/20 text-deeptext rounded-md p-3 text-sm">
            <div className="case-stamp text-[#0F5E4A]">REVIEWED</div>
            <p className="mt-1">{TX_STATE_MESSAGES.REVIEWED}</p>
          </div>
        )}

        {reviewState === "CONSENSUS_TIMEOUT" && (
          <div className="mt-4 border border-apricot bg-apricot/10 text-deeptext rounded-md p-3 text-sm">
            <div className="case-stamp text-[#7A4E00]">PROCESSING</div>
            <p className="mt-1">{TX_STATE_MESSAGES.CONSENSUS_TIMEOUT}</p>
            {reviewTxHash && (
              <div className="font-mono text-xs text-slate mt-1 break-all">
                tx · <a href={`https://explorer-studio.genlayer.com/tx/${reviewTxHash}`} target="_blank" rel="noreferrer" className="text-evidence hover:underline">{reviewTxHash}</a>
              </div>
            )}
          </div>
        )}

        {error && <div className="mt-4 border border-raspberry/30 bg-raspberry/10 text-raspberry rounded-md p-3 text-sm whitespace-pre-wrap">{error}</div>}
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
                  <span className="font-mono">{c.currency} {u.amount.toLocaleString()}</span>
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
