// End-to-end smoke test driving the Judgix contract through the local proxy.
// Run while `npm run dev` is up:    node scripts/e2e.mjs
//
// Optional: pass an existing funded private key as PRIVATE_KEY env var so the
// writes have gas. Otherwise the script generates a fresh key and most writes
// will fail at the gas check, which is itself a useful smoke signal.

import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { localnet } from "genlayer-js/chains";

const ENDPOINT = process.env.JUDGIX_RPC || "http://localhost:3000/api/genlayer";
const CONTRACT = process.env.JUDGIX_ADDRESS || "0x479047Ecf0Ead0cC072c9fE10F8605ae4E23D2f8";

const STUDIO_CHAIN = {
  ...localnet,
  id: 6199,
  name: "GenLayer Studio Network",
  rpcUrls: { default: { http: [ENDPOINT] } },
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
};

const PK = (process.env.PRIVATE_KEY || generatePrivateKey());
const account = createAccount(PK);

const writer = createClient({ chain: STUDIO_CHAIN, endpoint: ENDPOINT, account });
const reader = createClient({
  chain: STUDIO_CHAIN, endpoint: ENDPOINT,
  account: createAccount(generatePrivateKey()),
});

const CAMPAIGN_ID = `JDX-E2E-${Date.now().toString(36).toUpperCase()}`;
const UPDATE_ID = `UPD-E2E-${Date.now().toString(36).toUpperCase()}`;
const DISPUTE_ID = `DSP-E2E-${Date.now().toString(36).toUpperCase()}`;

function step(label) {
  console.log(`\n=== ${label} ===`);
}

function ok(label, value) {
  console.log(`  ✓ ${label}${value !== undefined ? ` → ${value}` : ""}`);
}

function fail(label, err) {
  const msg = String(err?.shortMessage || err?.message || err);
  console.log(`  ✗ ${label} — ${msg.slice(0, 220)}`);
}

async function readView(name, args = []) {
  return await reader.readContract({ address: CONTRACT, functionName: name, args });
}

async function writeMethod(name, args = []) {
  const hash = await writer.writeContract({
    address: CONTRACT, functionName: name, args, value: 0n,
  });
  let receipt = null;
  try {
    receipt = await writer.waitForTransactionReceipt({ hash });
  } catch (e) {
    // tolerate the known calldata-decoder bug; the hash is the truth
    if (!/out of bounds|position|invalid (utf-8|byte)|unexpected end/i.test(String(e?.message))) throw e;
  }
  return { hash, receipt };
}

async function pollFor(reader, intervalMs = 4000, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const v = await reader();
      if (v && v !== "") return v;
    } catch {}
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

async function main() {
  console.log(`Judgix E2E smoke test`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Contract: ${CONTRACT}`);
  console.log(`Wallet:   ${account.address}`);
  console.log(`Private:  ${PK}`);
  console.log(`Campaign id: ${CAMPAIGN_ID}`);

  // ---- 1. Read-only ping ----
  step("1 · Read get_protocol_stats");
  try {
    const stats = await readView("get_protocol_stats");
    ok("protocol_stats", typeof stats === "string" ? stats.slice(0, 200) : JSON.stringify(stats).slice(0, 200));
  } catch (e) { fail("get_protocol_stats", e); }

  // ---- 2. create_campaign ----
  step("2 · create_campaign");
  const payload = {
    title: "E2E Smoke Test Campaign",
    creator: account.address,
    category: "Medical",
    country: "Nigeria",
    funding_goal: "4500",
    currency: "USD",
    beneficiary: "Adaeze Okonkwo",
    wallet_address: account.address,
    story: "Adaeze was diagnosed with a stage II tumour and requires urgent surgery. This is a Judgix end-to-end smoke test payload.",
    use_of_funds: "Surgical fees ($3,200), post-operative care ($800), medication ($500).",
    problem_statement: "Surgery required within 30 days.",
    who_benefits: "Adaeze Okonkwo, 34, mother of two.",
    timeline_of_events: "Diagnosis 2026-04-12. Surgery scheduled 2026-07-02.",
    evidence: [{ id: "e1", type: "MEDICAL_DOCUMENT", title: "Diagnosis", description: "Redacted", uri: "ipfs://e2e-test", date: "2026-04-12", sourceName: "Lagos General Hospital" }],
    public_signals: [{ platform: "x", url: "https://x.com/test" }],
  };
  let createHash;
  try {
    const r = await writeMethod("create_campaign", [CAMPAIGN_ID, JSON.stringify(payload)]);
    createHash = r.hash;
    ok("hash", createHash);
  } catch (e) { fail("create_campaign", e); return; }

  // ---- 3. Confirm create by reading ----
  step("3 · Poll get_campaign");
  const campaignJson = await pollFor(() => readView("get_campaign", [CAMPAIGN_ID]).then(v => typeof v === "string" ? v : ""));
  if (!campaignJson) { fail("get_campaign", new Error("not visible after 4 min")); return; }
  ok("get_campaign", campaignJson.slice(0, 200) + "…");

  // ---- 4. submit_campaign_for_review ----
  step("4 · submit_campaign_for_review");
  try {
    const r = await writeMethod("submit_campaign_for_review", [CAMPAIGN_ID]);
    ok("hash", r.hash);
  } catch (e) { fail("submit_campaign_for_review", e); }

  // ---- 5. review_campaign ----
  step("5 · review_campaign (GenLayer consensus)");
  try {
    const r = await writeMethod("review_campaign", [CAMPAIGN_ID]);
    ok("hash", r.hash);
  } catch (e) { fail("review_campaign", e); return; }

  // ---- 6. Poll for verdict ----
  step("6 · Poll get_campaign_review");
  const verdictJson = await pollFor(() => readView("get_campaign_review", [CAMPAIGN_ID]).then(v => typeof v === "string" ? v : ""));
  if (!verdictJson) { fail("get_campaign_review", new Error("no verdict in 4 min")); return; }
  ok("verdict", verdictJson.slice(0, 400) + "…");

  // ---- 7. list_campaigns should include it ----
  step("7 · list_campaigns includes new id");
  try {
    const listRaw = await readView("list_campaigns", ["0", "500"]);
    const list = typeof listRaw === "string" ? JSON.parse(listRaw) : listRaw;
    ok("count", Array.isArray(list) ? list.length : "n/a");
    ok("includes new id?", Array.isArray(list) && list.includes(CAMPAIGN_ID));
  } catch (e) { fail("list_campaigns", e); }

  // ---- 8. Creator reputation reflects 1 campaign ----
  step("8 · get_creator_reputation");
  try {
    const rep = await readView("get_creator_reputation", [account.address]);
    ok("reputation", typeof rep === "string" ? rep.slice(0, 200) : JSON.stringify(rep).slice(0, 200));
  } catch (e) { fail("get_creator_reputation", e); }

  // ---- 9. submit_update ----
  step("9 · submit_update");
  try {
    const r = await writeMethod("submit_update", [UPDATE_ID, CAMPAIGN_ID, JSON.stringify({
      title: "E2E partial progress",
      body: "Tuition partially paid. Receipt attached.",
      amount_spent: "1200",
      evidence_links: ["ipfs://e2e-receipt"],
      fund_usage_explanation: "Direct to hospital.",
      next_steps: "Continue raising.",
    })]);
    ok("hash", r.hash);
  } catch (e) { fail("submit_update", e); }

  step("10 · review_update");
  try {
    const r = await writeMethod("review_update", [UPDATE_ID]);
    ok("hash", r.hash);
  } catch (e) { fail("review_update", e); }

  step("11 · Poll get_update_review");
  const upd = await pollFor(() => readView("get_update_review", [UPDATE_ID]).then(v => typeof v === "string" ? v : ""));
  if (upd) ok("update verdict", upd.slice(0, 300) + "…"); else fail("get_update_review", new Error("no verdict in 4 min"));

  // ---- 12. flag + resolve_dispute (owner only — will likely fail for fresh wallets) ----
  step("12 · flag_campaign");
  try {
    const r = await writeMethod("flag_campaign", [DISPUTE_ID, CAMPAIGN_ID, JSON.stringify({
      reason: "Plagiarised campaign",
      description: "E2E smoke flag for testing. Not a real concern.",
      evidence: "https://example.com/source",
      severity: "MEDIUM",
    })]);
    ok("hash", r.hash);
  } catch (e) { fail("flag_campaign", e); }

  step("13 · resolve_dispute (owner-only — may fail)");
  try {
    const r = await writeMethod("resolve_dispute", [DISPUTE_ID]);
    ok("hash", r.hash);
    const dr = await pollFor(() => readView("get_dispute_review", [DISPUTE_ID]).then(v => typeof v === "string" ? v : ""));
    if (dr) ok("dispute verdict", dr.slice(0, 300) + "…");
  } catch (e) { fail("resolve_dispute", e); }

  console.log("\n=== Done ===");
  console.log(`Campaign id: ${CAMPAIGN_ID}`);
  console.log(`Wallet:      ${account.address}`);
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
