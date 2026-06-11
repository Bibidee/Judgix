export const STATUS_META: Record<string, { label: string; color: string; bg: string; description: string }> = {
  DRAFT: { label: "Draft", color: "#6D5A7D", bg: "#F2E9FF", description: "Not yet submitted for review." },
  PENDING_REVIEW: { label: "Pending Review", color: "#24162F", bg: "#FFD166", description: "Awaiting GenLayer consensus." },
  VERIFIED: { label: "Verified", color: "#0F5E4A", bg: "#7AE7C7", description: "Strong evidence support, low donor-risk indicators." },
  NEEDS_MORE_EVIDENCE: { label: "Needs More Evidence", color: "#7A4E00", bg: "#FFD166", description: "Plausible story, incomplete evidence." },
  RISKY: { label: "Risky", color: "#FFFFFF", bg: "#FF6B5E", description: "Material risk signals present." },
  SUSPICIOUS: { label: "Suspicious", color: "#FFFFFF", bg: "#D90368", description: "Serious inconsistencies detected." },
  REJECTED: { label: "Rejected", color: "#FFFFFF", bg: "#D90368", description: "Failed consensus review." },
  UNDER_DISPUTE: { label: "Under Dispute", color: "#FFFFFF", bg: "#FF6B5E", description: "Flagged and under review." },
  SUSPENDED: { label: "Suspended", color: "#FFFFFF", bg: "#24162F", description: "Activity halted pending resolution." },
  RESOLVED: { label: "Resolved", color: "#0F5E4A", bg: "#7AE7C7", description: "Dispute resolved." },
  ARCHIVED: { label: "Archived", color: "#6D5A7D", bg: "#DCE9F2", description: "No longer active." },
};

export const RISK_META: Record<string, { color: string; bg: string }> = {
  LOW: { color: "#0F5E4A", bg: "#7AE7C7" },
  MEDIUM: { color: "#7A4E00", bg: "#FFD166" },
  HIGH: { color: "#FFFFFF", bg: "#FF6B5E" },
  CRITICAL: { color: "#FFFFFF", bg: "#D90368" },
};

export const CATEGORIES = [
  "Medical", "Education", "Emergency", "Community", "Disaster Relief",
  "Funeral", "Animal Rescue", "Public Good", "Charity", "Other",
];

export const EVIDENCE_TYPES = [
  { value: "MEDICAL_DOCUMENT", label: "Medical Document" },
  { value: "INVOICE", label: "Invoice" },
  { value: "SCHOOL_DOCUMENT", label: "School Fee Document" },
  { value: "POLICE_REPORT", label: "Police Report" },
  { value: "NEWS_ARTICLE", label: "News Article" },
  { value: "SOCIAL_POST", label: "Social Media Post" },
  { value: "REGISTRATION", label: "Organisation Registration" },
  { value: "IMAGE", label: "Image" },
  { value: "VIDEO", label: "Video" },
  { value: "RECEIPT", label: "Receipt" },
  { value: "PUBLIC_STATEMENT", label: "Public Statement" },
  { value: "OTHER", label: "Other" },
];

export const FLAG_REASONS = [
  "Fake story", "Stolen identity", "Plagiarised campaign", "Misleading medical claim",
  "Duplicate campaign", "Funds misuse", "Evidence mismatch", "Suspicious wallet behaviour", "Other",
];
