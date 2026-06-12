// Judgix V1 type system — sanitised-evidence, GenLayer-judged trust verdicts.
// Everything below mirrors the on-chain JSON shape from contracts/judgix.py.

export type CampaignStatus =
  | "CREATED"
  | "EVIDENCE_COMMITTED"
  | "EVIDENCE_REVEALED"
  | "READY_FOR_REVIEW"
  | "UNDER_REVIEW"
  | "REVIEWED"
  | "FLAGGED"
  | "APPEALED"
  | "APPEAL_EVIDENCE_COMMITTED"
  | "APPEAL_EVIDENCE_REVEALED"
  | "READY_FOR_APPEAL_REVIEW"
  | "APPEAL_REVIEWED"
  | "CANCELLED"
  | "HIDDEN"
  | "SPAM";

export type DonorRiskLevel = "low" | "medium" | "high" | "critical";
export type Decision = "verified" | "caution" | "high_risk" | "reject";
export type DonorAction = "support" | "support_with_caution" | "wait_for_more_evidence" | "avoid";
export type AppealDecision = "uphold" | "improve" | "worsen" | "insufficient_new_evidence";

export type UseOfFundsItem = { item: string; amount: number };

export type Campaign = {
  id: string;
  creator: string;
  title: string;
  category: string;
  fundingGoal: number;
  currency: string;
  story: string;
  beneficiarySummary: string;
  regionSummary: string;
  useOfFunds: UseOfFundsItem[];
  timeline: string;
  publicProofLinks: string[];
  riskDisclosure: string;
  status: CampaignStatus;
  schemaVersion?: string;
  createdAt?: string;
  // Cached verdict snapshot (the contract stores final review separately, but
  // some views echo a small summary).
  authenticityScore?: number;
  donorRiskLevel?: DonorRiskLevel;
  decision?: Decision;
};

export type SanitisedEvidence = {
  campaignId: string;
  evidenceSummary: string;
  proofType: string;
  documentHash?: string;
  thirdPartyVerification?: string;
  socialProofSummary?: string;
  beneficiaryRelationship?: string;
  redactionStatement: string;
  schemaVersion?: string;
  revealedAt?: string;
};

export type Verdict = {
  campaignId: string;
  authenticityScore: number;       // 0–100
  evidenceStrength: number;        // 0–100
  donorRiskLevel: DonorRiskLevel;
  decision: Decision;
  confidence: number;              // 0–100
  recommendedDonorAction: DonorAction;
  reasoning: string[];
  riskFlags: string[];
  requiredImprovements: string[];
  reviewedAt?: string;
  reviewer?: string;
};

export type Appeal = {
  id: string;
  campaignId: string;
  creator: string;
  reason: string;
  status: CampaignStatus;
  createdAt?: string;
};

export type AppealVerdict = {
  appealId: string;
  appealDecision: AppealDecision;
  newAuthenticityScore: number;
  newEvidenceStrength: number;
  newDonorRiskLevel: DonorRiskLevel;
  newRecommendedDonorAction: DonorAction;
  confidence: number;
  reasoning: string[];
  changedFields: string[];
  reviewedAt?: string;
};

export type Flag = {
  id: string;
  campaignId: string;
  reporter: string;
  reason: string;
  createdAt?: string;
};

export type CreatorReputation = {
  creator: string;
  totalCampaigns: number;
  reviewedCampaigns: number;
  verifiedCount: number;
  cautionCount: number;
  highRiskCount: number;
  rejectedCount: number;
  averageAuthenticityScore: number;
  averageEvidenceStrength: number;
  lastDecision: string;
  lastDonorRiskLevel: string;
  appealCount: number;
  flagCount: number;
};

export type ProtocolStats = {
  campaigns: number;
  reviews: number;
  appeals: number;
  flags: number;
};

export type ProtocolConfig = {
  paused: boolean;
  keeper: string;
  evidenceSchemaVersion: string;
  reviewFeeWei: string;
  protocolFeesWei: string;
};
