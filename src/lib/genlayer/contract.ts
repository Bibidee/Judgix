"use client";

import {
  JUDGIX_CONTRACT_ADDRESS,
  getReadOnlyClient,
} from "./sdk";
import type { SendWrite } from "@/lib/wallet/privyWriteClient";
import type {
  Campaign,
  Verdict,
  SanitisedEvidence,
  Flag,
  Appeal,
  AppealVerdict,
  CreatorReputation,
  ProtocolStats,
  ProtocolConfig,
} from "@/types";

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

type WriteOpts = { onHash?: (hash: string) => void; value?: bigint; broadcastTimeoutMs?: number };

class TxTimeoutError extends Error {
  constructor(public functionName: string, public timeoutMs: number) {
    super(
      `[Judgix] ${functionName} did not return a tx hash within ${timeoutMs}ms. ` +
      `The wallet never broadcast. Check the browser console for "[Judgix privyWriteClient]" logs.`,
    );
    this.name = "TxTimeoutError";
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(onTimeout()), ms);
    p.then(v => { clearTimeout(t); resolve(v); },
           e => { clearTimeout(t); reject(e); });
  });
}

async function writeMethod(
  sendWrite: SendWrite | null,
  functionName: string,
  args: any[] = [],
  opts: WriteOpts = {},
): Promise<{ hash: string }> {
  const debug = (...parts: any[]) =>
    console.log("[Judgix] write", functionName, ...parts);

  if (!sendWrite) {
    throw new Error(`[Judgix] ${functionName} aborted — Privy sendWrite is not ready. Sign in and wait for the embedded wallet to provision.`);
  }
  if (!JUDGIX_CONTRACT_ADDRESS) {
    throw new Error(`[Judgix] ${functionName} aborted — NEXT_PUBLIC_JUDGIX_ADDRESS is empty.`);
  }

  debug("preflight", { address: JUDGIX_CONTRACT_ADDRESS, args, value: (opts.value ?? 0n).toString() });

  const broadcastMs = opts.broadcastTimeoutMs ?? 30_000;

  let hash: string;
  try {
    const { hash: h } = await withTimeout(
      sendWrite(functionName, args, { value: opts.value ?? 0n }),
      broadcastMs,
      () => new TxTimeoutError(functionName, broadcastMs),
    );
    hash = h;
  } catch (err) {
    debug("send REJECTED", err);
    throw err;
  }

  debug("hash received", hash);
  opts.onHash?.(hash);
  return { hash };
}

// ---------------- Reads ----------------

export async function fetchProtocolStats(): Promise<ProtocolStats | null> {
  const raw = await readView("get_protocol_stats");
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return {
    campaigns: Number(obj.campaigns ?? obj.campaign_count ?? 0),
    reviews: Number(obj.reviews ?? obj.review_count ?? 0),
    appeals: Number(obj.appeals ?? obj.appeal_count ?? 0),
    flags: Number(obj.flags ?? obj.flag_count ?? 0),
  };
}

export async function fetchProtocolConfig(): Promise<ProtocolConfig | null> {
  const raw = await readView("get_config");
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return {
    paused: !!obj.paused,
    keeper: String(obj.keeper ?? ""),
    evidenceSchemaVersion: String(obj.evidence_schema_version ?? obj.schema_version ?? ""),
    reviewFeeWei: String(obj.review_fee_wei ?? "0"),
    protocolFeesWei: String(obj.protocol_fees_wei ?? "0"),
  };
}

export async function fetchCampaignIds(offset = 0, limit = 200): Promise<string[]> {
  try {
    const raw = await readView("list_campaigns", [String(offset), String(limit)]);
    const arr = parse<string[]>(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export async function fetchReviewedCampaignIds(): Promise<string[]> {
  try {
    const raw = await readView("get_reviewed_campaigns");
    const arr = parse<string[]>(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export async function fetchCampaign(campaignId: string): Promise<Campaign | null> {
  const raw = await readView("get_campaign", [campaignId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return campaignFromJson(campaignId, obj);
}

export async function fetchVerdict(campaignId: string): Promise<Verdict | null> {
  const raw = await readView("get_verdict", [campaignId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return verdictFromJson(campaignId, obj);
}

export async function fetchEvidence(campaignId: string): Promise<SanitisedEvidence | null> {
  const raw = await readView("get_evidence", [campaignId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return {
    campaignId,
    evidenceSummary: String(obj.evidence_summary ?? ""),
    proofType: String(obj.proof_type ?? ""),
    documentHash: obj.document_hash ? String(obj.document_hash) : undefined,
    thirdPartyVerification: obj.third_party_verification ? String(obj.third_party_verification) : undefined,
    socialProofSummary: obj.social_proof_summary ? String(obj.social_proof_summary) : undefined,
    beneficiaryRelationship: obj.beneficiary_relationship ? String(obj.beneficiary_relationship) : undefined,
    redactionStatement: String(obj.redaction_statement ?? ""),
    schemaVersion: obj.schema_version,
    revealedAt: obj.revealed_at,
  };
}

export async function fetchFlagIdsForCampaign(campaignId: string): Promise<string[]> {
  try {
    const raw = await readView("get_flags_for_campaign", [campaignId]);
    const arr = parse<string[]>(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export async function fetchFlag(flagId: string): Promise<Flag | null> {
  const raw = await readView("get_flag", [flagId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return {
    id: flagId,
    campaignId: String(obj.campaign_id ?? ""),
    reporter: String(obj.reporter ?? ""),
    reason: String(obj.reason ?? ""),
    createdAt: obj.created_at,
  };
}

export async function fetchAppealIdsForCampaign(campaignId: string): Promise<string[]> {
  try {
    const raw = await readView("get_appeals_for_campaign", [campaignId]);
    const arr = parse<string[]>(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export async function fetchAppeal(appealId: string): Promise<Appeal | null> {
  const raw = await readView("get_appeal", [appealId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return {
    id: appealId,
    campaignId: String(obj.campaign_id ?? ""),
    creator: String(obj.creator ?? ""),
    reason: String(obj.appeal_reason ?? obj.reason ?? ""),
    status: (obj.status ?? "APPEALED") as any,
    createdAt: obj.created_at,
  };
}

export async function fetchAppealVerdict(appealId: string): Promise<AppealVerdict | null> {
  const raw = await readView("get_appeal_verdict", [appealId]);
  const obj = parse<AnyJson>(raw);
  if (!obj) return null;
  return {
    appealId,
    appealDecision: (obj.appeal_decision ?? "insufficient_new_evidence") as any,
    newAuthenticityScore: Number(obj.new_authenticity_score ?? 0),
    newEvidenceStrength: Number(obj.new_evidence_strength ?? 0),
    newDonorRiskLevel: (obj.new_donor_risk_level ?? "medium") as any,
    newRecommendedDonorAction: (obj.new_recommended_donor_action ?? "wait_for_more_evidence") as any,
    confidence: Number(obj.confidence ?? 0),
    reasoning: Array.isArray(obj.reasoning) ? obj.reasoning.map(String) : [],
    changedFields: Array.isArray(obj.changed_fields) ? obj.changed_fields.map(String) : [],
    reviewedAt: obj.reviewed_at,
  };
}

export async function fetchCreatorCampaigns(creator: string): Promise<string[]> {
  const raw = await readView("get_creator_campaigns", [creator]);
  const arr = parse<string[]>(raw);
  return Array.isArray(arr) ? arr : [];
}

export async function fetchCreatorReputation(creator: string): Promise<CreatorReputation | null> {
  const raw = await readView("get_creator_reputation", [creator]);
  const obj = parse<AnyJson>(raw);
  if (!obj || Object.keys(obj).length === 0) return null;
  return {
    creator: String(obj.creator ?? creator),
    totalCampaigns: Number(obj.total_campaigns ?? 0),
    reviewedCampaigns: Number(obj.reviewed_campaigns ?? 0),
    verifiedCount: Number(obj.verified_count ?? 0),
    cautionCount: Number(obj.caution_count ?? 0),
    highRiskCount: Number(obj.high_risk_count ?? 0),
    rejectedCount: Number(obj.rejected_count ?? 0),
    averageAuthenticityScore: Number(obj.average_authenticity_score ?? 0),
    averageEvidenceStrength: Number(obj.average_evidence_strength ?? 0),
    lastDecision: String(obj.last_decision ?? ""),
    lastDonorRiskLevel: String(obj.last_donor_risk_level ?? ""),
    appealCount: Number(obj.appeal_count ?? 0),
    flagCount: Number(obj.flag_count ?? 0),
  };
}

// ---------------- Writes ----------------

export async function createCampaign(send: SendWrite | null, campaignId: string, payload: AnyJson, opts: WriteOpts = {}) {
  return writeMethod(send, "create_campaign", [campaignId, JSON.stringify(payload)], opts);
}

export async function commitEvidence(send: SendWrite | null, campaignId: string, evidenceHash: string, opts: WriteOpts = {}) {
  return writeMethod(send, "commit_evidence", [campaignId, evidenceHash], opts);
}

export async function submitSanitisedEvidence(send: SendWrite | null, campaignId: string, evidence: AnyJson, opts: WriteOpts = {}) {
  return writeMethod(send, "submit_sanitised_evidence", [campaignId, JSON.stringify(evidence)], opts);
}

export async function revealEvidence(send: SendWrite | null, campaignId: string, evidence: AnyJson, salt: string, opts: WriteOpts = {}) {
  return writeMethod(send, "reveal_evidence", [campaignId, JSON.stringify(evidence), salt], opts);
}

export async function cancelCampaign(send: SendWrite | null, campaignId: string, opts: WriteOpts = {}) {
  return writeMethod(send, "cancel_campaign", [campaignId], opts);
}

export async function triggerReview(send: SendWrite | null, campaignId: string, feeWei: bigint, opts: Omit<WriteOpts, "value"> = {}) {
  return writeMethod(send, "trigger_review", [campaignId], { ...opts, value: feeWei });
}

export async function flagCampaign(send: SendWrite | null, campaignId: string, reason: string, opts: WriteOpts = {}) {
  const flag = { reason };
  return writeMethod(send, "flag_campaign", [campaignId, JSON.stringify(flag)], opts);
}

export async function submitAppeal(send: SendWrite | null, campaignId: string, appealId: string, reason: string, opts: WriteOpts = {}) {
  return writeMethod(send, "submit_appeal", [campaignId, appealId, reason], opts);
}

export async function commitAppealEvidence(send: SendWrite | null, appealId: string, evidenceHash: string, opts: WriteOpts = {}) {
  return writeMethod(send, "commit_appeal_evidence", [appealId, evidenceHash], opts);
}

export async function submitAppealEvidence(send: SendWrite | null, appealId: string, evidence: AnyJson, opts: WriteOpts = {}) {
  return writeMethod(send, "submit_appeal_evidence", [appealId, JSON.stringify(evidence)], opts);
}

export async function revealAppealEvidence(send: SendWrite | null, appealId: string, evidence: AnyJson, salt: string, opts: WriteOpts = {}) {
  return writeMethod(send, "reveal_appeal_evidence", [appealId, JSON.stringify(evidence), salt], opts);
}

export async function triggerAppealReview(send: SendWrite | null, appealId: string, feeWei: bigint, opts: Omit<WriteOpts, "value"> = {}) {
  return writeMethod(send, "trigger_appeal_review", [appealId], { ...opts, value: feeWei });
}

// ---------------- Admin (limited) ----------------

export async function adminPause(send: SendWrite | null, opts: WriteOpts = {}) {
  return writeMethod(send, "admin_pause", [], opts);
}
export async function adminUnpause(send: SendWrite | null, opts: WriteOpts = {}) {
  return writeMethod(send, "admin_unpause", [], opts);
}
export async function adminSetReviewFee(send: SendWrite | null, feeWei: string, opts: WriteOpts = {}) {
  return writeMethod(send, "admin_set_review_fee", [feeWei], opts);
}
export async function adminSetKeeper(send: SendWrite | null, keeper: string, opts: WriteOpts = {}) {
  return writeMethod(send, "admin_set_keeper", [keeper], opts);
}
export async function adminSetSchemaVersion(send: SendWrite | null, version: string, opts: WriteOpts = {}) {
  return writeMethod(send, "admin_set_schema_version", [version], opts);
}
export async function adminSetHidden(send: SendWrite | null, campaignId: string, hidden: boolean, opts: WriteOpts = {}) {
  return writeMethod(send, "admin_set_hidden", [campaignId, hidden], opts);
}
export async function adminMarkSpam(send: SendWrite | null, campaignId: string, reason: string, opts: WriteOpts = {}) {
  return writeMethod(send, "admin_mark_spam", [campaignId, reason], opts);
}

// ---------------- Commit-reveal helpers ----------------

const enc = (s: string) => new TextEncoder().encode(s);

function bytesToHex(buf: Uint8Array): string {
  return Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256(evidence_json + salt), prefixed `sha256:` to match the contract. */
export async function buildEvidenceHash(evidenceJson: string, salt: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("buildEvidenceHash requires a browser environment with SubtleCrypto");
  }
  const data = enc(evidenceJson + salt);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return "sha256:" + bytesToHex(new Uint8Array(digest));
}

export function randomSalt(): string {
  const buf = new Uint8Array(16);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(buf);
}

// ---------------- Marshalling ----------------

export function campaignFromJson(id: string, j: AnyJson): Campaign {
  return {
    id,
    creator: String(j.creator ?? ""),
    title: String(j.title ?? ""),
    category: String(j.category ?? ""),
    fundingGoal: Number(j.funding_goal ?? j.fundingGoal ?? 0),
    story: String(j.story ?? ""),
    beneficiarySummary: String(j.beneficiary_summary ?? ""),
    regionSummary: String(j.region_summary ?? ""),
    useOfFunds: Array.isArray(j.use_of_funds)
      ? j.use_of_funds.map((u: any) => ({ item: String(u.item ?? ""), amount: Number(u.amount ?? 0) }))
      : [],
    timeline: String(j.timeline ?? ""),
    publicProofLinks: Array.isArray(j.public_proof_links) ? j.public_proof_links.map(String) : [],
    riskDisclosure: String(j.risk_disclosure ?? ""),
    status: (j.status ?? "CREATED") as any,
    schemaVersion: j.schema_version,
    createdAt: j.created_at,
    authenticityScore: j.authenticity_score != null ? Number(j.authenticity_score) : undefined,
    donorRiskLevel: j.donor_risk_level,
    decision: j.decision,
  };
}

export function verdictFromJson(campaignId: string, j: AnyJson): Verdict {
  return {
    campaignId,
    authenticityScore: Number(j.authenticity_score ?? 0),
    evidenceStrength: Number(j.evidence_strength ?? 0),
    donorRiskLevel: (j.donor_risk_level ?? "medium") as any,
    decision: (j.decision ?? "caution") as any,
    confidence: Number(j.confidence ?? 0),
    recommendedDonorAction: (j.recommended_donor_action ?? "wait_for_more_evidence") as any,
    reasoning: Array.isArray(j.reasoning) ? j.reasoning.map(String) : [],
    riskFlags: Array.isArray(j.risk_flags) ? j.risk_flags.map(String) : [],
    requiredImprovements: Array.isArray(j.required_improvements) ? j.required_improvements.map(String) : [],
    reviewedAt: j.reviewed_at,
    reviewer: j.reviewer,
  };
}

/** Build the JSON payload the contract expects from a Campaign draft. */
export function campaignToContractJson(c: Partial<Campaign>): AnyJson {
  return {
    title: c.title ?? "",
    category: c.category ?? "",
    story: c.story ?? "",
    funding_goal: Number(c.fundingGoal ?? 0),
    beneficiary_summary: c.beneficiarySummary ?? "",
    region_summary: c.regionSummary ?? "",
    use_of_funds: (c.useOfFunds ?? []).map(u => ({ item: u.item, amount: Number(u.amount) })),
    timeline: c.timeline ?? "",
    public_proof_links: c.publicProofLinks ?? [],
    risk_disclosure: c.riskDisclosure ?? "",
  };
}

/** Build the sanitised-evidence JSON payload the contract expects. */
export function evidenceToContractJson(e: Partial<SanitisedEvidence>): AnyJson {
  const out: AnyJson = {
    evidence_summary: e.evidenceSummary ?? "",
    proof_type: e.proofType ?? "",
    redaction_statement: e.redactionStatement ?? "",
  };
  if (e.documentHash) out.document_hash = e.documentHash;
  if (e.thirdPartyVerification) out.third_party_verification = e.thirdPartyVerification;
  if (e.socialProofSummary) out.social_proof_summary = e.socialProofSummary;
  if (e.beneficiaryRelationship) out.beneficiary_relationship = e.beneficiaryRelationship;
  return out;
}

/** User-friendly translation of contract UserError messages. */
export function explainContractError(err: any): string {
  const msg = String(err?.shortMessage || err?.message || err || "");
  const inner = msg.match(/UserError[^:]*:\s*([^\n}"]+)/i)?.[1]?.trim() ?? msg;
  if (/protocol paused/i.test(inner)) return "The Judgix protocol is paused by the admin. Try again later.";
  if (/campaign exists/i.test(inner)) return "A campaign with that id already exists. Refresh and try again.";
  if (/unknown campaign/i.test(inner)) return "No campaign with that id is on-chain yet.";
  if (/creator only/i.test(inner)) return "Only the campaign creator can perform this action.";
  if (/owner only/i.test(inner)) return "Only the protocol admin can perform this action.";
  if (/missing campaign field|missing evidence field/i.test(inner)) return inner;
  if (/review fee/i.test(inner)) return "Review fee was not provided correctly. Refresh the configured fee and retry.";
  if (/already reviewed|already verdict/i.test(inner)) return "This campaign already has a verdict on-chain.";
  if (/not ready/i.test(inner)) return "The campaign is not in a state that can be reviewed yet.";
  if (/insufficient (funds|balance)/i.test(inner)) return "Wallet balance is too low to pay the review fee + gas.";
  if (/timed out/i.test(inner)) return "Timed out waiting for the verdict. The transaction may still finalize on-chain.";
  return inner || "On-chain call failed. Check the wallet has gas and try again.";
}
