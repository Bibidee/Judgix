export function clampScore(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#0F5E4A";
  if (score >= 60) return "#7A4E00";
  if (score >= 40) return "#B45A2B";
  return "#9B0345";
}

export function scoreBg(score: number): string {
  if (score >= 80) return "#7AE7C7";
  if (score >= 60) return "#FFD166";
  if (score >= 40) return "#FF6B5E";
  return "#D90368";
}

export function formatCurrency(amount: string, currency: string = "USD"): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return `${currency} ${amount}`;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

export function shortAddress(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatDate(ts: number | string | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
