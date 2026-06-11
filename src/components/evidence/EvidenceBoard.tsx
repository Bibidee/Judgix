import { EvidenceItem, PublicSignal } from "@/types";

export function EvidenceBoard({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) return <p className="text-slate text-sm">No evidence attached.</p>;
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {items.map(e => (
        <div key={e.id} className="border border-mist rounded-lg p-4 bg-lilac/40">
          <div className="flex items-center justify-between">
            <span className="case-stamp text-evidence">{e.type.replace(/_/g, " ")}</span>
            {e.date && <span className="case-stamp text-slate">{e.date}</span>}
          </div>
          <h4 className="font-serif-display text-lg mt-1">{e.title}</h4>
          <p className="text-sm text-deeptext/80 mt-1">{e.description}</p>
          <div className="mt-3 flex items-center justify-between text-xs font-mono text-slate">
            <a href={e.uri} target="_blank" rel="noreferrer" className="text-evidence truncate max-w-[60%]">{e.uri}</a>
            {e.sourceName && <span>{e.sourceName}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PublicSignalList({ signals }: { signals: PublicSignal[] }) {
  if (signals.length === 0) return <p className="text-slate text-sm">No public signals provided.</p>;
  return (
    <ul className="space-y-2">
      {signals.map((s, i) => (
        <li key={i} className="flex items-center justify-between border border-mist rounded-md px-3 py-2">
          <span className="case-stamp text-evidence">{s.platform}</span>
          <a className="text-sm text-evidence font-mono truncate ml-3" href={s.url} target="_blank" rel="noreferrer">
            {s.label || s.url}
          </a>
        </li>
      ))}
    </ul>
  );
}
