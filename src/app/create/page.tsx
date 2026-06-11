"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PaperCard } from "@/components/ui/PaperCard";
import { useWallet } from "@/lib/wallet/WalletProvider";
import {
  createCampaign,
  submitSanitisedEvidence,
  campaignToContractJson,
  evidenceToContractJson,
  explainContractError,
} from "@/lib/genlayer/contract";
import { saveDraft, loadDraft, clearDraft } from "@/lib/storage/drafts";

const CATEGORIES = [
  "medical", "education", "emergency", "community", "disaster_relief",
  "funeral", "animal_rescue", "public_good", "charity", "other",
];

const PROOF_TYPES = [
  "medical_summary", "school_document_summary", "police_report_summary",
  "registration_summary", "receipt_summary", "news_coverage_summary",
  "social_post_summary", "public_statement_summary", "other_summary",
];

type UseOfFundsRow = { item: string; amount: string };

const DRAFT_KEY = "create.form.v2";

type Draft = {
  title: string; category: string; story: string; fundingGoal: string;
  beneficiarySummary: string; regionSummary: string; useOfFunds: UseOfFundsRow[];
  timeline: string; publicProofLinks: string; riskDisclosure: string;
  evidenceSummary: string; proofType: string; thirdPartyVerification: string;
  socialProofSummary: string; beneficiaryRelationship: string;
  redactionStatement: string; documentHash: string;
};

const emptyRow = (): UseOfFundsRow => ({ item: "", amount: "" });

export default function CreateCasePage() {
  const router = useRouter();
  const { connected, account, address, connect } = useWallet();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("medical");
  const [story, setStory] = useState("");
  const [fundingGoal, setFundingGoal] = useState("");
  const [beneficiarySummary, setBeneficiarySummary] = useState("");
  const [regionSummary, setRegionSummary] = useState("");
  const [useOfFunds, setUseOfFunds] = useState<UseOfFundsRow[]>([emptyRow()]);
  const [timeline, setTimeline] = useState("");
  const [publicProofLinks, setPublicProofLinks] = useState("");
  const [riskDisclosure, setRiskDisclosure] = useState("");

  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [proofType, setProofType] = useState("medical_summary");
  const [thirdPartyVerification, setThirdPartyVerification] = useState("");
  const [socialProofSummary, setSocialProofSummary] = useState("");
  const [beneficiaryRelationship, setBeneficiaryRelationship] = useState("");
  const [redactionStatement, setRedactionStatement] = useState("Names, phone numbers, full medical details and home addresses are redacted.");
  const [documentHash, setDocumentHash] = useState("");

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Restore draft
  useEffect(() => {
    (async () => {
      const d = await loadDraft<Draft>(DRAFT_KEY);
      if (!d) return;
      setTitle(d.title); setCategory(d.category); setStory(d.story);
      setFundingGoal(d.fundingGoal); setBeneficiarySummary(d.beneficiarySummary);
      setRegionSummary(d.regionSummary); setTimeline(d.timeline);
      setPublicProofLinks(d.publicProofLinks); setRiskDisclosure(d.riskDisclosure);
      if (Array.isArray(d.useOfFunds) && d.useOfFunds.length) setUseOfFunds(d.useOfFunds);
      setEvidenceSummary(d.evidenceSummary); setProofType(d.proofType);
      setThirdPartyVerification(d.thirdPartyVerification);
      setSocialProofSummary(d.socialProofSummary);
      setBeneficiaryRelationship(d.beneficiaryRelationship);
      setRedactionStatement(d.redactionStatement);
      setDocumentHash(d.documentHash);
    })();
  }, []);

  // Autosave
  useEffect(() => {
    const t = setTimeout(() => {
      saveDraft(DRAFT_KEY, {
        title, category, story, fundingGoal, beneficiarySummary, regionSummary,
        useOfFunds, timeline, publicProofLinks, riskDisclosure,
        evidenceSummary, proofType, thirdPartyVerification, socialProofSummary,
        beneficiaryRelationship, redactionStatement, documentHash,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [title, category, story, fundingGoal, beneficiarySummary, regionSummary,
      useOfFunds, timeline, publicProofLinks, riskDisclosure,
      evidenceSummary, proofType, thirdPartyVerification, socialProofSummary,
      beneficiaryRelationship, redactionStatement, documentHash]);

  function setRow(i: number, k: keyof UseOfFundsRow, v: string) {
    // Immutable update — never mutate row objects in place, otherwise rows
    // that share a reference (e.g. all added via the same `emptyRow()` call
    // earlier in this render) would update together.
    setUseOfFunds(prev => prev.map((row, idx) => idx === i ? { ...row, [k]: v } : row));
  }
  function addRow() { setUseOfFunds(prev => [...prev, emptyRow()]); }
  function removeRow(i: number) { setUseOfFunds(prev => prev.filter((_, j) => j !== i)); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!connected || !account || !address) { setError("Connect a wallet first."); return; }
    if (!consent) { setError("Please confirm the disclosure statement."); return; }
    if (!title || !story || !fundingGoal || !beneficiarySummary || !regionSummary || !timeline || !evidenceSummary || !redactionStatement) {
      setError("Please fill in the required fields.");
      return;
    }

    const goal = Number(fundingGoal);
    if (!Number.isFinite(goal) || goal <= 0) { setError("Funding goal must be a positive number."); return; }

    const id = `JDX-${Date.now().toString(36).toUpperCase()}`;

    const campaignPayload = campaignToContractJson({
      title, category, story, fundingGoal: goal,
      beneficiarySummary, regionSummary, timeline,
      useOfFunds: useOfFunds
        .filter(r => r.item.trim() && r.amount.trim())
        .map(r => ({ item: r.item.trim(), amount: Number(r.amount) })),
      publicProofLinks: publicProofLinks.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      riskDisclosure,
    });

    const evidencePayload = evidenceToContractJson({
      evidenceSummary, proofType, redactionStatement,
      documentHash: documentHash.trim() || undefined,
      thirdPartyVerification: thirdPartyVerification.trim() || undefined,
      socialProofSummary: socialProofSummary.trim() || undefined,
      beneficiaryRelationship: beneficiaryRelationship.trim() || undefined,
    });

    setBusy(true);
    console.log("[Judgix /create] submitting", { id, signer: account.address, contract_payload: campaignPayload });
    try {
      setStage("Creating campaign on Judgix contract…");
      const create = await createCampaign(account, id, campaignPayload, {
        onHash: h => setStage(`create_campaign broadcast · ${h.slice(0, 10)}…`),
      });
      console.log("[Judgix /create] create_campaign tx", create.hash);

      setStage("Submitting sanitised evidence…");
      const submit = await submitSanitisedEvidence(account, id, evidencePayload, {
        onHash: h => setStage(`submit_sanitised_evidence broadcast · ${h.slice(0, 10)}…`),
      });
      console.log("[Judgix /create] submit_sanitised_evidence tx", submit.hash);

      await clearDraft(DRAFT_KEY);
      setCreatedId(id);
    } catch (err: any) {
      console.error("[Judgix /create] failed", err);
      const friendly = explainContractError(err);
      const raw = String(err?.message || err);
      setError(friendly === raw ? friendly : `${friendly}\n\nRaw: ${raw}`);
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  if (createdId) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-6 text-center">
        <div className="case-stamp text-slate">Case file opened</div>
        <h1 className="font-serif-display text-4xl">Your case file is live · {createdId}</h1>
        <p className="text-deeptext/80">
          The campaign is on-chain with sanitised evidence attached and is <strong>READY_FOR_REVIEW</strong>.
          Anyone — including you — can now trigger GenLayer consensus review by paying the protocol's review fee.
        </p>
        <div className="flex justify-center gap-3 mt-4">
          <button onClick={() => router.push(`/campaigns/${createdId}`)} className="bg-plum text-cloud px-4 py-2 rounded-md">Open trust report</button>
          <button onClick={() => router.push("/campaigns")} className="border border-mist px-4 py-2 rounded-md">All trust reports</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="case-stamp text-slate">New case file</div>
      <h1 className="font-serif-display text-4xl mt-1">Open a Judgix case file</h1>
      <p className="text-deeptext/70 mt-2">
        Submit a campaign and sanitised evidence. GenLayer validators will produce a public trust verdict —
        Judgix does not process donations.
      </p>

      {!connected && (
        <div className="mt-6 paper-card p-4 flex items-center justify-between border-coral/40">
          <div>
            <div className="case-stamp text-coral">Wallet required</div>
            <p className="text-sm mt-1">Sign in with email or Google to provision your Judgix wallet.</p>
          </div>
          <button onClick={connect} className="bg-coral text-cloud px-4 py-2 rounded-md">Enter Judgix</button>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6 mt-8">
        <PaperCard eyebrow="Section 01" title="Campaign details">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Campaign title *"><input className="input" value={title} onChange={e => setTitle(e.target.value)} /></Field>
            <Field label="Category">
              <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
            <Field label="Funding goal (USD) *"><input className="input" type="number" min="1" value={fundingGoal} onChange={e => setFundingGoal(e.target.value)} /></Field>
            <Field label="Region summary *"><input className="input" placeholder="Lagos, Nigeria" value={regionSummary} onChange={e => setRegionSummary(e.target.value)} /></Field>
            <Field label="Beneficiary summary *" className="md:col-span-2">
              <input className="input" placeholder="e.g. Adult community teacher, identity partially redacted" value={beneficiarySummary} onChange={e => setBeneficiarySummary(e.target.value)} />
            </Field>
            <Field label="Story *" className="md:col-span-2">
              <textarea className="input min-h-[120px]" value={story} onChange={e => setStory(e.target.value)} />
            </Field>
            <Field label="Timeline *" className="md:col-span-2">
              <input className="input" placeholder="Funds needed within 21 days" value={timeline} onChange={e => setTimeline(e.target.value)} />
            </Field>
          </div>
        </PaperCard>

        <PaperCard eyebrow="Section 02" title="Use of funds *">
          <div className="space-y-3">
            {useOfFunds.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-7"><Field label="Item"><input className="input" value={r.item} onChange={e => setRow(i, "item", e.target.value)} /></Field></div>
                <div className="col-span-4"><Field label="Amount (USD)"><input className="input" type="number" value={r.amount} onChange={e => setRow(i, "amount", e.target.value)} /></Field></div>
                {useOfFunds.length > 1 && <button type="button" onClick={() => removeRow(i)} className="case-stamp text-raspberry col-span-1">Remove</button>}
              </div>
            ))}
            <button type="button" onClick={addRow} className="case-stamp text-evidence">+ Add line</button>
          </div>
        </PaperCard>

        <PaperCard eyebrow="Section 03" title="Public proof links">
          <Field label="One URL per line (optional)">
            <textarea className="input font-mono min-h-[80px]" value={publicProofLinks} onChange={e => setPublicProofLinks(e.target.value)} />
          </Field>
          <Field label="Risk disclosure"><textarea className="input" value={riskDisclosure} onChange={e => setRiskDisclosure(e.target.value)} placeholder="What's deliberately not public, and why." /></Field>
        </PaperCard>

        <PaperCard eyebrow="Section 04" title="Sanitised evidence">
          <p className="text-sm text-deeptext/70">
            Raw private documents (medical records, identity documents, full receipts) must never appear here.
            Submit a written summary — validators reason about your summary, not the source documents.
          </p>
          <div className="grid gap-4 mt-3">
            <Field label="Evidence summary *">
              <textarea className="input min-h-[100px]" value={evidenceSummary} onChange={e => setEvidenceSummary(e.target.value)} placeholder="What documents you reviewed and what they show, in plain English." />
            </Field>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Proof type">
                <select className="input" value={proofType} onChange={e => setProofType(e.target.value)}>
                  {PROOF_TYPES.map(p => <option key={p} value={p}>{p.replace(/_/g, " ")}</option>)}
                </select>
              </Field>
              <Field label="Document hash (optional)"><input className="input font-mono" value={documentHash} onChange={e => setDocumentHash(e.target.value)} placeholder="sha256:…" /></Field>
              <Field label="Beneficiary relationship"><input className="input" value={beneficiaryRelationship} onChange={e => setBeneficiaryRelationship(e.target.value)} placeholder="Creator is a family member of the beneficiary" /></Field>
              <Field label="Third-party verification"><input className="input" value={thirdPartyVerification} onChange={e => setThirdPartyVerification(e.target.value)} placeholder="Community association confirmed the beneficiary identity" /></Field>
              <Field label="Social proof summary" className="md:col-span-2">
                <textarea className="input" value={socialProofSummary} onChange={e => setSocialProofSummary(e.target.value)} placeholder="Creator has a public community presence and prior verifiable activity" />
              </Field>
              <Field label="Redaction statement *" className="md:col-span-2">
                <textarea className="input" value={redactionStatement} onChange={e => setRedactionStatement(e.target.value)} />
              </Field>
            </div>
          </div>
        </PaperCard>

        <PaperCard eyebrow="Section 05" title="Disclosure and consent">
          <p className="text-sm text-deeptext/80">
            By submitting this case file, you confirm the information is accurate to the best of your knowledge,
            that no raw private documents appear on-chain, and that Judgix is a public review layer, not a legal
            guarantee or donation platform.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            I confirm the above statement.
          </label>
        </PaperCard>

        {busy && stage && (
          <div className="paper-card p-4 border-cyan/40">
            <div className="case-stamp text-evidence">Working</div>
            <p className="text-sm mt-1">{stage}</p>
          </div>
        )}
        {error && (
          <div className="border border-raspberry/30 bg-raspberry/10 text-raspberry rounded-md p-3 text-sm whitespace-pre-wrap">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={busy || !connected} className="bg-coral text-cloud px-5 py-3 rounded-md font-medium disabled:opacity-60">
            {busy ? "Working…" : connected ? "Open case file" : "Enter Judgix to continue"}
          </button>
        </div>
      </form>

      <p className="text-xs text-slate mt-8 text-center">
        Need to come back? Your draft is saved on this device. <Link href="/campaigns" className="underline">Skip to trust reports →</Link>
      </p>

      <style jsx>{`
        .input { width: 100%; border: 1px solid #DCE9F2; background: white; padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.9rem; }
        .input:focus { outline: 2px solid #22D3EE; outline-offset: 1px; }
      `}</style>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="case-stamp text-slate">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
