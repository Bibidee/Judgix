import { STATUS_META } from "@/lib/constants";

export function CampaignStatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] || { label: status, color: "#171321", bg: "#DCE9F2", description: "" };
  return (
    <span
      className="case-stamp inline-flex items-center gap-2 px-2.5 py-1 rounded-md border"
      style={{ color: m.color, background: m.bg, borderColor: m.color + "33" }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export function RiskBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    LOW: { bg: "#7AE7C7", fg: "#0F5E4A" },
    MEDIUM: { bg: "#FFD166", fg: "#7A4E00" },
    HIGH: { bg: "#FF6B5E", fg: "#FFFFFF" },
    CRITICAL: { bg: "#D90368", fg: "#FFFFFF" },
  };
  const m = map[level] || { bg: "#DCE9F2", fg: "#171321" };
  return (
    <span className="case-stamp px-2 py-0.5 rounded" style={{ background: m.bg, color: m.fg }}>
      Risk · {level}
    </span>
  );
}
