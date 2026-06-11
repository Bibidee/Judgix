import { ReactNode } from "react";

export function PaperCard({ children, className = "", title, eyebrow }: { children: ReactNode; className?: string; title?: string; eyebrow?: string }) {
  return (
    <section className={`paper-card p-6 ${className}`}>
      {eyebrow && <div className="case-stamp text-slate mb-1">{eyebrow}</div>}
      {title && <h3 className="font-serif-display text-2xl text-deeptext mb-4">{title}</h3>}
      {children}
    </section>
  );
}

export function MonoStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-mist rounded-lg p-3">
      <div className="case-stamp text-slate">{label}</div>
      <div className="font-mono text-lg mt-1" style={{ color: accent || "#171321" }}>{value}</div>
    </div>
  );
}
