"use client";

import { useEffect, useState } from "react";
import { getTransactionStatus } from "@/lib/genlayer/sdk";

export type TxStep = {
  label: string;
  hash?: string;
  status?: "idle" | "pending" | "accepted" | "finalized" | "error";
  message?: string;
};

const STATUS_ORDER = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];

function normalise(raw?: string | null): TxStep["status"] {
  if (!raw) return "pending";
  const s = raw.toUpperCase();
  if (s === "FINALIZED") return "finalized";
  if (s === "ACCEPTED" || s === "READY_TO_FINALIZE") return "accepted";
  if (s === "CANCELED" || s.includes("TIMEOUT") || s.includes("VIOLATION")) return "error";
  return "pending";
}

export function TxStatus({ steps }: { steps: TxStep[] }) {
  const [statuses, setStatuses] = useState<Record<string, TxStep["status"]>>({});

  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(async () => {
      for (const s of steps) {
        if (!s.hash) continue;
        const raw = await getTransactionStatus(s.hash);
        if (cancelled) return;
        const next = normalise(raw);
        setStatuses(prev => prev[s.hash!] === next ? prev : { ...prev, [s.hash!]: next });
      }
    }, 2500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [steps]);

  return (
    <div className="paper-card p-4 border-cyan/40">
      <div className="case-stamp text-evidence mb-3">Transaction trail</div>
      <ol className="space-y-3">
        {steps.map((s, i) => {
          const resolved = s.status ?? (s.hash ? statuses[s.hash] : undefined) ?? (s.hash ? "pending" : "idle");
          return (
            <li key={i} className="flex items-start gap-3">
              <Dot status={resolved} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="case-stamp text-deeptext">{s.label}</div>
                  <span className="case-stamp" style={{ color: colorFor(resolved) }}>
                    {(resolved || "").toUpperCase()}
                  </span>
                </div>
                {s.hash && <div className="font-mono text-[11px] text-slate truncate">{s.hash}</div>}
                {s.message && <div className="text-xs text-deeptext/70 mt-1">{s.message}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function colorFor(s: TxStep["status"]) {
  switch (s) {
    case "finalized": return "#0F5E4A";
    case "accepted":  return "#22D3EE";
    case "error":     return "#D90368";
    case "pending":   return "#7A4E00";
    default:          return "#6D5A7D";
  }
}

function Dot({ status }: { status: TxStep["status"] }) {
  const c = colorFor(status);
  const pulse = status === "pending" || status === "accepted";
  return (
    <span
      className="mt-1 w-3 h-3 rounded-full inline-block"
      style={{
        background: c,
        boxShadow: pulse ? `0 0 0 0 ${c}80` : undefined,
        animation: pulse ? "tx-pulse 1.4s ease-out infinite" : undefined,
      }}
    >
      <style jsx>{`
        @keyframes tx-pulse {
          0% { box-shadow: 0 0 0 0 ${c}66; }
          70% { box-shadow: 0 0 0 8px ${c}00; }
          100% { box-shadow: 0 0 0 0 ${c}00; }
        }
      `}</style>
    </span>
  );
}

/** Helper for tracking transitions in form pages without a polling component. */
export function useStepStatuses(steps: TxStep[]) {
  // Re-export for parity — currently the inline component handles polling.
  return steps;
}
