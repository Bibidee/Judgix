export type CampaignStatus =
  | "DRAFT" | "PENDING_REVIEW" | "VERIFIED" | "NEEDS_MORE_EVIDENCE"
  | "RISKY" | "SUSPICIOUS" | "REJECTED" | "UNDER_DISPUTE"
  | "SUSPENDED" | "RESOLVED" | "ARCHIVED";

export type EvidenceType =
  | "MEDICAL_DOCUMENT" | "INVOICE" | "SCHOOL_DOCUMENT" | "POLICE_REPORT"
  | "NEWS_ARTICLE" | "SOCIAL_POST" | "REGISTRATION" | "IMAGE" | "VIDEO"
  | "RECEIPT" | "PUBLIC_STATEMENT" | "OTHER";

export type EvidenceItem = {
  id: string;
  type: EvidenceType;
  title: string;
  description: string;
  uri: string;
  hash?: string;
  date?: string;
  sourceName?: string;
};

export type PublicSignal = {
  platform: "website" | "x" | "instagram" | "facebook" | "linkedin" | "news" | "crowdfunding" | "registration";
  url: string;
  label?: string;
};

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Campaign = {
  id: string;
  creator: string;
  title: string;
  category: string;
  country: string;
  fundingGoal: string;
  currency: string;
  beneficiary: string;
  walletAddress: string;
  story: string;
  useOfFunds: string;
  problemStatement: string;
  whoBenefits: string;
  timelineOfEvents: string;
  evidence: EvidenceItem[];
  publicSignals: PublicSignal[];
  status: CampaignStatus;
  deadline?: string;
  createdAt: number;
  updatedAt: number;
};

export type CampaignReview = {
  id: string;
  campaignId: string;
  verdict: string;
  authenticityScore: number;
  riskLevel: RiskLevel;
  evidenceQuality: string;
  storyConsistency: string;
  publicSignalStrength: string;
  plagiarismRisk: string;
  fundingGoalRealism: string;
  redFlags: string[];
  positiveSignals: string[];
  recommendedAction: string;
  reasoningSummary: string;
  createdAt: number;
  reviewTxHash?: string;
  confidence?: string;
};

export type CampaignUpdate = {
  id: string;
  campaignId: string;
  title: string;
  body: string;
  amountSpent: string;
  evidenceLinks: string[];
  fundUsageExplanation: string;
  nextSteps: string;
  createdAt: number;
  review?: UpdateReview;
};

export type UpdateReview = {
  verdict: string;
  trustDelta: number;
  riskDelta: number;
  spendingAlignment: string;
  evidenceQuality: string;
  concerns: string[];
  positiveSignals: string[];
  reasoningSummary: string;
  createdAt: number;
};

export type Dispute = {
  id: string;
  campaignId: string;
  reporter: string;
  reason: string;
  description: string;
  evidence: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  createdAt: number;
  review?: DisputeReview;
};

export type DisputeReview = {
  verdict: string;
  campaignAction: string;
  trustDelta: number;
  riskDelta: number;
  confirmedIssues: string[];
  unconfirmedIssues: string[];
  reasoningSummary: string;
  createdAt: number;
};
