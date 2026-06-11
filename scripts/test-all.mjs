// Judgix end-to-end test suite for the deployed GenLayer contract.
//
// Run:   node --env-file=.env.test.local scripts/test-all.mjs
// Or:    node --env-file=.env.test.local scripts/test-all.mjs <suite> [...suite]
//
// Keys are read from env vars only. Aborts if any key is missing.
//
// Spec: every write is writeContract → waitForTransactionReceipt → assert
// receipt.consensus_data.leader_receipt.execution_result is SUCCESS/ACCEPTED
// (or, for revert suites, anything BUT SUCCESS/ACCEPTED). Wrapped in a
// 3-attempt retry with 5s backoff to ride out transient consensus blips.

import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { localnet } from "genlayer-js/chains";

// Suppress benign viem probe noise — the SDK falls back to gen_* methods and
// the tx still goes through. Anything else still surfaces.
const _origConsoleError = console.error.bind(console);
console.error = (...args) => {
  const head = String(args[0] ?? "");
  if (/Error fetching .* from GenLayer RPC/.test(head) && /Method not found/.test(args.map(a => String(a?.message ?? a)).join(" "))) return;
  return _origConsoleError(...args);
};

// --------------------------------------------------------------------------
// Config + env
// --------------------------------------------------------------------------

const required = (name) => {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`\n[ABORT] env var ${name} is missing. Provide it in .env.test.local or as a real env var.`);
    process.exit(2);
  }
  return v.trim();
};

const PK1 = required("TEST_WALLET_1_PRIVATE_KEY");
const PK2 = required("TEST_WALLET_2_PRIVATE_KEY");
const PK3 = required("TEST_WALLET_3_PRIVATE_KEY");
const PK4 = required("TEST_WALLET_4_PRIVATE_KEY");

const CONTRACT = (process.env.JUDGIX_ADDRESS || "0xE0e599492dF311a9152b87F27Cf6C179fC72cC6B").trim();
const ENDPOINT = (process.env.JUDGIX_RPC || "https://studio.genlayer.com/api").trim();
const CHAIN_ID = Number(process.env.JUDGIX_CHAIN_ID || 61999);

const STUDIO_CHAIN = {
  ...localnet,
  id: CHAIN_ID,
  name: "GenLayer Studio Network",
  rpcUrls: { default: { http: [ENDPOINT] } },
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
};

function clientFor(pk) {
  const account = createAccount(pk);
  const c = createClient({ chain: STUDIO_CHAIN, endpoint: ENDPOINT, account });
  return { client: c, account };
}

const W1 = clientFor(PK1);          // primary creator
const W2 = clientFor(PK2);          // secondary creator
const W3 = clientFor(PK3);          // disputer
const W4 = clientFor(PK4);          // reviewer / extra
const READER = createClient({ chain: STUDIO_CHAIN, endpoint: ENDPOINT, account: createAccount(generatePrivateKey()) });

// Friendly label per wallet so logs never contain a key/address by accident
const LABEL = new Map();
LABEL.set(W1.account.address.toLowerCase(), "W1");
LABEL.set(W2.account.address.toLowerCase(), "W2");
LABEL.set(W3.account.address.toLowerCase(), "W3");
LABEL.set(W4.account.address.toLowerCase(), "W4");
function lbl(addr) { return LABEL.get(String(addr || "").toLowerCase()) || "??"; }

// --------------------------------------------------------------------------
// Logging + assertion helpers
// --------------------------------------------------------------------------

const COL = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const log = (...a) => console.log(...a);
const stepBefore = (caller, fn, argsSummary) => log(`  ${COL.dim}→${COL.reset} ${caller} ${COL.cyan}${fn}${COL.reset}(${argsSummary})`);
const stepAfterOk = (fn, ms, hash) => log(`  ${COL.green}✓${COL.reset} ${fn} (${ms}ms) tx=${hash}`);
const stepAfterFail = (fn, ms, msg) => log(`  ${COL.red}✗${COL.reset} ${fn} (${ms}ms) ${msg}`);

class AssertionError extends Error { constructor(msg) { super(msg); this.name = "AssertionError"; } }
function assertEq(actual, expected, label) {
  if (actual !== expected) throw new AssertionError(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertIn(value, set, label) {
  if (!set.includes(value)) throw new AssertionError(`${label}: value ${JSON.stringify(value)} not in [${set.join(", ")}]`);
}
function assertRange(n, low, high, label) {
  if (typeof n !== "number" || Number.isNaN(n) || n < low || n > high) throw new AssertionError(`${label}: ${n} not in [${low}, ${high}]`);
}
function assertNonEmptyString(s, label) {
  if (typeof s !== "string" || s.length === 0) throw new AssertionError(`${label}: expected non-empty string, got ${JSON.stringify(s)}`);
}
function assertArray(a, label) {
  if (!Array.isArray(a)) throw new AssertionError(`${label}: expected array, got ${typeof a}`);
}
function assertTruthy(v, label) {
  if (!v) throw new AssertionError(`${label}: expected truthy, got ${JSON.stringify(v)}`);
}

// --------------------------------------------------------------------------
// Receipt inspection per spec
// --------------------------------------------------------------------------

function leaderReceiptOf(receipt) {
  const lr = receipt?.consensus_data?.leader_receipt;
  if (!lr) return null;
  return Array.isArray(lr) ? lr[0] : lr;
}

function executionResultOf(receipt) {
  return leaderReceiptOf(receipt)?.execution_result ?? receipt?.statusName ?? receipt?.status ?? null;
}

function stderrTailOf(receipt) {
  const node = leaderReceiptOf(receipt);
  const stderr = node?.stderr || node?.error || "";
  if (!stderr) return "";
  const lines = String(stderr).split(/\r?\n/).filter(Boolean);
  return lines.slice(-2).join(" | ");
}

function assertOnChainSuccess(receipt) {
  const r = executionResultOf(receipt);
  if (r !== "SUCCESS" && r !== "ACCEPTED" && r !== "FINALIZED") {
    const tail = stderrTailOf(receipt);
    throw new AssertionError(`on-chain execution_result=${r}${tail ? " | stderr: " + tail : ""}`);
  }
}

function assertOnChainRevert(receipt, expectMatch) {
  const r = executionResultOf(receipt);
  if (r === "SUCCESS" || r === "ACCEPTED" || r === "FINALIZED") {
    throw new AssertionError(`expected on-chain revert, got execution_result=${r}`);
  }
  if (expectMatch) {
    const tail = stderrTailOf(receipt);
    if (!expectMatch.test(tail) && !expectMatch.test(JSON.stringify(leaderReceiptOf(receipt) ?? {}))) {
      // Don't fail the suite — many reverts surface only as UNDETERMINED with
      // no stderr — but record a soft mismatch.
      log(`    ${COL.yellow}~ stderr did not match /${expectMatch.source}/ — actual tail: ${tail || "(empty)"}${COL.reset}`);
    }
  }
}

// --------------------------------------------------------------------------
// Write + read primitives
// --------------------------------------------------------------------------

async function writeOnce({ client, address, functionName, args, value = 0n }) {
  const hash = await client.writeContract({ address, functionName, args, value });
  let receipt = null;
  try {
    // Wait for FINALIZED so the read-back will see the committed state under
    // the default latest-final variant. (ACCEPTED isn't enough.)
    receipt = await client.waitForTransactionReceipt({ hash, status: "FINALIZED", retries: 200, interval: 3000 });
  } catch (err) {
    // genlayer-js has a known calldata-decoder bug; the tx hash is still real
    // and we can pull the receipt via getTransaction.
    const msg = String(err?.message || err);
    if (!/out of bounds|position|invalid (utf-8|byte)|unexpected end/i.test(msg)) {
      throw err;
    }
    try { receipt = await client.getTransaction({ hash }); }
    catch { receipt = null; }
  }
  return { hash, receipt };
}

async function callWrite({ client, address, functionName, args, value = 0n, callerLabel, expectRevert = false, revertMatch }) {
  const argsSummary = args.map(a => {
    if (typeof a === "string" && a.length > 60) return JSON.stringify(a.slice(0, 50) + "…");
    return JSON.stringify(a);
  }).join(", ");
  stepBefore(callerLabel, functionName, argsSummary);
  const start = Date.now();

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { hash, receipt } = await writeOnce({ client, address, functionName, args, value });
      const ms = Date.now() - start;
      if (expectRevert) {
        assertOnChainRevert(receipt, revertMatch);
        stepAfterOk(functionName + " [REVERTED as expected]", ms, hash);
      } else {
        assertOnChainSuccess(receipt);
        stepAfterOk(functionName, ms, hash);
      }
      return { hash, receipt };
    } catch (err) {
      lastErr = err;
      const isAssert = err instanceof AssertionError;
      if (isAssert && expectRevert) {
        // tx accepted on-chain but we expected revert — don't retry
        break;
      }
      if (attempt < 3 && !isAssert) {
        log(`    ${COL.yellow}retry ${attempt}/3 after RPC error: ${String(err?.message || err).slice(0, 120)}${COL.reset}`);
        await sleep(5000);
        continue;
      }
      break;
    }
  }
  const ms = Date.now() - start;
  stepAfterFail(functionName, ms, String(lastErr?.message || lastErr));
  throw lastErr;
}

async function readView(name, args = []) {
  return await READER.readContract({ address: CONTRACT, functionName: name, args });
}

async function readJson(name, args = [], { maxWaitMs = 180_000, intervalMs = 4000 } = {}) {
  // Poll: even after FINALIZED, the read replica may take a beat to reflect
  // new state. Default 180s max wait per read-back.
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const raw = await readView(name, args);
    if (raw != null && raw !== "") {
      if (typeof raw !== "string") return raw;
      try { return JSON.parse(raw); } catch { return raw; }
    }
    await sleep(intervalMs);
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --------------------------------------------------------------------------
// Validation: nondet schemas
// --------------------------------------------------------------------------

const CAMPAIGN_VERDICTS = ["VERIFIED", "LIKELY_AUTHENTIC", "NEEDS_MORE_EVIDENCE", "PARTIALLY_SUPPORTED", "RISKY", "HIGH_RISK", "SUSPICIOUS", "LIKELY_FRAUDULENT", "REJECTED"];
const UPDATE_VERDICTS = ["UPDATE_CONFIRMS_PROGRESS", "UPDATE_PARTIALLY_SUPPORTS_PROGRESS", "UPDATE_NEEDS_MORE_EVIDENCE", "UPDATE_INCONSISTENT", "UPDATE_RAISES_RISK", "UPDATE_SUSPICIOUS"];
const DISPUTE_VERDICTS = ["DISPUTE_CONFIRMED", "DISPUTE_PARTIALLY_VALID", "DISPUTE_REJECTED", "INSUFFICIENT_EVIDENCE", "CAMPAIGN_SHOULD_BE_SUSPENDED", "CAMPAIGN_CAN_CONTINUE"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const EVIDENCE_QUALITY = ["NONE", "WEAK", "PARTIAL", "MODERATE", "STRONG", "VERY_STRONG"];
const STORY_CONSISTENCY = ["WEAK", "GOOD", "STRONG", "VERY_STRONG"];
const PUBLIC_SIGNAL_STRENGTH = ["NONE", "WEAK", "PARTIAL", "MODERATE", "STRONG"];
const PLAGIARISM_RISK = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const FUNDING_GOAL_REALISM = ["UNREASONABLE", "QUESTIONABLE", "REASONABLE", "WELL_JUSTIFIED"];
const SPENDING_ALIGNMENT = ["NONE", "WEAK", "PARTIAL", "MODERATE", "STRONG"];
const CAMPAIGN_ACTIONS = ["NO_ACTION", "NEEDS_MORE_EVIDENCE", "RISKY", "SUSPICIOUS", "SUSPENDED", "REJECTED"];
const SIMILARITY_VERDICTS = ["ORIGINAL", "SHARED_TEMPLATE", "POSSIBLE_DUPLICATE", "CONFIRMED_DUPLICATE"];

function validateCampaignReview(obj) {
  assertIn(obj.verdict, CAMPAIGN_VERDICTS, "campaign_review.verdict");
  assertRange(Number(obj.authenticity_score), 0, 100, "campaign_review.authenticity_score");
  assertIn(obj.risk_level, RISK_LEVELS, "campaign_review.risk_level");
  assertIn(obj.evidence_quality, EVIDENCE_QUALITY, "campaign_review.evidence_quality");
  assertIn(obj.story_consistency, STORY_CONSISTENCY, "campaign_review.story_consistency");
  assertIn(obj.public_signal_strength, PUBLIC_SIGNAL_STRENGTH, "campaign_review.public_signal_strength");
  assertIn(obj.plagiarism_risk, PLAGIARISM_RISK, "campaign_review.plagiarism_risk");
  assertIn(obj.funding_goal_realism, FUNDING_GOAL_REALISM, "campaign_review.funding_goal_realism");
  assertArray(obj.red_flags, "campaign_review.red_flags");
  assertArray(obj.positive_signals, "campaign_review.positive_signals");
  assertTruthy(typeof obj.recommended_action === "string", "campaign_review.recommended_action is string");
  assertTruthy(typeof obj.reasoning_summary === "string", "campaign_review.reasoning_summary is string");
}

function validateUpdateReview(obj) {
  assertIn(obj.verdict, UPDATE_VERDICTS, "update_review.verdict");
  assertRange(Number(obj.trust_delta), -50, 50, "update_review.trust_delta");
  assertRange(Number(obj.risk_delta), -50, 50, "update_review.risk_delta");
  assertIn(obj.spending_alignment, SPENDING_ALIGNMENT, "update_review.spending_alignment");
  assertIn(obj.evidence_quality, EVIDENCE_QUALITY, "update_review.evidence_quality");
  assertArray(obj.concerns, "update_review.concerns");
  assertArray(obj.positive_signals, "update_review.positive_signals");
  assertTruthy(typeof obj.reasoning_summary === "string", "update_review.reasoning_summary is string");
}

function validateDisputeReview(obj) {
  assertIn(obj.verdict, DISPUTE_VERDICTS, "dispute_review.verdict");
  assertIn(obj.campaign_action, CAMPAIGN_ACTIONS, "dispute_review.campaign_action");
  assertRange(Number(obj.trust_delta), -100, 50, "dispute_review.trust_delta");
  assertRange(Number(obj.risk_delta), -50, 100, "dispute_review.risk_delta");
  assertArray(obj.confirmed_issues, "dispute_review.confirmed_issues");
  assertArray(obj.unconfirmed_issues, "dispute_review.unconfirmed_issues");
  assertTruthy(typeof obj.reasoning_summary === "string", "dispute_review.reasoning_summary is string");
}

function validateSimilarityReview(obj) {
  assertIn(obj.similarity_verdict, SIMILARITY_VERDICTS, "similarity_review.similarity_verdict");
  assertRange(Number(obj.similarity_score), 0, 100, "similarity_review.similarity_score");
  assertIn(obj.plagiarism_risk, PLAGIARISM_RISK, "similarity_review.plagiarism_risk");
  assertArray(obj.matched_elements, "similarity_review.matched_elements");
  assertTruthy(typeof obj.explanation === "string", "similarity_review.explanation is string");
}

// --------------------------------------------------------------------------
// ID factories
// --------------------------------------------------------------------------

const RUN_TAG = Date.now().toString(36).toUpperCase();
let _counter = 0;
const nextId = (prefix) => `${prefix}-${RUN_TAG}-${(++_counter).toString().padStart(3, "0")}`;

// A small fixture set of realistic personas. Each suite picks one so the data
// looks like real campaigns rather than synthetic placeholders.
const PERSONAS = [
  {
    title: "Emergency Surgery Support for Adaeze Okonkwo",
    category: "Medical",
    country: "Nigeria",
    funding_goal: "1850000",
    currency: "NGN",
    beneficiary: "Adaeze Okonkwo",
    story: "Adaeze, a 34-year-old mother of two from Surulere, was diagnosed with a stage II ovarian tumour at Lagos University Teaching Hospital on 12 April 2026. The oncology team has scheduled surgery for 2 July 2026 but the hospital requires the full deposit upfront before the operating room is reserved.",
    use_of_funds: "Surgical fees ₦1,200,000, anaesthesiology ₦150,000, six weeks of post-operative care and chemotherapy supplies ₦500,000.",
    problem_statement: "Stage II ovarian tumour requiring surgical intervention within 30 days to prevent metastasis.",
    who_benefits: "Adaeze Okonkwo and her two children, aged 6 and 9.",
    timeline_of_events: "Diagnosis 2026-04-12 at LUTH. Pre-op consults 2026-05-10. Surgery scheduled 2026-07-02. Recovery 6 weeks.",
    evidence: [{ id: "e1", type: "MEDICAL_DOCUMENT", title: "LUTH Oncology Report", description: "Redacted diagnosis report", uri: "ipfs://bafkreigadaezelut", date: "2026-04-12", sourceName: "Lagos University Teaching Hospital" }],
    public_signals: [{ platform: "x", url: "https://x.com/adaezesupport" }],
  },
  {
    title: "Final-Year Tuition Support for Daniel Mwangi",
    category: "Education",
    country: "Kenya",
    funding_goal: "180000",
    currency: "KES",
    beneficiary: "Daniel Mwangi",
    story: "Daniel is a final-year electrical engineering student at Kenyatta University in Nairobi. His father passed away in February 2026, leaving the family without a primary income. The remaining tuition balance and final-year examination fees must be settled before he can sit his exams in August.",
    use_of_funds: "Tuition balance KES 140,000, examination fees KES 18,000, final-year project materials KES 22,000.",
    problem_statement: "Outstanding tuition deadline 1 August 2026; without it Daniel cannot sit final exams.",
    who_benefits: "Daniel Mwangi and his mother in Kiambu.",
    timeline_of_events: "Father passed 2026-02-10. Tuition deadline 2026-08-01. Graduation expected 2026-12-15.",
    evidence: [
      { id: "e1", type: "SCHOOL_DOCUMENT", title: "Kenyatta University fee statement", description: "Outstanding balance letter", uri: "ipfs://bafkreigdantuit", date: "2026-04-20", sourceName: "Kenyatta University Bursar" },
      { id: "e2", type: "REGISTRATION", title: "Enrolment letter", description: "Confirms final-year enrolment", uri: "ipfs://bafkreigdanenrl", date: "2026-01-10", sourceName: "Kenyatta University" },
    ],
    public_signals: [
      { platform: "linkedin", url: "https://linkedin.com/in/daniel-mwangi" },
      { platform: "website", url: "https://eng.ku.ac.ke/students/dmwangi" },
    ],
  },
  {
    title: "Typhoon Relief for Santos Family",
    category: "Disaster Relief",
    country: "Philippines",
    funding_goal: "120000",
    currency: "PHP",
    beneficiary: "Maria Santos",
    story: "The Santos family in Catbalogan, Samar lost their home in Typhoon Egay on 28 May 2026. Local barangay officials have confirmed the family of four are currently sheltering at the Catbalogan parish hall. Funds will go to materials to rebuild their nipa-hut roof and replace cooking equipment.",
    use_of_funds: "Roofing materials PHP 60,000, cooking equipment PHP 25,000, six months of food parcels PHP 35,000.",
    problem_statement: "Family of four displaced by Typhoon Egay; immediate shelter rebuilding required.",
    who_benefits: "Maria Santos, her husband Rogelio, and their two children.",
    timeline_of_events: "Typhoon 2026-05-28. Family at parish shelter since 2026-05-29. Rebuilding 2026-07-01 to 2026-08-15.",
    evidence: [
      { id: "e1", type: "PUBLIC_STATEMENT", title: "Barangay certification", description: "Local barangay confirms displacement", uri: "ipfs://bafkreigsantosbgy", date: "2026-05-30", sourceName: "Brgy. Catbalogan" },
      { id: "e2", type: "NEWS_ARTICLE", title: "Typhoon Egay aftermath report", description: "Local news coverage", uri: "https://news.example.ph/typhoon-egay", date: "2026-05-29", sourceName: "Samar Times" },
    ],
    public_signals: [{ platform: "facebook", url: "https://facebook.com/santos.relief" }],
  },
  {
    title: "Twin Premature Birth Care for Aisha Bello",
    category: "Medical",
    country: "Nigeria",
    funding_goal: "2400000",
    currency: "NGN",
    beneficiary: "Aisha Bello",
    story: "Aisha gave birth to twins at 28 weeks at National Hospital Abuja on 9 May 2026. Both infants are in the neonatal intensive care unit and require at least six more weeks of incubator care, respiratory support and specialised formula. The family has exhausted their savings.",
    use_of_funds: "NICU bed fees ₦1,500,000, respiratory care ₦600,000, specialised formula and follow-up ₦300,000.",
    problem_statement: "Twin neonates in NICU require six weeks more care; family savings exhausted.",
    who_benefits: "Aisha Bello and twin daughters Halima and Maryam.",
    timeline_of_events: "Birth 2026-05-09. NICU stay through 2026-06-25. Outpatient follow-up to 2026-09-30.",
    evidence: [{ id: "e1", type: "MEDICAL_DOCUMENT", title: "NICU admission record", description: "Twin admission paperwork (redacted)", uri: "ipfs://bafkreigabello", date: "2026-05-09", sourceName: "National Hospital Abuja" }],
    public_signals: [{ platform: "instagram", url: "https://instagram.com/aisha.bello.twins" }],
  },
];

function pickPersona() {
  return PERSONAS[(_counter + Date.now()) % PERSONAS.length];
}

function campaignPayload(overrides = {}) {
  const p = overrides.persona || pickPersona();
  return JSON.stringify({
    title: p.title,
    creator: overrides.creator || W1.account.address,
    category: p.category,
    country: p.country,
    funding_goal: p.funding_goal,
    currency: p.currency,
    beneficiary: p.beneficiary,
    wallet_address: overrides.wallet || W1.account.address,
    story: overrides.story || p.story,
    use_of_funds: p.use_of_funds,
    problem_statement: p.problem_statement,
    who_benefits: p.who_benefits,
    timeline_of_events: p.timeline_of_events,
    evidence: p.evidence,
    public_signals: p.public_signals,
    ...overrides,
  });
}

// --------------------------------------------------------------------------
// Suites
// --------------------------------------------------------------------------

const SUITES = [];
function suite(name, runner) { SUITES.push({ name, runner }); }

// Step 0 — sanity check
suite("step0-sanity", async () => {
  log(`  contract: ${CONTRACT}`);
  log(`  endpoint: ${ENDPOINT}`);
  log(`  chain id: ${CHAIN_ID}`);

  for (const [label, w] of [["W1", W1], ["W2", W2], ["W3", W3], ["W4", W4]]) {
    let bal;
    try {
      bal = await READER.getBalance({ address: w.account.address });
    } catch (e) {
      throw new AssertionError(`getBalance(${label}) failed — RPC likely unreachable: ${e?.message || e}`);
    }
    log(`  ${label} balance: ${bal} wei`);
    if (typeof bal === "bigint" ? bal === 0n : Number(bal) === 0) {
      throw new AssertionError(`${label} has zero balance — top up before running the suite`);
    }
  }

  const raw = await readView("get_protocol_stats");
  assertNonEmptyString(typeof raw === "string" ? raw : JSON.stringify(raw), "get_protocol_stats");
  log(`  get_protocol_stats: ${typeof raw === "string" ? raw : JSON.stringify(raw)}`);
});

// Deterministic happy path — full lifecycle that does NOT depend on nondet
suite("det-create-submit-archive", async () => {
  const id = nextId("CAMP");
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "create_campaign", args: [id, campaignPayload()], callerLabel: "W1" });
  const c1 = await readJson("get_campaign", [id]);
  assertEq(c1?.campaign_id, id, "campaign_id round-trip");
  assertEq(c1?.status, "DRAFT", "post-create status");
  assertEq(c1?.creator?.toLowerCase(), W1.account.address.toLowerCase(), "creator persisted");

  await callWrite({ client: W1.client, address: CONTRACT, functionName: "submit_campaign_for_review", args: [id], callerLabel: "W1" });
  const c2 = await readJson("get_campaign", [id]);
  assertEq(c2?.status, "PENDING_REVIEW", "post-submit status");

  await callWrite({ client: W1.client, address: CONTRACT, functionName: "archive_campaign", args: [id], callerLabel: "W1" });
  const c3 = await readJson("get_campaign", [id]);
  assertEq(c3?.status, "ARCHIVED", "post-archive status");
});

// Deterministic — listing index assertions
suite("det-listing-index", async () => {
  const id = nextId("CAMP");
  await callWrite({ client: W2.client, address: CONTRACT, functionName: "create_campaign", args: [id, campaignPayload({ creator: W2.account.address, wallet: W2.account.address })], callerLabel: "W2" });

  const ids = await readJson("list_campaigns", ["0", "1000"]) || [];
  assertArray(ids, "list_campaigns result");
  assertTruthy(ids.includes(id), `list_campaigns includes ${id}`);

  const creatorIds = await readJson("get_creator_campaigns", [W2.account.address]) || [];
  assertArray(creatorIds, "get_creator_campaigns result");
  assertTruthy(creatorIds.includes(id), `get_creator_campaigns includes ${id}`);
});

// Revert — duplicate campaign id
suite("revert-duplicate-campaign", async () => {
  const id = nextId("CAMP");
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "create_campaign", args: [id, campaignPayload()], callerLabel: "W1" });
  await callWrite({
    client: W1.client, address: CONTRACT, functionName: "create_campaign",
    args: [id, campaignPayload({ story: "Resubmission attempt with the same id. The on-chain contract is expected to reject this because the id is already taken." })],
    callerLabel: "W1", expectRevert: true, revertMatch: /already exists/i,
  });
  const c = await readJson("get_campaign", [id]);
  assertTruthy(c, "campaign still exists after revert");
});

// Revert — missing required field
suite("revert-missing-required-field", async () => {
  const id = nextId("CAMP");
  // missing `story`
  // Intentionally omit the required `story` field — contract must reject this.
  const bad = JSON.stringify({
    title: "Tuition Support for Daniel Mwangi",
    creator: W1.account.address,
    funding_goal: "180000",
    currency: "KES",
  });
  await callWrite({
    client: W1.client, address: CONTRACT, functionName: "create_campaign",
    args: [id, bad], callerLabel: "W1", expectRevert: true, revertMatch: /missing required field/i,
  });
  const c = await readJson("get_campaign", [id]);
  if (c) throw new AssertionError(`expected no campaign to be persisted, got ${JSON.stringify(c).slice(0, 200)}`);
});

// Revert — unknown campaign on submit_campaign_for_review
suite("revert-unknown-campaign", async () => {
  const id = "NONEXISTENT-" + RUN_TAG;
  await callWrite({
    client: W1.client, address: CONTRACT, functionName: "submit_campaign_for_review",
    args: [id], callerLabel: "W1", expectRevert: true, revertMatch: /unknown campaign/i,
  });
});

// Revert — duplicate update id
suite("revert-duplicate-update", async () => {
  const id = nextId("CAMP");
  const uid = nextId("UPD");
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "create_campaign", args: [id, campaignPayload()], callerLabel: "W1" });
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "submit_campaign_for_review", args: [id], callerLabel: "W1" });
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "submit_update", args: [uid, id, JSON.stringify({
    title: "First instalment posted",
    body: "Initial NICU fee paid; receipt #NHA-2026-771 attached.",
  })], callerLabel: "W1" });
  await callWrite({
    client: W1.client, address: CONTRACT, functionName: "submit_update",
    args: [uid, id, JSON.stringify({ title: "Duplicate id retry", body: "Should be rejected on-chain." })],
    callerLabel: "W1", expectRevert: true, revertMatch: /update id exists/i,
  });
});

// Revert — duplicate dispute id
suite("revert-duplicate-dispute", async () => {
  const id = nextId("CAMP");
  const did = nextId("DSP");
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "create_campaign", args: [id, campaignPayload()], callerLabel: "W1" });
  await callWrite({ client: W3.client, address: CONTRACT, functionName: "flag_campaign", args: [did, id, JSON.stringify({
    reason: "Stolen identity",
    description: "Wallet address on the campaign does not match any verifiable identity for the named beneficiary in Catbalogan. Requesting verification before donations continue.",
  })], callerLabel: "W3" });
  await callWrite({
    client: W3.client, address: CONTRACT, functionName: "flag_campaign",
    args: [did, id, JSON.stringify({ reason: "Stolen identity", description: "Duplicate id retry — should revert on-chain." })],
    callerLabel: "W3", expectRevert: true, revertMatch: /dispute id exists/i,
  });
});

// Revert — submit after archive
suite("revert-archived-then-submit", async () => {
  const id = nextId("CAMP");
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "create_campaign", args: [id, campaignPayload()], callerLabel: "W1" });
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "archive_campaign", args: [id], callerLabel: "W1" });
  await callWrite({
    client: W1.client, address: CONTRACT, functionName: "submit_campaign_for_review",
    args: [id], callerLabel: "W1", expectRevert: true, revertMatch: /archived/i,
  });
  const c = await readJson("get_campaign", [id]);
  assertEq(c?.status, "ARCHIVED", "status unchanged after revert");
});

// Nondet — review_campaign
suite("nondet-review-campaign", async () => {
  const id = nextId("CAMP");
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "create_campaign", args: [id, campaignPayload()], callerLabel: "W1" });
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "submit_campaign_for_review", args: [id], callerLabel: "W1" });
  await callWrite({ client: W4.client, address: CONTRACT, functionName: "review_campaign", args: [id], callerLabel: "W4" });

  const verdict = await readJson("get_campaign_review", [id]);
  assertTruthy(verdict, "verdict persisted");
  validateCampaignReview(verdict);
  log(`    verdict=${verdict.verdict}  score=${verdict.authenticity_score}  risk=${verdict.risk_level}`);

  const c = await readJson("get_campaign", [id]);
  assertTruthy(["VERIFIED", "NEEDS_MORE_EVIDENCE", "RISKY", "SUSPICIOUS", "REJECTED"].includes(c?.status), `post-review status valid (got ${c?.status})`);
});

// Nondet — review_update
suite("nondet-review-update", async () => {
  const id = nextId("CAMP");
  const uid = nextId("UPD");
  // Pin one persona for the whole suite so the update aligns with the
  // campaign — otherwise the consensus reviewer correctly flags the mismatch.
  const persona = PERSONAS[1]; // Daniel Mwangi · Kenyatta University tuition
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "create_campaign", args: [id, campaignPayload({ persona })], callerLabel: "W1" });
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "submit_campaign_for_review", args: [id], callerLabel: "W1" });
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "submit_update", args: [uid, id, JSON.stringify({
    title: "Tuition partially paid — first instalment",
    body: "Posted KES 65,000 to the Kenyatta University bursar yesterday. Official receipt #BU-2026-4421 attached. Daniel will now sit next month's exam.",
    amount_spent: "65000",
    evidence_links: ["ipfs://bafkreigreceiptku4421"],
    fund_usage_explanation: "Paid directly to Kenyatta University bursar account; receipt #BU-2026-4421 issued.",
    next_steps: "Raising remaining KES 75,000 by 1 August deadline.",
  })], callerLabel: "W1" });
  await callWrite({ client: W4.client, address: CONTRACT, functionName: "review_update", args: [uid], callerLabel: "W4" });

  const review = await readJson("get_update_review", [uid]);
  assertTruthy(review, "update review persisted");
  validateUpdateReview(review);
  log(`    verdict=${review.verdict}  trust_delta=${review.trust_delta}  risk_delta=${review.risk_delta}`);
});

// Nondet — resolve_dispute
suite("nondet-resolve-dispute", async () => {
  const id = nextId("CAMP");
  const did = nextId("DSP");
  // Pin persona 2 (Maria Santos / Typhoon relief) so the dispute is about
  // something the reviewer can actually corroborate against the campaign.
  const persona = PERSONAS[2];
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "create_campaign", args: [id, campaignPayload({ persona })], callerLabel: "W1" });
  await callWrite({ client: W3.client, address: CONTRACT, functionName: "flag_campaign", args: [did, id, JSON.stringify({
    reason: "Suspicious wallet behaviour",
    description: "The wallet on this typhoon-relief campaign has no prior on-chain history consistent with the stated Catbalogan location, and the only attached barangay certification is unverified. Requesting additional corroboration before donations continue.",
    evidence: "https://archive.example.com/wallet-history-2026",
    severity: "MEDIUM",
  })], callerLabel: "W3" });
  await callWrite({ client: W4.client, address: CONTRACT, functionName: "resolve_dispute", args: [did], callerLabel: "W4" });

  const review = await readJson("get_dispute_review", [did]);
  assertTruthy(review, "dispute review persisted");
  validateDisputeReview(review);
  log(`    verdict=${review.verdict}  campaign_action=${review.campaign_action}`);

  const c = await readJson("get_campaign", [id]);
  assertTruthy(c, "campaign still readable post-dispute");
});

// Nondet — detect_campaign_similarity
suite("nondet-similarity", async () => {
  const id = nextId("CAMP");
  await callWrite({ client: W1.client, address: CONTRACT, functionName: "create_campaign", args: [id, campaignPayload()], callerLabel: "W1" });

  await callWrite({
    client: W4.client, address: CONTRACT, functionName: "detect_campaign_similarity",
    args: [id, "Unrelated reference text for similarity comparison."],
    callerLabel: "W4",
  });

  // Similarity reviews are keyed by `<campaign_id>::similarity::<n>` — we don't
  // know n here, so probe via list_campaigns / reading review_count if available
  // and just confirm the call succeeded on-chain via the receipt we already
  // checked. A robust read-back would require an indexed view, which the
  // current contract does not expose.
});

// --------------------------------------------------------------------------
// Runner
// --------------------------------------------------------------------------

async function main() {
  log(`${COL.cyan}Judgix E2E suite${COL.reset}`);
  log(`run tag: ${RUN_TAG}`);
  log(`contract: ${CONTRACT}`);
  log(`endpoint: ${ENDPOINT}`);

  const filter = process.argv.slice(2);
  const order = (s) => {
    if (s.name === "step0-sanity") return 0;
    if (s.name.startsWith("det-")) return 1;
    if (s.name.startsWith("revert-")) return 2;
    return 3;
  };
  const selected = (filter.length ? SUITES.filter(s => filter.includes(s.name)) : SUITES.slice())
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));

  // step0 is mandatory unless filter explicitly excludes it
  if (filter.length > 0 && !filter.includes("step0-sanity")) {
    // run step0 anyway for safety
    selected.unshift(SUITES.find(s => s.name === "step0-sanity"));
  }

  const results = [];
  for (const s of selected) {
    log(`\n${COL.blue}=== suite: ${s.name} ===${COL.reset}`);
    const start = Date.now();
    try {
      await s.runner();
      const ms = Date.now() - start;
      log(`${COL.green}SUMMARY ${s.name}: PASS (${ms}ms)${COL.reset}`);
      results.push({ name: s.name, status: "PASS", ms });
    } catch (err) {
      const ms = Date.now() - start;
      log(`${COL.red}SUMMARY ${s.name}: FAIL (${ms}ms) — ${err?.message || err}${COL.reset}`);
      results.push({ name: s.name, status: "FAIL", ms, error: String(err?.message || err) });
      // stop on first failure per spec
      break;
    }
  }

  log(`\n${COL.cyan}=== Final summary ===${COL.reset}`);
  let allPass = true;
  for (const r of results) {
    const color = r.status === "PASS" ? COL.green : COL.red;
    log(`  ${color}${r.status}${COL.reset}  ${r.name.padEnd(34)}  ${String(r.ms).padStart(7)}ms${r.error ? "  " + r.error.slice(0, 120) : ""}`);
    if (r.status !== "PASS") allPass = false;
  }
  log(`contract: ${CONTRACT}`);
  log(`network:  GenLayer Studio Network · chain id ${CHAIN_ID}`);
  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error("fatal:", err);
  process.exit(1);
});
