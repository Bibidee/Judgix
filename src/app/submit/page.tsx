"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, EVIDENCE_TYPES } from "@/lib/constants";
import { PaperCard } from "@/components/ui/PaperCard";
import { Campaign, EvidenceItem, PublicSignal } from "@/types";
import { VerdictPanel } from "@/components/verdict/VerdictPanel";
import { useWallet } from "@/lib/wallet/WalletProvider";
import {
  createCampaignOnChain,
  submitCampaignForReviewOnChain,
  reviewCampaign as reviewCampaignTx,
  fetchCampaignReview,
  explainContractError,
} from "@/lib/genlayer/contract";
import { pollForReview } from "@/lib/genlayer/sdk";
import { saveDraft, loadDraft, clearDraft, rememberCampaignId } from "@/lib/storage/drafts";
import { TxStatus, TxStep } from "@/components/ui/TxStatus";

type EvidenceDraft = { type: string; title: string; description: string; uri: string; date: string; sourceName: string };
type DraftShape = {
  title: string; category: string; country: string; goal: string; currency: string;
  beneficiary: string; creator: string; wallet: string; deadline: string;
  problem: string; whyFunds: string; whoBenefits: string; timeline: string; useOfFunds: string;
  evidence: EvidenceDraft[]; signals: PublicSignal[];
};

const DRAFT_KEY = "submit.form.v1";
const EMPTY_EVIDENCE: EvidenceDraft = { type: "MEDICAL_DOCUMENT", title: "", description: "", uri: "", date: "", sourceName: "" };

type Stage = "idle" | "creating" | "submitting" | "reviewing" | "polling" | "done" | "error";

export default function SubmitPage() {
  const router = useRouter();
  const { connected, account, address, connect } = useWallet();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Medical");
  const [country, setCountry] = useState("");
  const [goal, setGoal] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [beneficiary, setBeneficiary] = useState("");
  const [creator, setCreator] = useState("");
  const [wallet, setWallet] = useState("");
  const [deadline, setDeadline] = useState("");
  const [problem, setProblem] = useState("");
  const [whyFunds, setWhyFunds] = useState("");
  const [whoBenefits, setWhoBenefits] = useState("");
  const [timeline, setTimeline] = useState("");
  const [useOfFunds, setUseOfFunds] = useState("");
  const [evidence, setEvidence] = useState<EvidenceDraft[]>([EMPTY_EVIDENCE]);
  const [signals, setSignals] = useState<PublicSignal[]>([{ platform: "x", url: "" }]);
  const [consent, setConsent] = useState(false);

  const [stage, setStage] = useState<Stage>("idle");
  const [stageMessage, setStageMessage] = useState("");
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);
  const [verdict, setVerdict] = useState<any>(null);
  const [error, setError] = useState("");

  // Restore draft
  useEffect(() => {
    (async () => {
      const d = await loadDraft<DraftShape>(DRAFT_KEY);
      if (!d) return;
      setTitle(d.title); setCategory(d.category); setCountry(d.country);
      setGoal(d.goal); setCurrency(d.currency); setBeneficiary(d.beneficiary);
      setCreator(d.creator); setWallet(d.wallet); setDeadline(d.deadline);
      setProblem(d.problem); setWhyFunds(d.whyFunds); setWhoBenefits(d.whoBenefits);
      setTimeline(d.timeline); setUseOfFunds(d.useOfFunds);
      if (Array.isArray(d.evidence) && d.evidence.length) setEvidence(d.evidence);
      if (Array.isArray(d.signals) && d.signals.length) setSignals(d.signals);
    })();
  }, []);

  // Autosave draft (debounced via timeout)
  useEffect(() => {
    const id = setTimeout(() => {
      saveDraft(DRAFT_KEY, {
        title, category, country, goal, currency, beneficiary, creator, wallet, deadline,
        problem, whyFunds, whoBenefits, timeline, useOfFunds, evidence, signals,
      });
    }, 400);
    return () => clearTimeout(id);
  }, [title, category, country, goal, currency, beneficiary, creator, wallet, deadline,
      problem, whyFunds, whoBenefits, timeline, useOfFunds, evidence, signals]);

  // Default wallet to connected address
  useEffect(() => {
    if (address && !wallet) setWallet(address);
  }, [address]);

  const addEvidence = () => setEvidence([...evidence, { ...EMPTY_EVIDENCE, type: "OTHER" }]);
  const updateEvidence = (i: number, k: keyof EvidenceDraft, v: string) => {
    const next = [...evidence]; (next[i] as any)[k] = v; setEvidence(next);
  };
  const removeEvidence = (i: number) => setEvidence(evidence.filter((_, j) => j !== i));

  const addSignal = () => setSignals([...signals, { platform: "website", url: "" }]);
  const updateSignal = (i: number, k: keyof PublicSignal, v: string) => {
    const next = [...signals]; (next[i] as any)[k] = v; setSignals(next);
  };
  const removeSignal = (i: number) => setSignals(signals.filter((_, j) => j !== i));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!connected || !account) { setError("Connect a wallet first."); return; }
    if (!consent) { setError("Please confirm the consent statement."); return; }
    if (!title || !goal || !problem || !whyFunds) { setError("Please fill in the required fields."); return; }

    const campaign: Campaign = {
      id: `JDX-${Date.now().toString(36).toUpperCase()}`,
      creator: address || wallet,
      title, category, country, fundingGoal: goal, currency,
      beneficiary, walletAddress: wallet || address || "",
      story: `${problem}\n\n${whyFunds}`,
      useOfFunds, problemStatement: problem,
      whoBenefits, timelineOfEvents: timeline,
      evidence: evidence
        .filter(ev => ev.title && ev.uri)
        .map((ev, i): EvidenceItem => ({
          id: `e${i+1}`, type: ev.type as any, title: ev.title, description: ev.description,
          uri: ev.uri, date: ev.date, sourceName: ev.sourceName,
        })),
      publicSignals: signals.filter(s => s.url),
      status: "PENDING_REVIEW",
      deadline,
      createdAt: Date.now(), updatedAt: Date.now(),
    };

    setTxSteps([
      { label: "create_campaign", status: "pending" },
      { label: "submit_campaign_for_review", status: "idle" },
      { label: "review_campaign (GenLayer consensus)", status: "idle" },
    ]);

    const setStep = (i: number, patch: Partial<TxStep>) =>
      setTxSteps(s => s.map((step, idx) => idx === i ? { ...step, ...patch } : step));

    try {
      setStage("creating"); setStageMessage("Creating campaign on Judgix contract…");
      await createCampaignOnChain(account, campaign, {
        onHash: h => setStep(0, { hash: h, status: "pending", message: "Tx broadcast — awaiting consensus…" }),
      });
      setStep(0, { status: "accepted" });
      setStep(1, { status: "pending" });

      setStage("submitting"); setStageMessage("Marking campaign as pending review…");
      await submitCampaignForReviewOnChain(account, campaign.id, {
        onHash: h => setStep(1, { hash: h, status: "pending", message: "Tx broadcast — awaiting consensus…" }),
      });
      setStep(1, { status: "accepted" });
      setStep(2, { status: "pending", message: "Validators producing a verdict via consensus…" });

      setStage("reviewing"); setStageMessage("Validators reviewing on GenLayer consensus…");
      await reviewCampaignTx(account, campaign.id, {
        onHash: h => setStep(2, { hash: h, status: "pending", message: "Validators reviewing under consensus…" }),
      });
      setStep(2, { status: "accepted" });

      setStage("polling"); setStageMessage("Reading verdict from contract…");
      const review = await pollForReview(() => fetchCampaignReview(campaign.id), { intervalMs: 4000, timeoutMs: 240_000 });
      if (!review) throw new Error("Timed out waiting for verdict. The transaction may still finalize on-chain.");

      setStep(2, { status: "finalized", message: `Verdict ${review.verdict} · ${review.authenticityScore}/100` });

      await rememberCampaignId(campaign.id);
      await clearDraft(DRAFT_KEY);
      setVerdict({ campaign, review });
      setStage("done"); setStageMessage("");
    } catch (err: any) {
      const friendly = explainContractError(err);
      setStage("error");
      setError(friendly);
      setTxSteps(s => s.map(step => step.status === "pending" ? { ...step, status: "error", message: friendly } : step));
    }
  }

  if (verdict) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div className="case-stamp text-slate">Submission complete</div>
        <h1 className="font-serif-display text-4xl">Case file {verdict.campaign.id}</h1>
        <p className="text-deeptext/80">GenLayer consensus returned the following verdict, persisted on-chain.</p>
        <VerdictPanel review={verdict.review} />
        <div className="flex gap-3">
          <button onClick={() => router.push(`/campaigns/${verdict.campaign.id}`)} className="bg-plum text-cloud px-4 py-2 rounded-md">Open case file</button>
          <button onClick={() => router.push("/campaigns")} className="border border-mist px-4 py-2 rounded-md">All case files</button>
        </div>
      </div>
    );
  }

  const busy = stage !== "idle" && stage !== "error" && stage !== "done";

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="case-stamp text-slate">New Case File</div>
      <h1 className="font-serif-display text-4xl mt-1">Submit a campaign for review</h1>
      <p className="text-deeptext/70 mt-2">Provide enough evidence and signal for validators to reach a confident verdict.</p>

      {!connected && (
        <div className="mt-6 paper-card p-4 flex items-center justify-between border-coral/40">
          <div>
            <div className="case-stamp text-coral">Wallet required</div>
            <p className="text-sm mt-1">Connect a wallet to submit a campaign on-chain.</p>
          </div>
          <button onClick={connect} className="bg-coral text-cloud px-4 py-2 rounded-md">Connect wallet</button>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6 mt-8">
        <PaperCard eyebrow="Section 01" title="Basic campaign details">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Campaign title *"><input className="input" value={title} onChange={e => setTitle(e.target.value)} /></Field>
            <Field label="Category">
              <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Country / location"><input className="input" value={country} onChange={e => setCountry(e.target.value)} /></Field>
            <Field label="Funding goal *"><input className="input" type="number" value={goal} onChange={e => setGoal(e.target.value)} /></Field>
            <Field label="Currency">
              <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>
                {["USD", "EUR", "GBP", "NGN", "KES", "GHS"].map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Beneficiary"><input className="input" value={beneficiary} onChange={e => setBeneficiary(e.target.value)} /></Field>
            <Field label="Creator name / organisation"><input className="input" value={creator} onChange={e => setCreator(e.target.value)} /></Field>
            <Field label="Wallet / payment address"><input className="input font-mono" value={wallet} onChange={e => setWallet(e.target.value)} placeholder="0x…" /></Field>
            <Field label="Campaign deadline"><input className="input" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></Field>
          </div>
        </PaperCard>

        <PaperCard eyebrow="Section 02" title="Story">
          <div className="grid gap-4">
            <Field label="Problem statement *"><textarea className="input min-h-[80px]" value={problem} onChange={e => setProblem(e.target.value)} /></Field>
            <Field label="Why funds are needed *"><textarea className="input min-h-[80px]" value={whyFunds} onChange={e => setWhyFunds(e.target.value)} /></Field>
            <Field label="Who benefits"><textarea className="input" value={whoBenefits} onChange={e => setWhoBenefits(e.target.value)} /></Field>
            <Field label="Timeline of events"><textarea className="input" value={timeline} onChange={e => setTimeline(e.target.value)} /></Field>
            <Field label="How funds will be used"><textarea className="input min-h-[80px]" value={useOfFunds} onChange={e => setUseOfFunds(e.target.value)} /></Field>
          </div>
        </PaperCard>

        <PaperCard eyebrow="Section 03" title="Evidence">
          <div className="space-y-4">
            {evidence.map((ev, i) => (
              <div key={i} className="border border-mist rounded-lg p-4 bg-lilac/30">
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Type">
                    <select className="input" value={ev.type} onChange={e => updateEvidence(i, "type", e.target.value)}>
                      {EVIDENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Title"><input className="input" value={ev.title} onChange={e => updateEvidence(i, "title", e.target.value)} /></Field>
                  <Field label="URL or IPFS CID"><input className="input font-mono" value={ev.uri} onChange={e => updateEvidence(i, "uri", e.target.value)} /></Field>
                  <Field label="Source name"><input className="input" value={ev.sourceName} onChange={e => updateEvidence(i, "sourceName", e.target.value)} /></Field>
                  <Field label="Date"><input type="date" className="input" value={ev.date} onChange={e => updateEvidence(i, "date", e.target.value)} /></Field>
                  <Field label="Description"><input className="input" value={ev.description} onChange={e => updateEvidence(i, "description", e.target.value)} /></Field>
                </div>
                {evidence.length > 1 && (
                  <button type="button" onClick={() => removeEvidence(i)} className="case-stamp text-raspberry mt-3">Remove</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addEvidence} className="case-stamp text-evidence">+ Add evidence item</button>
          </div>
        </PaperCard>

        <PaperCard eyebrow="Section 04" title="Public signals">
          <div className="space-y-3">
            {signals.map((s, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <Field label="Platform">
                    <select className="input" value={s.platform} onChange={e => updateSignal(i, "platform", e.target.value as any)}>
                      {["website", "x", "instagram", "facebook", "linkedin", "news", "crowdfunding", "registration"].map(p => <option key={p}>{p}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="col-span-8">
                  <Field label="URL"><input className="input font-mono" value={s.url} onChange={e => updateSignal(i, "url", e.target.value)} /></Field>
                </div>
                <button type="button" onClick={() => removeSignal(i)} className="case-stamp text-raspberry col-span-1">Remove</button>
              </div>
            ))}
            <button type="button" onClick={addSignal} className="case-stamp text-evidence">+ Add signal</button>
          </div>
        </PaperCard>

        <PaperCard eyebrow="Section 05" title="Consent and warnings">
          <p className="text-sm text-deeptext/80">
            By submitting this campaign, you confirm that the information provided is accurate to the best of your knowledge.
            Judgix does not guarantee donation safety. It provides a decentralised review of campaign evidence and consistency.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            I confirm the above statement.
          </label>
        </PaperCard>

        {(busy || txSteps.length > 0) && <TxStatus steps={txSteps} />}

        {error && <div className="border border-raspberry/30 bg-raspberry/10 text-raspberry rounded-md p-3 text-sm">{error}</div>}

        <div className="flex justify-end gap-3">
          <button type="submit" disabled={busy || !connected} className="bg-coral text-cloud px-5 py-3 rounded-md font-medium disabled:opacity-60">
            {busy ? "Working…" : connected ? "Submit for GenLayer review" : "Connect wallet to submit"}
          </button>
        </div>
      </form>

      <style jsx>{`
        .input { width: 100%; border: 1px solid #DCE9F2; background: white; padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.9rem; }
        .input:focus { outline: 2px solid #22D3EE; outline-offset: 1px; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="case-stamp text-slate">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
