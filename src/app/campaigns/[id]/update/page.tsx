"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PaperCard } from "@/components/ui/PaperCard";
import { UpdateReview, Campaign } from "@/types";
import { useWallet } from "@/lib/wallet/WalletProvider";
import {
  fetchCampaign,
  submitUpdateOnChain,
  reviewUpdateOnChain,
  fetchUpdateReview,
  explainContractError,
} from "@/lib/genlayer/contract";
import { pollForReview } from "@/lib/genlayer/sdk";
import { TxStatus, TxStep } from "@/components/ui/TxStatus";

export default function SubmitUpdatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { connected, connect, account, address } = useWallet();
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [evidenceLinks, setEvidenceLinks] = useState("");
  const [usage, setUsage] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);
  const [result, setResult] = useState<UpdateReview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const c = await fetchCampaign(id).catch(() => null);
      setCampaign(c ?? null);
    })();
  }, [id]);

  const isCreator = !!(campaign && address && address.toLowerCase() === campaign.creator.toLowerCase());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!connected || !account) { setError("Connect a wallet first."); return; }
    if (!isCreator) { setError("Only the campaign creator can post updates."); return; }
    setBusy(true);
    const steps: TxStep[] = [
      { label: "submit_update", status: "pending" },
      { label: "review_update (GenLayer consensus)", status: "idle" },
    ];
    setTxSteps(steps);
    const setStep = (i: number, p: Partial<TxStep>) =>
      setTxSteps(s => s.map((x, idx) => idx === i ? { ...x, ...p } : x));
    try {
      const updateId = `UPD-${Date.now().toString(36).toUpperCase()}`;
      const payload = {
        title, body, amount_spent: amount,
        evidence_links: evidenceLinks.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
        fund_usage_explanation: usage, next_steps: nextSteps,
      };
      setStage("Submitting update on-chain…");
      await submitUpdateOnChain(account, updateId, id, payload, {
        onHash: h => setStep(0, { hash: h, status: "pending", message: "Tx broadcast — awaiting consensus…" }),
      });
      setStep(0, { status: "accepted" });
      setStep(1, { status: "pending" });
      setStage("Validators reviewing update on GenLayer…");
      await reviewUpdateOnChain(account, updateId, {
        onHash: h => setStep(1, { hash: h, status: "pending", message: "Validators reviewing under consensus…" }),
      });
      setStep(1, { status: "accepted" });
      setStage("Reading update verdict from contract…");
      const r = await pollForReview(() => fetchUpdateReview(updateId), { intervalMs: 4000, timeoutMs: 240_000 });
      if (!r) throw new Error("Timed out waiting for update verdict.");
      setStep(1, { status: "finalized", message: `Verdict ${r.verdict.replace(/_/g, " ")}` });
      setResult(r);
    } catch (err: any) {
      const friendly = explainContractError(err);
      setError(friendly);
      setTxSteps(s => s.map(x => x.status === "pending" ? { ...x, status: "error", message: friendly } : x));
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="case-stamp text-slate"><Link href={`/campaigns/${id}`} className="hover:underline">{id}</Link> / Update</div>
      <h1 className="font-serif-display text-4xl mt-1">Post an update</h1>
      <p className="text-deeptext/70 mt-2">
        Submitting an update for <strong>{campaign?.title || id}</strong>. Validators will review whether your update
        aligns with the original case file.
      </p>

      {!connected && (
        <div className="mt-6 paper-card p-4 flex items-center justify-between border-coral/40">
          <p className="text-sm">Connect a wallet to post an update on-chain.</p>
          <button onClick={connect} className="bg-coral text-cloud px-4 py-2 rounded-md">Connect</button>
        </div>
      )}
      {connected && campaign && !isCreator && (
        <div className="mt-6 paper-card p-4 border-raspberry/40">
          <div className="case-stamp text-raspberry">Not the campaign creator</div>
          <p className="text-sm mt-1">Only <span className="font-mono">{campaign.creator}</span> can post updates for this case file.</p>
        </div>
      )}

      {result ? (
        <PaperCard className="mt-8" eyebrow="Update review" title={result.verdict.replace(/_/g, " ")}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Trust delta" value={`${result.trustDelta >= 0 ? "+" : ""}${result.trustDelta}`} />
            <Stat label="Risk delta" value={`${result.riskDelta >= 0 ? "+" : ""}${result.riskDelta}`} />
            <Stat label="Spending alignment" value={result.spendingAlignment} />
            <Stat label="Evidence quality" value={result.evidenceQuality} />
          </div>
          <p className="mt-4 text-deeptext/85">{result.reasoningSummary}</p>
          <Link href={`/campaigns/${id}`} className="text-evidence text-sm mt-4 inline-block hover:underline">Back to case file →</Link>
        </PaperCard>
      ) : (
        <form onSubmit={submit} className="space-y-6 mt-8">
          <PaperCard>
            <div className="grid gap-4">
              <L label="Update title"><input className="input" value={title} onChange={e => setTitle(e.target.value)} /></L>
              <L label="Update body (mention any attached receipts)"><textarea className="input min-h-[120px]" value={body} onChange={e => setBody(e.target.value)} /></L>
              <L label="Amount spent so far"><input className="input" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></L>
              <L label="Evidence links (one per line)"><textarea className="input min-h-[80px] font-mono" value={evidenceLinks} onChange={e => setEvidenceLinks(e.target.value)} /></L>
              <L label="Fund usage explanation"><textarea className="input" value={usage} onChange={e => setUsage(e.target.value)} /></L>
              <L label="Next steps"><textarea className="input" value={nextSteps} onChange={e => setNextSteps(e.target.value)} /></L>
            </div>
          </PaperCard>
          {txSteps.length > 0 && <TxStatus steps={txSteps} />}
          {error && <div className="border border-raspberry/30 bg-raspberry/10 text-raspberry rounded-md p-3 text-sm">{error}</div>}
          <div className="flex justify-end">
            <button disabled={busy || !connected || !isCreator} className="bg-coral text-cloud px-5 py-3 rounded-md disabled:opacity-60">
              {busy ? stage || "Working…" : "Submit update for GenLayer review"}
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
