"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PaperCard } from "@/components/ui/PaperCard";
import { FLAG_REASONS } from "@/lib/constants";
import { DisputeReview, Campaign } from "@/types";
import { useWallet } from "@/lib/wallet/WalletProvider";
import {
  fetchCampaign,
  flagCampaignOnChain,
  resolveDisputeOnChain,
  fetchDisputeReview,
  explainContractError,
} from "@/lib/genlayer/contract";
import { pollForReview } from "@/lib/genlayer/sdk";
import { TxStatus, TxStep } from "@/components/ui/TxStatus";

export default function FlagPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { connected, connect, account, address, isOwner } = useWallet();
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  const [reason, setReason] = useState(FLAG_REASONS[0]);
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const [contact, setContact] = useState("");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);
  const [result, setResult] = useState<DisputeReview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const c = await fetchCampaign(id).catch(() => null);
      setCampaign(c ?? null);
    })();
  }, [id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!connected || !account) { setError("Connect a wallet first."); return; }
    setBusy(true);
    const steps: TxStep[] = [{ label: "flag_campaign", status: "pending" }];
    if (isOwner) steps.push({ label: "resolve_dispute (GenLayer consensus)", status: "idle" });
    setTxSteps(steps);
    const setStep = (i: number, p: Partial<TxStep>) =>
      setTxSteps(s => s.map((x, idx) => idx === i ? { ...x, ...p } : x));
    try {
      const disputeId = `DSP-${Date.now().toString(36).toUpperCase()}`;
      const payload = {
        reporter: address, reason, description, evidence, contact, severity,
      };
      setStage("Filing dispute on-chain…");
      await flagCampaignOnChain(account, disputeId, id, payload, {
        onHash: h => setStep(0, { hash: h, status: "pending", message: "Tx broadcast — awaiting consensus…" }),
      });
      setStep(0, { status: "accepted" });

      if (isOwner) {
        setStep(1, { status: "pending" });
        setStage("Resolving dispute via GenLayer consensus…");
        await resolveDisputeOnChain(account, disputeId, {
          onHash: h => setStep(1, { hash: h, status: "pending", message: "Validators reviewing under consensus…" }),
        });
        setStep(1, { status: "accepted" });
        setStage("Reading dispute verdict from contract…");
        const r = await pollForReview(() => fetchDisputeReview(disputeId), { intervalMs: 4000, timeoutMs: 240_000 });
        if (!r) throw new Error("Timed out waiting for dispute verdict.");
        setStep(1, { status: "finalized", message: `Verdict ${r.verdict.replace(/_/g, " ")}` });
        setResult(r);
      } else {
        setStep(0, { status: "finalized", message: "Dispute filed. Awaiting moderator." });
        setStage("Dispute filed. Awaiting moderator to trigger consensus review.");
      }
    } catch (err: any) {
      const friendly = explainContractError(err);
      setError(friendly);
      setTxSteps(s => s.map(x => x.status === "pending" ? { ...x, status: "error", message: friendly } : x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="case-stamp text-slate"><Link href={`/campaigns/${id}`} className="hover:underline">{id}</Link> / Flag</div>
      <h1 className="font-serif-display text-4xl mt-1">File a dispute</h1>
      <p className="text-deeptext/70 mt-2">
        Flagging <strong>{campaign?.title || id}</strong>. Validators will assess your submission via GenLayer consensus.
      </p>

      {!connected && (
        <div className="mt-6 paper-card p-4 flex items-center justify-between border-coral/40">
          <p className="text-sm">Connect a wallet to file a dispute on-chain.</p>
          <button onClick={connect} className="bg-coral text-cloud px-4 py-2 rounded-md">Connect</button>
        </div>
      )}

      {result ? (
        <PaperCard className="mt-8" eyebrow="Dispute resolution" title={result.verdict.replace(/_/g, " ")}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Campaign action" value={result.campaignAction.replace(/_/g, " ")} />
            <Stat label="Trust delta" value={`${result.trustDelta >= 0 ? "+" : ""}${result.trustDelta}`} />
            <Stat label="Risk delta" value={`${result.riskDelta >= 0 ? "+" : ""}${result.riskDelta}`} />
          </div>
          <p className="mt-4 text-deeptext/85">{result.reasoningSummary}</p>
          <Link href={`/campaigns/${id}`} className="text-evidence text-sm mt-4 inline-block hover:underline">Back to case file →</Link>
        </PaperCard>
      ) : (
        <form onSubmit={submit} className="space-y-6 mt-8">
          <PaperCard>
            <div className="grid gap-4">
              <L label="Flag reason"><select className="input" value={reason} onChange={e => setReason(e.target.value)}>{FLAG_REASONS.map(r => <option key={r}>{r}</option>)}</select></L>
              <L label="Severity"><select className="input" value={severity} onChange={e => setSeverity(e.target.value as any)}>{["LOW", "MEDIUM", "HIGH"].map(s => <option key={s}>{s}</option>)}</select></L>
              <L label="Description"><textarea className="input min-h-[140px]" value={description} onChange={e => setDescription(e.target.value)} /></L>
              <L label="Supporting evidence URLs"><textarea className="input font-mono" value={evidence} onChange={e => setEvidence(e.target.value)} /></L>
              <L label="Reporter contact (optional)"><input className="input" value={contact} onChange={e => setContact(e.target.value)} /></L>
            </div>
          </PaperCard>
          {txSteps.length > 0 && <TxStatus steps={txSteps} />}
          {error && <div className="border border-raspberry/30 bg-raspberry/10 text-raspberry rounded-md p-3 text-sm">{error}</div>}
          <div className="flex justify-end">
            <button disabled={busy || !connected} className="bg-raspberry text-cloud px-5 py-3 rounded-md disabled:opacity-60">
              {busy ? stage || "Working…" : "File dispute for GenLayer review"}
            </button>
          </div>
          <style jsx>{`
            .input { width: 100%; border: 1px solid #DCE9F2; background: white; padding: 0.5rem 0.75rem; border-radius: 8px; }
          `}</style>
        </form>
      )}
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="case-stamp text-slate">{label}</span><div className="mt-1">{children}</div></label>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="border border-mist rounded-lg p-3"><div className="case-stamp text-slate">{label}</div><div className="font-mono mt-1">{value}</div></div>;
}
