"use client";

import type { Account, Address } from "viem";
import {
  JUDGIX_CONTRACT_ADDRESS,
  getClientForAccount,
  getReadOnlyClient,
} from "./sdk";
import { Campaign, CampaignReview, CampaignUpdate, Dispute, UpdateReview, DisputeReview } from "@/types";
import { clampScore } from "@/lib/scoring";

type AnyJson = Record<string, any>;

function parse<T = AnyJson>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw !== "string") {
    try { return raw as T; } catch { return null; }
  }
  if (raw === "") return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

async function readView(functionName: string, args: any[] = []): Promise<string> {
  const client = getReadOnlyClient();
  const res = await client.readContract({
    address: JUDGIX_CONTRACT_ADDRESS,
    functionName,
    args,
  });
  return typeof res === "string" ? res : (res == null ? "" : JSON.stringify(res));
}

type WriteOpts = { onHash?: (hash: string) => void; awaitReceipt?: boolean };

async function writeMethod(
  account: Account,
  functionName: string,
  args: any[] = [],
  opts: WriteOpts = {},
): Promise<{ hash: string; receipt: any | null }> {
  const client = getClientForAccount(account);
  const hash = await client.writeContract({
    address: JUDGIX_CONTRACT_ADDRESS,
    functionName,
    args,
    value: BigInt(0),
  });
  opts.onHash?.(hash);

  let receipt: any = null;
  if (opts.awaitReceipt !== false) {
    try {
      receipt = await client.waitForTransactionReceipt({ hash });
    } catch (err) {
      // genlayer-js can throw a calldata decoder error while parsing the receipt
      // even when the transaction itself was committed on-chain. The hash is the
      // source of truth — callers (e.g. submit / update / flag pages) confirm
      // success by polling contract state. Swallow the decode error here.
      const msg = String((err as any)?.message || err);
      if (!/out of bounds|position|invalid (utf-8|byte)|unexpected end/i.test(msg)) {
        throw err;
      }
      // best-effort status read; ignore failures
      receipt = null;
    }
  }
  return { hash, receipt };
}

// ----- Reads -----

export async function fetchCampaign(campaignId: string): Promise<Campaign | null> {
  const raw = await readView("get_campaign", [campaignId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return campaignFromJson(campaignId, obj);
}

export async function fetchCampaignReview(campaignId: string): Promise<CampaignReview | null> {
  const raw = await readView("get_campaign_review", [campaignId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return reviewFromJson(campaignId, obj);
}

export async function fetchUpdate(updateId: string): Promise<CampaignUpdate | null> {
  const raw = await readView("get_update", [updateId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return updateFromJson(updateId, obj);
}

export async function fetchUpdateReview(updateId: string): Promise<UpdateReview | null> {
  const raw = await readView("get_update_review", [updateId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return updateReviewFromJson(obj);
}

export async function fetchDispute(disputeId: string): Promise<Dispute | null> {
  const raw = await readView("get_dispute", [disputeId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return disputeFromJson(disputeId, obj);
}

export async function fetchDisputeReview(disputeId: string): Promise<DisputeReview | null> {
  const raw = await readView("get_dispute_review", [disputeId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return disputeReviewFromJson(obj);
}

export async function fetchCreatorCampaigns(creator: string): Promise<string[]> {
  const raw = await readView("get_creator_campaigns", [creator]);
  const arr = parse<string[]>(raw);
  return Array.isArray(arr) ? arr : [];
}

export async function fetchProtocolStats(): Promise<AnyJson> {
  const raw = await readView("get_protocol_stats");
  return parse<AnyJson>(raw) ?? {};
}

export async function fetchCampaignIds(offset = 0, limit = 200): Promise<string[]> {
  try {
    const raw = await readView("list_campaigns", [String(offset), String(limit)]);
    const arr = parse<string[]>(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function fetchUpdateIdsForCampaign(campaignId: string): Promise<string[]> {
  try {
    const raw = await readView("get_updates_for_campaign", [campaignId]);
    const arr = parse<string[]>(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export async function fetchDisputeIdsForCampaign(campaignId: string): Promise<string[]> {
  try {
    const raw = await readView("get_disputes_for_campaign", [campaignId]);
    const arr = parse<string[]>(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export async function fetchUpdatesForCampaign(campaignId: string) {
  const ids = await fetchUpdateIdsForCampaign(campaignId);
  const results = await Promise.all(
    ids.map(async (id) => {
      const [u, r] = await Promise.all([
        fetchUpdate(id).catch(() => null),
        fetchUpdateReview(id).catch(() => null),
      ]);
      return u ? { ...u, review: r ?? undefined } : null;
    }),
  );
  return results.filter(Boolean) as any[];
}

export async function fetchDisputesForCampaign(campaignId: string) {
  const ids = await fetchDisputeIdsForCampaign(campaignId);
  const results = await Promise.all(
    ids.map(async (id) => {
      const [d, r] = await Promise.all([
        fetchDispute(id).catch(() => null),
        fetchDisputeReview(id).catch(() => null),
      ]);
      return d ? { ...d, review: r ?? undefined } : null;
    }),
  );
  return results.filter(Boolean) as any[];
}

export async function fetchCreatorReputation(creator: string): Promise<AnyJson | null> {
  try {
    const raw = await readView("get_creator_reputation", [creator]);
    const obj = parse<AnyJson>(raw);
    return obj && Object.keys(obj).length > 0 ? obj : null;
  } catch { return null; }
}

/** Translate raw contract errors into user-friendly strings. */
export function explainContractError(err: any): string {
  const msg = String(err?.shortMessage || err?.message || err || "");
  const m = msg.match(/UserError[^:]*:\s*([^\n}"]+)/i);
  const inner = (m ? m[1] : msg).trim().replace(/['"`]+$/g, "");

  if (/already exists/i.test(inner)) return "An on-chain record with that id already exists. Try again — a fresh id will be generated.";
  if (/unknown campaign/i.test(inner)) return "This campaign is not on-chain yet. Submit it first.";
  if (/unknown update/i.test(inner)) return "This update is not on-chain yet.";
  if (/unknown dispute/i.test(inner)) return "This dispute is not on-chain yet.";
  if (/already resolved/i.test(inner)) return "This dispute has already been resolved.";
  if (/archived/i.test(inner)) return "Archived campaigns cannot be modified.";
  if (/missing required/i.test(inner)) return `Missing required field — ${inner.replace(/^missing required field:\s*/i, "")}.`;
  if (/insufficient (funds|balance)/i.test(inner)) return "Wallet balance is too low to pay gas. Use the faucet from the wallet popover.";
  if (/owner/i.test(inner) || /unauthor/i.test(inner)) return "Only the contract owner can perform this action.";
  if (/timed out/i.test(inner)) return "Timed out waiting for the verdict. The transaction may still finalize on-chain — refresh in a minute.";
  return inner || "On-chain call failed. Check the wallet has gas and try again.";
}

// ----- Writes -----

export async function createCampaignOnChain(account: Account, campaign: Campaign, opts: WriteOpts = {}) {
  const payload = campaignToContractJson(campaign);
  return writeMethod(account, "create_campaign", [campaign.id, JSON.stringify(payload)], opts);
}

export async function submitCampaignForReviewOnChain(account: Account, campaignId: string, opts: WriteOpts = {}) {
  return writeMethod(account, "submit_campaign_for_review", [campaignId], opts);
}

export async function reviewCampaign(account: Account, campaignId: string, opts: WriteOpts = {}) {
  return writeMethod(account, "review_campaign", [campaignId], opts);
}

export async function submitUpdateOnChain(
  account: Account,
  updateId: string,
  campaignId: string,
  update: AnyJson,
  opts: WriteOpts = {},
) {
  return writeMethod(account, "submit_update", [updateId, campaignId, JSON.stringify(update)], opts);
}

export async function reviewUpdateOnChain(account: Account, updateId: string, opts: WriteOpts = {}) {
  return writeMethod(account, "review_update", [updateId], opts);
}

export async function flagCampaignOnChain(
  account: Account,
  disputeId: string,
  campaignId: string,
  dispute: AnyJson,
  opts: WriteOpts = {},
) {
  return writeMethod(account, "flag_campaign", [disputeId, campaignId, JSON.stringify(dispute)], opts);
}

export async function resolveDisputeOnChain(account: Account, disputeId: string, opts: WriteOpts = {}) {
  return writeMethod(account, "resolve_dispute", [disputeId], opts);
}

// ----- Owner / role -----

let _ownerCache: Address | null = null;
export async function fetchContractOwner(): Promise<Address | null> {
  if (_ownerCache) return _ownerCache;
  try {
    const client = getReadOnlyClient();
    const res = (await client.readContract({
      address: JUDGIX_CONTRACT_ADDRESS,
      functionName: "owner",
      args: [],
    })) as any;
    const addr = (typeof res === "string" ? res : res?.toString?.()) as Address | undefined;
    if (addr) {
      _ownerCache = addr;
      return addr;
    }
  } catch {}
  return null;
}

// ----- Marshalling -----

export function campaignToContractJson(c: Campaign): AnyJson {
  return {
    title: c.title,
    creator: c.creator,
    category: c.category,
    country: c.country,
    funding_goal: c.fundingGoal,
    currency: c.currency,
    beneficiary: c.beneficiary,
    wallet_address: c.walletAddress,
    story: c.story,
    use_of_funds: c.useOfFunds,
    problem_statement: c.problemStatement,
    who_benefits: c.whoBenefits,
    timeline_of_events: c.timelineOfEvents,
    evidence: c.evidence,
    public_signals: c.publicSignals,
    deadline: c.deadline,
  };
}

export function campaignFromJson(id: string, j: AnyJson): Campaign {
  return {
    id,
    creator: j.creator ?? "",
    title: j.title ?? "",
    category: j.category ?? "",
    country: j.country ?? "",
    fundingGoal: String(j.funding_goal ?? j.fundingGoal ?? ""),
    currency: j.currency ?? "USD",
    beneficiary: j.beneficiary ?? "",
    walletAddress: j.wallet_address ?? j.walletAddress ?? "",
    story: j.story ?? "",
    useOfFunds: j.use_of_funds ?? j.useOfFunds ?? "",
    problemStatement: j.problem_statement ?? j.problemStatement ?? "",
    whoBenefits: j.who_benefits ?? j.whoBenefits ?? "",
    timelineOfEvents: j.timeline_of_events ?? j.timelineOfEvents ?? "",
    evidence: Array.isArray(j.evidence) ? j.evidence : [],
    publicSignals: Array.isArray(j.public_signals ?? j.publicSignals) ? (j.public_signals ?? j.publicSignals) : [],
    status: (j.status ?? "DRAFT") as any,
    deadline: j.deadline,
    createdAt: Number(j.created_at ?? j.createdAt ?? 0) * (String(j.created_at ?? "").length === 10 ? 1000 : 1) || Date.now(),
    updatedAt: Number(j.updated_at ?? j.updatedAt ?? 0) || Date.now(),
  };
}

export function reviewFromJson(campaignId: string, j: AnyJson): CampaignReview {
  return {
    id: String(j.review_id ?? j.id ?? `REV-${Date.now()}`),
    campaignId,
    verdict: String(j.verdict ?? "NEEDS_MANUAL_REVIEW"),
    authenticityScore: clampScore(Number(j.authenticity_score ?? 0)),
    riskLevel: (j.risk_level ?? "MEDIUM") as any,
    evidenceQuality: String(j.evidence_quality ?? "NONE"),
    storyConsistency: String(j.story_consistency ?? "WEAK"),
    publicSignalStrength: String(j.public_signal_strength ?? "NONE"),
    plagiarismRisk: String(j.plagiarism_risk ?? "LOW"),
    fundingGoalRealism: String(j.funding_goal_realism ?? "QUESTIONABLE"),
    redFlags: Array.isArray(j.red_flags) ? j.red_flags.map(String) : [],
    positiveSignals: Array.isArray(j.positive_signals) ? j.positive_signals.map(String) : [],
    recommendedAction: String(j.recommended_action ?? ""),
    reasoningSummary: String(j.reasoning_summary ?? ""),
    createdAt: Number(j.created_at ?? Date.now()),
    reviewTxHash: j.tx_hash,
    confidence: j.confidence ?? "MODERATE",
  };
}

export function updateFromJson(id: string, j: AnyJson): CampaignUpdate {
  return {
    id,
    campaignId: j.campaign_id ?? "",
    title: j.title ?? "",
    body: j.body ?? "",
    amountSpent: String(j.amount_spent ?? ""),
    evidenceLinks: Array.isArray(j.evidence_links) ? j.evidence_links : [],
    fundUsageExplanation: j.fund_usage_explanation ?? "",
    nextSteps: j.next_steps ?? "",
    createdAt: Number(j.created_at ?? Date.now()),
  };
}

export function updateReviewFromJson(j: AnyJson): UpdateReview {
  return {
    verdict: String(j.verdict ?? "UPDATE_NEEDS_MORE_EVIDENCE"),
    trustDelta: Number(j.trust_delta ?? 0),
    riskDelta: Number(j.risk_delta ?? 0),
    spendingAlignment: String(j.spending_alignment ?? "NONE"),
    evidenceQuality: String(j.evidence_quality ?? "NONE"),
    concerns: Array.isArray(j.concerns) ? j.concerns : [],
    positiveSignals: Array.isArray(j.positive_signals) ? j.positive_signals : [],
    reasoningSummary: String(j.reasoning_summary ?? ""),
    createdAt: Number(j.created_at ?? Date.now()),
  };
}

export function disputeFromJson(id: string, j: AnyJson): Dispute {
  return {
    id,
    campaignId: j.campaign_id ?? "",
    reporter: j.reporter ?? "",
    reason: j.reason ?? "",
    description: j.description ?? "",
    evidence: j.evidence ?? "",
    severity: (j.severity ?? "MEDIUM") as any,
    createdAt: Number(j.created_at ?? Date.now()),
  };
}

export function disputeReviewFromJson(j: AnyJson): DisputeReview {
  return {
    verdict: String(j.verdict ?? "INSUFFICIENT_EVIDENCE"),
    campaignAction: String(j.campaign_action ?? "NO_ACTION"),
    trustDelta: Number(j.trust_delta ?? 0),
    riskDelta: Number(j.risk_delta ?? 0),
    confirmedIssues: Array.isArray(j.confirmed_issues) ? j.confirmed_issues : [],
    unconfirmedIssues: Array.isArray(j.unconfirmed_issues) ? j.unconfirmed_issues : [],
    reasoningSummary: String(j.reasoning_summary ?? ""),
    createdAt: Number(j.created_at ?? Date.now()),
  };
}
