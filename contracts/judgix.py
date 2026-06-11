# v0.2.17
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import hashlib

DONOR_RISK_LEVELS = ("low", "medium", "high", "critical")
DECISIONS = ("verified", "caution", "high_risk", "reject")
DONOR_ACTIONS = ("support", "support_with_caution", "wait_for_more_evidence", "avoid")
APPEAL_DECISIONS = ("uphold", "improve", "worsen", "insufficient_new_evidence")
DEFAULT_REVIEW_FEE_WEI = 10_000_000_000_000_000  # 0.01 GEN


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass
    class Write:
        pass


class Judgix(gl.Contract):
    owner: Address
    paused: bool
    keeper: str
    evidence_schema_version: str
    review_fee_wei: u256
    protocol_fees_wei: u256

    campaign_count: u256
    review_count: u256
    appeal_count: u256
    flag_count: u256

    campaigns: TreeMap[str, str]
    evidence_records: TreeMap[str, str]
    verdicts: TreeMap[str, str]
    appeals: TreeMap[str, str]
    appeal_verdicts: TreeMap[str, str]
    flags: TreeMap[str, str]

    campaign_index: TreeMap[str, str]
    reviewed_index: TreeMap[str, str]
    creator_campaigns: TreeMap[str, str]
    flags_by_campaign: TreeMap[str, str]
    appeals_by_campaign: TreeMap[str, str]
    hidden_campaigns: TreeMap[str, str]
    creator_reputation: TreeMap[str, str]

    def __init__(self) -> None:
        self.owner = gl.message.sender_address
        self.paused = False
        self.keeper = ""
        self.evidence_schema_version = "judgix-sanitised-evidence-1"
        self.review_fee_wei = u256(DEFAULT_REVIEW_FEE_WEI)
        self.protocol_fees_wei = u256(0)
        self.campaign_count = u256(0)
        self.review_count = u256(0)
        self.appeal_count = u256(0)
        self.flag_count = u256(0)

    # ----------------------------- helpers -----------------------------

    def _fail(self, message: str) -> None:
        raise gl.vm.UserError(message)

    def _sender(self) -> str:
        return str(gl.message.sender_address)

    def _only_owner(self) -> None:
        if gl.message.sender_address != self.owner:
            self._fail("owner only")

    def _require_live(self) -> None:
        if self.paused:
            self._fail("protocol paused")

    def _now(self) -> str:
        return str(gl.message_raw.get("datetime", ""))

    def _obj(self, raw: str) -> dict:
        try:
            data = json.loads(raw or "{}")
            if isinstance(data, dict):
                return data
        except Exception:
            pass
        return {}

    def _list(self, raw: str) -> list:
        try:
            data = json.loads(raw or "[]")
            if isinstance(data, list):
                return data
        except Exception:
            pass
        return []

    def _dumps(self, data: dict) -> str:
        return json.dumps(data, separators=(",", ":"), sort_keys=True)

    def _append(self, store: TreeMap[str, str], key: str, value: str) -> None:
        items = self._list(store.get(key, "[]"))
        exists = False
        for item in items:
            if str(item) == value:
                exists = True
        if not exists:
            items.append(value)
        store[key] = json.dumps(items, separators=(",", ":"))

    def _clamp(self, value, low: int, high: int) -> int:
        try:
            n = int(value)
        except Exception:
            n = low
        if n < low:
            return low
        if n > high:
            return high
        return n

    def _s(self, value, max_len: int) -> str:
        return str(value or "").strip()[:max_len]

    def _clean_list(self, value, max_items: int, max_len: int) -> list:
        if not isinstance(value, list):
            value = []
        out = []
        for item in value:
            text = str(item or "").strip()
            if text and len(out) < max_items:
                out.append(text[:max_len])
        return out

    def _extract_json(self, raw) -> dict:
        if isinstance(raw, dict):
            return raw
        text = str(raw or "").strip()
        if text.startswith("```"):
            text = text.strip("`").strip()
            if text.lower().startswith("json"):
                text = text[4:].strip()
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            return {}
        try:
            data = json.loads(text[start:end + 1])
            if isinstance(data, dict):
                return data
        except Exception:
            pass
        return {}

    def _hash(self, evidence_json: str, salt: str) -> str:
        return "sha256:" + hashlib.sha256((str(evidence_json) + str(salt)).encode("utf-8")).hexdigest()

    def _norm_hash(self, raw: str) -> str:
        value = str(raw or "").strip().lower()
        if not value:
            return ""
        if value.startswith("sha256:"):
            return value
        if len(value) == 64:
            return "sha256:" + value
        return value

    def _load_campaign(self, campaign_id: str) -> dict:
        raw = self.campaigns.get(campaign_id, "")
        if not raw:
            self._fail("unknown campaign")
        data = self._obj(raw)
        if not data:
            self._fail("corrupt campaign")
        return data

    def _save_campaign(self, campaign_id: str, data: dict) -> None:
        self.campaigns[campaign_id] = self._dumps(data)

    def _creator(self, campaign: dict) -> str:
        return str(campaign.get("creator", "") or "")

    def _only_creator(self, campaign: dict) -> None:
        if self._creator(campaign).lower() != self._sender().lower():
            self._fail("creator only")

    def _validate_campaign(self, data: dict) -> None:
        required = ("title", "category", "story", "funding_goal", "beneficiary_summary", "use_of_funds", "timeline", "region_summary")
        for key in required:
            if data.get(key) in (None, "", []):
                self._fail("missing campaign field: " + key)

    def _validate_evidence(self, data: dict) -> None:
        required = ("evidence_summary", "proof_type", "redaction_statement")
        for key in required:
            if data.get(key) in (None, ""):
                self._fail("missing evidence field: " + key)

    def _rep(self, creator: str) -> dict:
        rep = self._obj(self.creator_reputation.get(creator, ""))
        if not rep:
            rep = {
                "creator": creator,
                "total_campaigns": 0,
                "reviewed_campaigns": 0,
                "verified_count": 0,
                "caution_count": 0,
                "high_risk_count": 0,
                "rejected_count": 0,
                "average_authenticity_score": 0,
                "average_evidence_strength": 0,
                "last_decision": "",
                "last_donor_risk_level": "",
                "appeal_count": 0,
                "flag_count": 0,
            }
        return rep

    def _save_rep(self, creator: str, rep: dict) -> None:
        self.creator_reputation[creator] = self._dumps(rep)

    def _apply_rep(self, creator: str, verdict: dict) -> None:
        rep = self._rep(creator)
        reviewed = int(rep.get("reviewed_campaigns", 0))
        new_count = reviewed + 1
        score = int(verdict.get("authenticity_score", 0))
        evidence = int(verdict.get("evidence_strength", 0))
        rep["reviewed_campaigns"] = new_count
        rep["average_authenticity_score"] = int(((int(rep.get("average_authenticity_score", 0)) * reviewed) + score) / new_count)
        rep["average_evidence_strength"] = int(((int(rep.get("average_evidence_strength", 0)) * reviewed) + evidence) / new_count)
        decision = str(verdict.get("decision", "caution"))
        risk = str(verdict.get("donor_risk_level", "medium"))
        rep["last_decision"] = decision
        rep["last_donor_risk_level"] = risk
        if decision == "verified":
            rep["verified_count"] = int(rep.get("verified_count", 0)) + 1
        elif decision == "caution":
            rep["caution_count"] = int(rep.get("caution_count", 0)) + 1
        elif decision == "high_risk":
            rep["high_risk_count"] = int(rep.get("high_risk_count", 0)) + 1
        elif decision == "reject":
            rep["rejected_count"] = int(rep.get("rejected_count", 0)) + 1
        self._save_rep(creator, rep)

    def _normalise_verdict(self, parsed: dict) -> dict:
        risk = str(parsed.get("donor_risk_level", "medium")).lower()
        if risk not in DONOR_RISK_LEVELS:
            risk = "medium"
        decision = str(parsed.get("decision", "caution")).lower()
        if decision not in DECISIONS:
            decision = "caution"
        action = str(parsed.get("recommended_donor_action", "wait_for_more_evidence")).lower()
        if action not in DONOR_ACTIONS:
            action = "wait_for_more_evidence"
        return {
            "authenticity_score": self._clamp(parsed.get("authenticity_score", 0), 0, 100),
            "evidence_strength": self._clamp(parsed.get("evidence_strength", 0), 0, 100),
            "donor_risk_level": risk,
            "decision": decision,
            "confidence": self._clamp(parsed.get("confidence", 0), 0, 100),
            "recommended_donor_action": action,
            "reasoning": self._clean_list(parsed.get("reasoning", []), 8, 500),
            "risk_flags": self._clean_list(parsed.get("risk_flags", []), 10, 240),
            "required_improvements": self._clean_list(parsed.get("required_improvements", []), 10, 240),
        }

    def _normalise_appeal_verdict(self, parsed: dict, previous: dict) -> dict:
        appeal_decision = str(parsed.get("appeal_decision", "insufficient_new_evidence")).lower()
        if appeal_decision not in APPEAL_DECISIONS:
            appeal_decision = "insufficient_new_evidence"
        risk = str(parsed.get("new_donor_risk_level", previous.get("donor_risk_level", "medium"))).lower()
        if risk not in DONOR_RISK_LEVELS:
            risk = str(previous.get("donor_risk_level", "medium"))
        action = str(parsed.get("new_recommended_donor_action", previous.get("recommended_donor_action", "wait_for_more_evidence"))).lower()
        if action not in DONOR_ACTIONS:
            action = str(previous.get("recommended_donor_action", "wait_for_more_evidence"))
        return {
            "appeal_decision": appeal_decision,
            "new_authenticity_score": self._clamp(parsed.get("new_authenticity_score", previous.get("authenticity_score", 0)), 0, 100),
            "new_evidence_strength": self._clamp(parsed.get("new_evidence_strength", previous.get("evidence_strength", 0)), 0, 100),
            "new_donor_risk_level": risk,
            "new_recommended_donor_action": action,
            "confidence": self._clamp(parsed.get("confidence", 0), 0, 100),
            "reasoning": self._clean_list(parsed.get("reasoning", []), 8, 500),
            "changed_fields": self._clean_list(parsed.get("changed_fields", []), 8, 120),
        }

    # -------------------------- campaign/evidence --------------------------

    @gl.public.write
    def create_campaign(self, campaign_id: str, campaign_json: str) -> str:
        self._require_live()
        campaign_id = str(campaign_id).strip()
        if not campaign_id:
            self._fail("campaign_id required")
        if self.campaigns.get(campaign_id, ""):
            self._fail("campaign exists")
        data = self._obj(campaign_json)
        if not data:
            self._fail("campaign_json must be object")
        self._validate_campaign(data)
        creator = self._sender()
        data["campaign_id"] = campaign_id
        data["creator"] = creator
        data["status"] = "CREATED"
        data["schema_version"] = self.evidence_schema_version
        data["created_at"] = self._now()
        data["title"] = self._s(data.get("title"), 180)
        data["category"] = self._s(data.get("category"), 80)
        data["story"] = self._s(data.get("story"), 5000)
        data["beneficiary_summary"] = self._s(data.get("beneficiary_summary"), 1000)
        data["region_summary"] = self._s(data.get("region_summary"), 240)
        data["timeline"] = self._s(data.get("timeline"), 500)
        data["risk_disclosure"] = self._s(data.get("risk_disclosure"), 1000)
        data["review_fee_required_wei"] = str(self.review_fee_wei)
        self.campaigns[campaign_id] = self._dumps(data)
        self.campaign_count = self.campaign_count + u256(1)
        self._append(self.campaign_index, "all", campaign_id)
        self._append(self.creator_campaigns, creator, campaign_id)
        rep = self._rep(creator)
        rep["total_campaigns"] = int(rep.get("total_campaigns", 0)) + 1
        self._save_rep(creator, rep)
        return campaign_id

    @gl.public.write
    def commit_evidence(self, campaign_id: str, evidence_hash: str) -> str:
        self._require_live()
        campaign_id = str(campaign_id).strip()
        campaign = self._load_campaign(campaign_id)
        self._only_creator(campaign)
        if campaign.get("status") != "CREATED":
            self._fail("campaign not CREATED")
        h = self._norm_hash(evidence_hash)
        if not h:
            self._fail("evidence_hash required")
        self.evidence_records[campaign_id] = self._dumps({
            "campaign_id": campaign_id,
            "mode": "commit_reveal",
            "commitment_hash": h,
            "revealed": False,
            "committed_at": self._now(),
        })
        campaign["status"] = "EVIDENCE_COMMITTED"
        campaign["evidence_mode"] = "commit_reveal"
        campaign["evidence_committed_at"] = self._now()
        self._save_campaign(campaign_id, campaign)
        return campaign_id

    @gl.public.write
    def submit_sanitised_evidence(self, campaign_id: str, evidence_json: str) -> str:
        self._require_live()
        campaign_id = str(campaign_id).strip()
        campaign = self._load_campaign(campaign_id)
        self._only_creator(campaign)
        if campaign.get("status") != "CREATED":
            self._fail("direct evidence only from CREATED")
        evidence = self._obj(evidence_json)
        if not evidence:
            self._fail("evidence_json must be object")
        self._validate_evidence(evidence)
        self.evidence_records[campaign_id] = self._dumps({
            "campaign_id": campaign_id,
            "mode": "direct_sanitised",
            "evidence_json": evidence,
            "revealed": True,
            "submitted_at": self._now(),
            "schema_version": self.evidence_schema_version,
        })
        campaign["status"] = "READY_FOR_REVIEW"
        campaign["evidence_mode"] = "direct_sanitised"
        campaign["evidence_submitted_at"] = self._now()
        self._save_campaign(campaign_id, campaign)
        return campaign_id

    @gl.public.write
    def reveal_evidence(self, campaign_id: str, evidence_json: str, salt: str) -> str:
        self._require_live()
        campaign_id = str(campaign_id).strip()
        campaign = self._load_campaign(campaign_id)
        self._only_creator(campaign)
        if campaign.get("status") != "EVIDENCE_COMMITTED":
            self._fail("not awaiting reveal")
        record = self._obj(self.evidence_records.get(campaign_id, ""))
        if self._norm_hash(record.get("commitment_hash", "")) != self._hash(evidence_json, salt):
            self._fail("evidence hash mismatch")
        evidence = self._obj(evidence_json)
        if not evidence:
            self._fail("evidence_json must be object")
        self._validate_evidence(evidence)
        record["evidence_json"] = evidence
        record["salt_hash"] = self._hash("salt", salt)
        record["revealed"] = True
        record["revealed_at"] = self._now()
        record["schema_version"] = self.evidence_schema_version
        self.evidence_records[campaign_id] = self._dumps(record)
        campaign["status"] = "READY_FOR_REVIEW"
        campaign["evidence_revealed_at"] = self._now()
        self._save_campaign(campaign_id, campaign)
        return campaign_id

    @gl.public.write
    def cancel_campaign(self, campaign_id: str) -> str:
        self._require_live()
        campaign_id = str(campaign_id).strip()
        campaign = self._load_campaign(campaign_id)
        self._only_creator(campaign)
        if campaign.get("status") not in ("CREATED", "EVIDENCE_COMMITTED", "READY_FOR_REVIEW", "APPEALED", "APPEAL_EVIDENCE_COMMITTED", "READY_FOR_APPEAL_REVIEW"):
            self._fail("cannot cancel after review starts")
        campaign["status"] = "CANCELLED"
        campaign["cancelled_at"] = self._now()
        self._save_campaign(campaign_id, campaign)
        return campaign_id

    # ---------------------- permissionless payable review ----------------------

    @gl.public.write.payable
    def trigger_review(self, campaign_id: str) -> str:
        self._require_live()
        campaign_id = str(campaign_id).strip()
        campaign = self._load_campaign(campaign_id)
        if campaign.get("status") != "READY_FOR_REVIEW":
            self._fail("campaign not READY_FOR_REVIEW")
        if gl.message.value < self.review_fee_wei:
            self._fail("review fee too low")
        evidence_record = self._obj(self.evidence_records.get(campaign_id, ""))
        if not evidence_record or not evidence_record.get("revealed"):
            self._fail("sanitised evidence not available")
        self.protocol_fees_wei = self.protocol_fees_wei + gl.message.value
        campaign["status"] = "UNDER_REVIEW"
        campaign["review_triggered_by"] = self._sender()
        campaign["review_triggered_at"] = self._now()
        self._save_campaign(campaign_id, campaign)
        campaign_json = self._dumps(campaign)
        evidence_json = self._dumps(evidence_record.get("evidence_json", {}))

        def leader_review() -> str:
            prompt = self._campaign_review_prompt(campaign_json, evidence_json)
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return self._dumps(self._normalise_verdict(self._extract_json(raw)))

        review_json = gl.eq_principle.prompt_non_comparative(
            leader_review,
            task="Evaluate a crowdfunding campaign's authenticity and donor safety from public campaign details and sanitised evidence summaries.",
            criteria=(
                "Strict JSON only. authenticity_score/evidence_strength/confidence are 0-100. "
                "donor_risk_level is low/medium/high/critical. decision is verified/caution/high_risk/reject. "
                "recommended_donor_action is support/support_with_caution/wait_for_more_evidence/avoid. "
                "Reasoning is evidence-based, avoids legal conclusions, and distinguishes weak evidence from active fraud."
            ),
        )
        final = self._normalise_verdict(self._extract_json(review_json))
        if len(final.get("reasoning", [])) == 0:
            self._fail("review reasoning required")
        review_id = "REV-" + str(self.review_count + u256(1))
        final["review_id"] = review_id
        final["campaign_id"] = campaign_id
        final["reviewed_at"] = self._now()
        final["review_fee_paid_wei"] = str(gl.message.value)
        self.verdicts[campaign_id] = self._dumps(final)
        self.review_count = self.review_count + u256(1)
        campaign["status"] = "REVIEWED"
        campaign["last_review_id"] = review_id
        campaign["authenticity_score"] = final.get("authenticity_score", 0)
        campaign["evidence_strength"] = final.get("evidence_strength", 0)
        campaign["donor_risk_level"] = final.get("donor_risk_level", "medium")
        campaign["decision"] = final.get("decision", "caution")
        campaign["recommended_donor_action"] = final.get("recommended_donor_action", "wait_for_more_evidence")
        campaign["reviewed_at"] = self._now()
        self._save_campaign(campaign_id, campaign)
        self._append(self.reviewed_index, "reviewed", campaign_id)
        self._apply_rep(self._creator(campaign), final)
        return self._dumps(final)

    def _campaign_review_prompt(self, campaign_json: str, evidence_json: str) -> str:
        return (
            "You are a GenLayer validator for Judgix, a decentralized crowdfunding campaign authenticity review layer.\n"
            "Do NOT use fixed rules. Reason holistically about whether the campaign appears authentic, evidence-backed, realistic, and donor-safe.\n\n"
            "CAMPAIGN JSON:\n" + campaign_json + "\n\nSANITISED EVIDENCE JSON:\n" + evidence_json +
            "\n\nEvaluate story consistency, evidence strength, funding goal realism, beneficiary clarity, creator credibility from submitted facts, "
            "use-of-funds clarity, social proof, suspicious urgency, duplicate/fake campaign risk, and donor safety.\n"
            "Rules: no legal accusations; do not claim raw private documents were reviewed; distinguish weak evidence from active fraud.\n"
            "Return STRICT JSON ONLY:\n"
            "{\n"
            '  "authenticity_score": 72,\n'
            '  "evidence_strength": 65,\n'
            '  "donor_risk_level": "medium",\n'
            '  "decision": "caution",\n'
            '  "confidence": 78,\n'
            '  "recommended_donor_action": "support_with_caution",\n'
            '  "reasoning": ["specific reason"],\n'
            '  "risk_flags": ["specific risk flag"],\n'
            '  "required_improvements": ["specific improvement"]\n'
            "}\n"
        )

    # ------------------------------- appeals -------------------------------

    @gl.public.write
    def submit_appeal(self, campaign_id: str, appeal_id: str, appeal_reason: str) -> str:
        self._require_live()
        campaign = self._load_campaign(str(campaign_id).strip())
        self._only_creator(campaign)
        appeal_id = str(appeal_id).strip()
        if not appeal_id:
            self._fail("appeal_id required")
        if self.appeals.get(appeal_id, ""):
            self._fail("appeal exists")
        if campaign.get("status") not in ("REVIEWED", "APPEAL_REVIEWED"):
            self._fail("campaign must be reviewed before appeal")
        appeal = {
            "appeal_id": appeal_id,
            "campaign_id": str(campaign_id).strip(),
            "creator": self._creator(campaign),
            "appeal_reason": self._s(appeal_reason, 1500),
            "status": "APPEALED",
            "created_at": self._now(),
        }
        self.appeals[appeal_id] = self._dumps(appeal)
        self._append(self.appeals_by_campaign, str(campaign_id).strip(), appeal_id)
        self.appeal_count = self.appeal_count + u256(1)
        campaign["status"] = "APPEALED"
        campaign["last_appeal_id"] = appeal_id
        self._save_campaign(str(campaign_id).strip(), campaign)
        rep = self._rep(self._creator(campaign))
        rep["appeal_count"] = int(rep.get("appeal_count", 0)) + 1
        self._save_rep(self._creator(campaign), rep)
        return appeal_id

    @gl.public.write
    def commit_appeal_evidence(self, appeal_id: str, evidence_hash: str) -> str:
        self._require_live()
        appeal_id = str(appeal_id).strip()
        appeal = self._obj(self.appeals.get(appeal_id, ""))
        if not appeal:
            self._fail("unknown appeal")
        campaign = self._load_campaign(str(appeal.get("campaign_id", "")))
        self._only_creator(campaign)
        if appeal.get("status") != "APPEALED":
            self._fail("appeal not ready")
        h = self._norm_hash(evidence_hash)
        if not h:
            self._fail("evidence_hash required")
        appeal["status"] = "APPEAL_EVIDENCE_COMMITTED"
        appeal["commitment_hash"] = h
        appeal["committed_at"] = self._now()
        self.appeals[appeal_id] = self._dumps(appeal)
        campaign["status"] = "APPEAL_EVIDENCE_COMMITTED"
        self._save_campaign(str(appeal.get("campaign_id")), campaign)
        return appeal_id

    @gl.public.write
    def submit_appeal_evidence(self, appeal_id: str, evidence_json: str) -> str:
        self._require_live()
        appeal_id = str(appeal_id).strip()
        appeal = self._obj(self.appeals.get(appeal_id, ""))
        if not appeal:
            self._fail("unknown appeal")
        campaign = self._load_campaign(str(appeal.get("campaign_id", "")))
        self._only_creator(campaign)
        if appeal.get("status") != "APPEALED":
            self._fail("appeal not ready")
        evidence = self._obj(evidence_json)
        if not evidence:
            self._fail("appeal evidence must be object")
        self._validate_evidence(evidence)
        appeal["status"] = "READY_FOR_APPEAL_REVIEW"
        appeal["evidence_mode"] = "direct_sanitised"
        appeal["appeal_evidence_json"] = evidence
        appeal["evidence_submitted_at"] = self._now()
        self.appeals[appeal_id] = self._dumps(appeal)
        campaign["status"] = "READY_FOR_APPEAL_REVIEW"
        self._save_campaign(str(appeal.get("campaign_id")), campaign)
        return appeal_id

    @gl.public.write
    def reveal_appeal_evidence(self, appeal_id: str, evidence_json: str, salt: str) -> str:
        self._require_live()
        appeal_id = str(appeal_id).strip()
        appeal = self._obj(self.appeals.get(appeal_id, ""))
        if not appeal:
            self._fail("unknown appeal")
        campaign = self._load_campaign(str(appeal.get("campaign_id", "")))
        self._only_creator(campaign)
        if appeal.get("status") != "APPEAL_EVIDENCE_COMMITTED":
            self._fail("not awaiting appeal reveal")
        if self._norm_hash(appeal.get("commitment_hash", "")) != self._hash(evidence_json, salt):
            self._fail("appeal evidence hash mismatch")
        evidence = self._obj(evidence_json)
        if not evidence:
            self._fail("appeal evidence must be object")
        self._validate_evidence(evidence)
        appeal["status"] = "READY_FOR_APPEAL_REVIEW"
        appeal["appeal_evidence_json"] = evidence
        appeal["salt_hash"] = self._hash("salt", salt)
        appeal["revealed_at"] = self._now()
        self.appeals[appeal_id] = self._dumps(appeal)
        campaign["status"] = "READY_FOR_APPEAL_REVIEW"
        self._save_campaign(str(appeal.get("campaign_id")), campaign)
        return appeal_id

    @gl.public.write.payable
    def trigger_appeal_review(self, appeal_id: str) -> str:
        self._require_live()
        appeal_id = str(appeal_id).strip()
        appeal = self._obj(self.appeals.get(appeal_id, ""))
        if not appeal:
            self._fail("unknown appeal")
        if appeal.get("status") != "READY_FOR_APPEAL_REVIEW":
            self._fail("appeal not ready")
        if gl.message.value < self.review_fee_wei:
            self._fail("appeal review fee too low")
        self.protocol_fees_wei = self.protocol_fees_wei + gl.message.value
        campaign_id = str(appeal.get("campaign_id", ""))
        campaign = self._load_campaign(campaign_id)
        previous = self._obj(self.verdicts.get(campaign_id, ""))
        if not previous:
            self._fail("missing original verdict")
        appeal["status"] = "APPEAL_UNDER_REVIEW"
        appeal["review_triggered_by"] = self._sender()
        appeal["review_triggered_at"] = self._now()
        self.appeals[appeal_id] = self._dumps(appeal)
        campaign["status"] = "APPEAL_UNDER_REVIEW"
        self._save_campaign(campaign_id, campaign)

        def leader_review() -> str:
            prompt = self._appeal_prompt(self._dumps(campaign), self._dumps(previous), self._dumps(appeal))
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return self._dumps(self._normalise_appeal_verdict(self._extract_json(raw), previous))

        review_json = gl.eq_principle.prompt_non_comparative(
            leader_review,
            task="Review a crowdfunding campaign appeal using new sanitised evidence and decide whether the prior verdict should change.",
            criteria="Strict JSON. appeal_decision is uphold/improve/worsen/insufficient_new_evidence. Scores and confidence are 0-100. Reasoning explains material change or no change.",
        )
        final = self._normalise_appeal_verdict(self._extract_json(review_json), previous)
        if len(final.get("reasoning", [])) == 0:
            self._fail("appeal reasoning required")
        final["appeal_id"] = appeal_id
        final["campaign_id"] = campaign_id
        final["reviewed_at"] = self._now()
        final["review_fee_paid_wei"] = str(gl.message.value)
        self.appeal_verdicts[appeal_id] = self._dumps(final)
        appeal["status"] = "APPEAL_REVIEWED"
        appeal["appeal_decision"] = final.get("appeal_decision", "insufficient_new_evidence")
        appeal["reviewed_at"] = self._now()
        self.appeals[appeal_id] = self._dumps(appeal)
        campaign["status"] = "APPEAL_REVIEWED"
        campaign["last_appeal_decision"] = final.get("appeal_decision", "insufficient_new_evidence")
        campaign["authenticity_score"] = final.get("new_authenticity_score", campaign.get("authenticity_score", 0))
        campaign["evidence_strength"] = final.get("new_evidence_strength", campaign.get("evidence_strength", 0))
        campaign["donor_risk_level"] = final.get("new_donor_risk_level", campaign.get("donor_risk_level", "medium"))
        campaign["recommended_donor_action"] = final.get("new_recommended_donor_action", campaign.get("recommended_donor_action", "wait_for_more_evidence"))
        self._save_campaign(campaign_id, campaign)
        self._apply_rep(self._creator(campaign), {
            "authenticity_score": final.get("new_authenticity_score", 0),
            "evidence_strength": final.get("new_evidence_strength", 0),
            "decision": previous.get("decision", "caution"),
            "donor_risk_level": final.get("new_donor_risk_level", "medium"),
        })
        return self._dumps(final)

    def _appeal_prompt(self, campaign_json: str, previous_verdict_json: str, appeal_json: str) -> str:
        return (
            "You are reviewing a Judgix campaign appeal. Decide whether new sanitised evidence materially changes the prior verdict.\n\n"
            "CAMPAIGN JSON:\n" + campaign_json + "\n\nPREVIOUS VERDICT JSON:\n" + previous_verdict_json + "\n\nAPPEAL JSON:\n" + appeal_json +
            "\n\nReturn STRICT JSON ONLY:\n"
            "{\n"
            '  "appeal_decision": "uphold",\n'
            '  "new_authenticity_score": 72,\n'
            '  "new_evidence_strength": 65,\n'
            '  "new_donor_risk_level": "medium",\n'
            '  "new_recommended_donor_action": "support_with_caution",\n'
            '  "confidence": 78,\n'
            '  "reasoning": ["specific reason"],\n'
            '  "changed_fields": ["field changed"]\n'
            "}\n"
        )

    # ------------------------------- flags/admin -------------------------------

    @gl.public.write
    def flag_campaign(self, campaign_id: str, flag_json: str) -> str:
        self._require_live()
        campaign_id = str(campaign_id).strip()
        campaign = self._load_campaign(campaign_id)
        if campaign.get("status") not in ("REVIEWED", "APPEAL_REVIEWED", "FLAGGED"):
            self._fail("only reviewed campaigns can be flagged")
        data = self._obj(flag_json)
        if not data:
            self._fail("flag_json must be object")
        flag_id = "FLAG-" + str(self.flag_count + u256(1))
        data["flag_id"] = flag_id
        data["campaign_id"] = campaign_id
        data["reporter"] = self._sender()
        data["created_at"] = self._now()
        data["status"] = "OPEN"
        self.flags[flag_id] = self._dumps(data)
        self.flag_count = self.flag_count + u256(1)
        self._append(self.flags_by_campaign, campaign_id, flag_id)
        campaign["status"] = "FLAGGED"
        campaign["last_flag_id"] = flag_id
        self._save_campaign(campaign_id, campaign)
        creator = self._creator(campaign)
        rep = self._rep(creator)
        rep["flag_count"] = int(rep.get("flag_count", 0)) + 1
        self._save_rep(creator, rep)
        return flag_id

    @gl.public.write
    def admin_pause(self) -> str:
        self._only_owner()
        self.paused = True
        return "paused"

    @gl.public.write
    def admin_unpause(self) -> str:
        self._only_owner()
        self.paused = False
        return "unpaused"

    @gl.public.write
    def admin_set_review_fee(self, fee_wei: str) -> str:
        self._only_owner()
        try:
            fee = int(str(fee_wei))
        except Exception:
            self._fail("invalid fee")
        if fee < 0:
            self._fail("fee cannot be negative")
        self.review_fee_wei = u256(fee)
        return str(self.review_fee_wei)

    @gl.public.write
    def admin_set_keeper(self, keeper: str) -> str:
        self._only_owner()
        self.keeper = str(keeper or "").strip()
        return self.keeper

    @gl.public.write
    def admin_set_schema_version(self, version: str) -> str:
        self._only_owner()
        version = str(version or "").strip()
        if not version:
            self._fail("schema version required")
        self.evidence_schema_version = version[:120]
        return self.evidence_schema_version

    @gl.public.write
    def admin_set_hidden(self, campaign_id: str, hidden: bool) -> str:
        self._only_owner()
        campaign_id = str(campaign_id).strip()
        campaign = self._load_campaign(campaign_id)
        self.hidden_campaigns[campaign_id] = "true" if hidden else ""
        campaign["hidden"] = bool(hidden)
        self._save_campaign(campaign_id, campaign)
        return campaign_id

    @gl.public.write
    def admin_mark_spam(self, campaign_id: str, reason: str) -> str:
        self._only_owner()
        campaign_id = str(campaign_id).strip()
        campaign = self._load_campaign(campaign_id)
        campaign["admin_spam_flag"] = True
        campaign["admin_spam_reason"] = self._s(reason, 500)
        campaign["hidden"] = True
        campaign["admin_flagged_at"] = self._now()
        self.hidden_campaigns[campaign_id] = "true"
        self._save_campaign(campaign_id, campaign)
        return campaign_id

    @gl.public.write
    def admin_withdraw_protocol_fees(self, recipient: str, amount_wei: str) -> str:
        self._only_owner()
        try:
            amount = int(str(amount_wei))
        except Exception:
            self._fail("invalid amount")
        if amount <= 0:
            self._fail("amount must be positive")
        if u256(amount) > self.protocol_fees_wei:
            self._fail("amount exceeds protocol fees")
        self.protocol_fees_wei = self.protocol_fees_wei - u256(amount)
        _Recipient(Address(str(recipient))).emit_transfer(value=u256(amount))
        return str(amount)

    # -------------------------------- views --------------------------------

    @gl.public.view
    def get_campaign(self, campaign_id: str) -> str:
        return self.campaigns.get(str(campaign_id), "")

    @gl.public.view
    def get_evidence(self, campaign_id: str) -> str:
        return self.evidence_records.get(str(campaign_id), "")

    @gl.public.view
    def get_verdict(self, campaign_id: str) -> str:
        return self.verdicts.get(str(campaign_id), "")

    @gl.public.view
    def get_appeal(self, appeal_id: str) -> str:
        return self.appeals.get(str(appeal_id), "")

    @gl.public.view
    def get_appeal_verdict(self, appeal_id: str) -> str:
        return self.appeal_verdicts.get(str(appeal_id), "")

    @gl.public.view
    def get_flag(self, flag_id: str) -> str:
        return self.flags.get(str(flag_id), "")

    @gl.public.view
    def get_flags_for_campaign(self, campaign_id: str) -> str:
        return self.flags_by_campaign.get(str(campaign_id), "[]")

    @gl.public.view
    def get_appeals_for_campaign(self, campaign_id: str) -> str:
        return self.appeals_by_campaign.get(str(campaign_id), "[]")

    @gl.public.view
    def get_creator_campaigns(self, creator: str) -> str:
        return self.creator_campaigns.get(str(creator), "[]")

    @gl.public.view
    def get_creator_reputation(self, creator: str) -> str:
        return self.creator_reputation.get(str(creator), "{}")

    @gl.public.view
    def get_reviewed_campaigns(self) -> str:
        return self.reviewed_index.get("reviewed", "[]")

    @gl.public.view
    def list_campaigns(self, offset: str, limit: str) -> str:
        try:
            start = max(0, int(offset))
        except Exception:
            start = 0
        try:
            n = int(limit)
        except Exception:
            n = 100
        if n <= 0:
            n = 100
        if n > 500:
            n = 500
        items = self._list(self.campaign_index.get("all", "[]"))
        return json.dumps(items[start:start + n], separators=(",", ":"))

    @gl.public.view
    def get_config(self) -> str:
        return self._dumps({
            "owner": str(self.owner),
            "paused": self.paused,
            "keeper": self.keeper,
            "evidence_schema_version": self.evidence_schema_version,
            "review_fee_wei": str(self.review_fee_wei),
            "review_fee_gen_label": "0.01 GEN default" if int(self.review_fee_wei) == DEFAULT_REVIEW_FEE_WEI else "custom",
            "protocol_fees_wei": str(self.protocol_fees_wei),
        })

    @gl.public.view
    def get_protocol_stats(self) -> str:
        return self._dumps({
            "campaign_count": str(self.campaign_count),
            "review_count": str(self.review_count),
            "appeal_count": str(self.appeal_count),
            "flag_count": str(self.flag_count),
            "review_fee_wei": str(self.review_fee_wei),
            "paused": self.paused,
        })

    @gl.public.view
    def is_hidden(self, campaign_id: str) -> str:
        return self.hidden_campaigns.get(str(campaign_id), "")