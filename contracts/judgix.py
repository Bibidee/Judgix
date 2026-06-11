# v0.2.17
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json

CAMPAIGN_VERDICTS = (
    "VERIFIED",
    "LIKELY_AUTHENTIC",
    "NEEDS_MORE_EVIDENCE",
    "PARTIALLY_SUPPORTED",
    "RISKY",
    "HIGH_RISK",
    "SUSPICIOUS",
    "LIKELY_FRAUDULENT",
    "REJECTED",
)

UPDATE_VERDICTS = (
    "UPDATE_CONFIRMS_PROGRESS",
    "UPDATE_PARTIALLY_SUPPORTS_PROGRESS",
    "UPDATE_NEEDS_MORE_EVIDENCE",
    "UPDATE_INCONSISTENT",
    "UPDATE_RAISES_RISK",
    "UPDATE_SUSPICIOUS",
)

DISPUTE_VERDICTS = (
    "DISPUTE_CONFIRMED",
    "DISPUTE_PARTIALLY_VALID",
    "DISPUTE_REJECTED",
    "INSUFFICIENT_EVIDENCE",
    "CAMPAIGN_SHOULD_BE_SUSPENDED",
    "CAMPAIGN_CAN_CONTINUE",
)

RISK_LEVELS = ("LOW", "MEDIUM", "HIGH", "CRITICAL")

EVIDENCE_QUALITY = (
    "NONE",
    "WEAK",
    "PARTIAL",
    "MODERATE",
    "STRONG",
    "VERY_STRONG",
)

STORY_CONSISTENCY = (
    "WEAK",
    "GOOD",
    "STRONG",
    "VERY_STRONG",
)

PUBLIC_SIGNAL_STRENGTH = (
    "NONE",
    "WEAK",
    "PARTIAL",
    "MODERATE",
    "STRONG",
)

PLAGIARISM_RISK = ("LOW", "MEDIUM", "HIGH", "CRITICAL")

FUNDING_GOAL_REALISM = (
    "UNREASONABLE",
    "QUESTIONABLE",
    "REASONABLE",
    "WELL_JUSTIFIED",
)

SPENDING_ALIGNMENT = (
    "NONE",
    "WEAK",
    "PARTIAL",
    "MODERATE",
    "STRONG",
)

CAMPAIGN_ACTIONS = (
    "NO_ACTION",
    "NEEDS_MORE_EVIDENCE",
    "RISKY",
    "SUSPICIOUS",
    "SUSPENDED",
    "REJECTED",
)


class Judgix(gl.Contract):
    owner: Address

    campaign_count: u256
    review_count: u256
    update_count: u256
    dispute_count: u256

    campaigns: TreeMap[str, str]
    campaign_reviews: TreeMap[str, str]
    campaign_similarity_reviews: TreeMap[str, str]

    campaign_updates: TreeMap[str, str]
    update_reviews: TreeMap[str, str]

    disputes: TreeMap[str, str]
    dispute_reviews: TreeMap[str, str]

    creator_campaigns: TreeMap[str, str]
    creator_reputation: TreeMap[str, str]

    protocol_stats: TreeMap[str, str]

    # Global / per-campaign indices to make the contract listable without an off-chain crawler.
    # campaign_index["all"] = JSON list of campaign_id strings (insertion order)
    # updates_by_campaign[campaign_id] = JSON list of update_id strings
    # disputes_by_campaign[campaign_id] = JSON list of dispute_id strings
    campaign_index: TreeMap[str, str]
    updates_by_campaign: TreeMap[str, str]
    disputes_by_campaign: TreeMap[str, str]

    def __init__(self) -> None:
        self.owner = gl.message.sender_address

        self.campaign_count = u256(0)
        self.review_count = u256(0)
        self.update_count = u256(0)
        self.dispute_count = u256(0)

    # ---------------------------------------------------------------------
    # Internal helpers
    # ---------------------------------------------------------------------

    def _fail(self, message: str) -> None:
        raise gl.vm.UserError(message)

    def _sender(self) -> str:
        return str(gl.message.sender_address)

    def _marker(self) -> str:
        return str(self.campaign_count + self.review_count + self.update_count + self.dispute_count)

    def _safe_json_obj(self, raw: str) -> dict:
        if not raw:
            return {}
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                return data
            return {}
        except Exception:
            return {}

    def _safe_json_list(self, raw: str) -> list:
        if not raw:
            return []
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return data
            return []
        except Exception:
            return []

    def _clamp_int(self, value, low: int, high: int) -> int:
        try:
            n = int(value)
        except Exception:
            n = 0

        if n < low:
            return low
        if n > high:
            return high
        return n

    def _clean_list(self, raw, max_items: int, max_len: int) -> list:
        if not isinstance(raw, list):
            raw = [str(raw)]

        clean = []
        for item in raw:
            value = str(item).strip()
            if value and len(clean) < max_items:
                clean.append(value[:max_len])

        return clean

    def _append_index(self, store: TreeMap[str, str], key: str, value: str) -> None:
        items = self._safe_json_list(store.get(key, "[]"))

        exists = False
        for item in items:
            if str(item) == value:
                exists = True

        if not exists:
            items.append(value)

        store[key] = json.dumps(items)

    def _load_reputation(self, creator: str) -> dict:
        raw = self.creator_reputation.get(creator, "")
        rep = self._safe_json_obj(raw)

        if not rep:
            rep = {
                "creator": creator,
                "campaigns_created": 0,
                "verified_campaigns": 0,
                "risky_campaigns": 0,
                "rejected_campaigns": 0,
                "updates_submitted": 0,
                "disputes_received": 0,
                "disputes_confirmed": 0,
                "reputation_score": 0,
                "risk_score": 0,
            }

        if "creator" not in rep:
            rep["creator"] = creator
        if "campaigns_created" not in rep:
            rep["campaigns_created"] = 0
        if "verified_campaigns" not in rep:
            rep["verified_campaigns"] = 0
        if "risky_campaigns" not in rep:
            rep["risky_campaigns"] = 0
        if "rejected_campaigns" not in rep:
            rep["rejected_campaigns"] = 0
        if "updates_submitted" not in rep:
            rep["updates_submitted"] = 0
        if "disputes_received" not in rep:
            rep["disputes_received"] = 0
        if "disputes_confirmed" not in rep:
            rep["disputes_confirmed"] = 0
        if "reputation_score" not in rep:
            rep["reputation_score"] = 0
        if "risk_score" not in rep:
            rep["risk_score"] = 0

        return rep

    def _save_reputation(self, creator: str, rep: dict) -> None:
        self.creator_reputation[creator] = json.dumps(rep, sort_keys=True)

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

        if start == -1 or end == -1 or end <= start:
            return {}

        candidate = text[start : end + 1]

        try:
            data = json.loads(candidate)
            if isinstance(data, dict):
                return data
            return {}
        except Exception:
            return {}

    # ---------------------------------------------------------------------
    # Deterministic campaign writes
    # ---------------------------------------------------------------------

    @gl.public.write
    def create_campaign(self, campaign_id: str, campaign_json: str) -> str:
        campaign_id = str(campaign_id).strip()

        if not campaign_id:
            self._fail("campaign_id required")

        if self.campaigns.get(campaign_id, ""):
            self._fail("campaign id already exists")

        data = self._safe_json_obj(campaign_json)

        if not data:
            self._fail("campaign_json must be a JSON object")

        required = ("title", "creator", "funding_goal", "story")
        for key in required:
            if not data.get(key):
                self._fail("missing required field: " + key)

        creator = str(data.get("creator", "")).strip()
        if not creator:
            self._fail("creator required")

        data["campaign_id"] = campaign_id
        data["creator"] = creator
        data["submitter"] = self._sender()
        data["title"] = str(data.get("title", ""))[:180]
        data["story"] = str(data.get("story", ""))[:4000]
        data["status"] = "DRAFT"
        data["created_at"] = self._marker()

        self.campaigns[campaign_id] = json.dumps(data, sort_keys=True)
        self.campaign_count = self.campaign_count + u256(1)

        self._append_index(self.creator_campaigns, creator, campaign_id)
        self._append_index(self.campaign_index, "all", campaign_id)

        rep = self._load_reputation(creator)
        rep["campaigns_created"] = int(rep.get("campaigns_created", 0)) + 1
        self._save_reputation(creator, rep)

        return campaign_id

    @gl.public.write
    def submit_campaign_for_review(self, campaign_id: str) -> str:
        campaign_id = str(campaign_id).strip()

        raw = self.campaigns.get(campaign_id, "")
        if not raw:
            self._fail("unknown campaign")

        data = self._safe_json_obj(raw)

        if data.get("status") == "ARCHIVED":
            self._fail("archived campaign cannot be submitted")

        data["status"] = "PENDING_REVIEW"
        data["submitted_for_review_at"] = self._marker()

        self.campaigns[campaign_id] = json.dumps(data, sort_keys=True)
        return campaign_id

    @gl.public.write
    def archive_campaign(self, campaign_id: str) -> str:
        campaign_id = str(campaign_id).strip()

        raw = self.campaigns.get(campaign_id, "")
        if not raw:
            self._fail("unknown campaign")

        data = self._safe_json_obj(raw)
        data["status"] = "ARCHIVED"
        data["archived_at"] = self._marker()

        self.campaigns[campaign_id] = json.dumps(data, sort_keys=True)
        return campaign_id

    # ---------------------------------------------------------------------
    # Non-deterministic campaign review
    # ---------------------------------------------------------------------

    @gl.public.write
    def review_campaign(self, campaign_id: str) -> str:
        campaign_id = str(campaign_id).strip()

        campaign_json = self.campaigns.get(campaign_id, "")
        if not campaign_json:
            self._fail("unknown campaign")

        def leader_review() -> str:
            prompt = self._campaign_review_prompt(campaign_json)
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            parsed = self._extract_json(raw)
            normalised = self._normalise_campaign_review(parsed)
            return json.dumps(normalised, sort_keys=True)

        review_json = gl.eq_principle.prompt_non_comparative(
            leader_review,
            task=(
                "Assess a crowdfunding campaign for authenticity, donor risk, evidence quality, "
                "story consistency, public support, plagiarism risk, and funding realism."
            ),
            criteria=(
                "The output must be strict JSON. The verdict must use one allowed campaign verdict. "
                "The authenticity_score must be 0 to 100. The risk_level must be LOW, MEDIUM, HIGH, or CRITICAL. "
                "The reasoning must distinguish weak evidence from active fraud and must not make legal accusations."
            ),
        )

        parsed = self._extract_json(review_json)
        final_review = self._normalise_campaign_review(parsed)

        review_id = "REV-" + str(self.review_count + u256(1))
        final_review["review_id"] = review_id
        final_review["campaign_id"] = campaign_id
        final_review["reviewed_at"] = self._marker()

        final_json = json.dumps(final_review, sort_keys=True)

        self.campaign_reviews[campaign_id] = final_json
        self.review_count = self.review_count + u256(1)

        self._apply_campaign_review(campaign_id, final_review)

        return final_json

    def _campaign_review_prompt(self, campaign_json: str) -> str:
        return (
            "You are a validator on the Judgix decentralised review network.\n"
            "Assess a crowdfunding campaign for donor risk and authenticity.\n\n"
            "CAMPAIGN RECORD JSON:\n"
            + campaign_json
            + "\n\n"
            "Assess:\n"
            "- internal story consistency\n"
            "- evidence relevance and strength\n"
            "- public signal support and independent corroboration\n"
            "- identity consistency\n"
            "- plagiarism or copied story risk\n"
            "- urgency realism\n"
            "- funding goal realism\n"
            "- use-of-funds clarity\n"
            "- overall donor risk\n\n"
            "Rules:\n"
            "- Do not decide legal guilt.\n"
            "- Do not accuse the creator of fraud unless evidence strongly supports it.\n"
            "- Distinguish between weak evidence and active fraud.\n"
            "- Use only allowed enum values.\n"
            "- Return STRICT JSON ONLY, no prose, no markdown.\n\n"
            "Return this JSON shape:\n"
            "{\n"
            '  "verdict": "LIKELY_AUTHENTIC",\n'
            '  "authenticity_score": 75,\n'
            '  "risk_level": "MEDIUM",\n'
            '  "evidence_quality": "MODERATE",\n'
            '  "story_consistency": "GOOD",\n'
            '  "public_signal_strength": "PARTIAL",\n'
            '  "plagiarism_risk": "LOW",\n'
            '  "funding_goal_realism": "REASONABLE",\n'
            '  "red_flags": ["short red flag"],\n'
            '  "positive_signals": ["short positive signal"],\n'
            '  "recommended_action": "Plain English action.",\n'
            '  "reasoning_summary": "Short plain English summary."\n'
            "}\n"
        )

    def _normalise_campaign_review(self, parsed: dict) -> dict:
        verdict = str(parsed.get("verdict", "NEEDS_MORE_EVIDENCE")).upper()
        if verdict not in CAMPAIGN_VERDICTS:
            verdict = "NEEDS_MORE_EVIDENCE"

        risk_level = str(parsed.get("risk_level", "MEDIUM")).upper()
        if risk_level not in RISK_LEVELS:
            risk_level = "MEDIUM"

        evidence_quality = str(parsed.get("evidence_quality", "NONE")).upper()
        if evidence_quality not in EVIDENCE_QUALITY:
            evidence_quality = "NONE"

        story_consistency = str(parsed.get("story_consistency", "WEAK")).upper()
        if story_consistency not in STORY_CONSISTENCY:
            story_consistency = "WEAK"

        public_signal_strength = str(parsed.get("public_signal_strength", "NONE")).upper()
        if public_signal_strength not in PUBLIC_SIGNAL_STRENGTH:
            public_signal_strength = "NONE"

        plagiarism_risk = str(parsed.get("plagiarism_risk", "LOW")).upper()
        if plagiarism_risk not in PLAGIARISM_RISK:
            plagiarism_risk = "LOW"

        funding_goal_realism = str(parsed.get("funding_goal_realism", "QUESTIONABLE")).upper()
        if funding_goal_realism not in FUNDING_GOAL_REALISM:
            funding_goal_realism = "QUESTIONABLE"

        return {
            "verdict": verdict,
            "authenticity_score": self._clamp_int(parsed.get("authenticity_score", 0), 0, 100),
            "risk_level": risk_level,
            "evidence_quality": evidence_quality,
            "story_consistency": story_consistency,
            "public_signal_strength": public_signal_strength,
            "plagiarism_risk": plagiarism_risk,
            "funding_goal_realism": funding_goal_realism,
            "red_flags": self._clean_list(parsed.get("red_flags", []), 8, 240),
            "positive_signals": self._clean_list(parsed.get("positive_signals", []), 8, 240),
            "recommended_action": str(parsed.get("recommended_action", ""))[:500],
            "reasoning_summary": str(parsed.get("reasoning_summary", ""))[:1200],
        }

    def _apply_campaign_review(self, campaign_id: str, review: dict) -> None:
        raw = self.campaigns.get(campaign_id, "")
        if not raw:
            return

        data = self._safe_json_obj(raw)

        verdict = str(review.get("verdict", "NEEDS_MORE_EVIDENCE"))

        status = "PENDING_REVIEW"

        if verdict == "VERIFIED" or verdict == "LIKELY_AUTHENTIC":
            status = "VERIFIED"
        elif verdict == "PARTIALLY_SUPPORTED" or verdict == "NEEDS_MORE_EVIDENCE":
            status = "NEEDS_MORE_EVIDENCE"
        elif verdict == "RISKY" or verdict == "HIGH_RISK":
            status = "RISKY"
        elif verdict == "SUSPICIOUS" or verdict == "LIKELY_FRAUDULENT":
            status = "SUSPICIOUS"
        elif verdict == "REJECTED":
            status = "REJECTED"

        data["status"] = status
        data["authenticity_score"] = review.get("authenticity_score", 0)
        data["risk_level"] = review.get("risk_level", "MEDIUM")
        data["last_reviewed_at"] = self._marker()

        self.campaigns[campaign_id] = json.dumps(data, sort_keys=True)

        creator = str(data.get("creator", "") or "")
        if creator:
            rep = self._load_reputation(creator)

            score = int(rep.get("reputation_score", 0))
            risk = int(rep.get("risk_score", 0))

            if status == "VERIFIED":
                rep["verified_campaigns"] = int(rep.get("verified_campaigns", 0)) + 1
                score += 10
                risk -= 5
            elif status == "NEEDS_MORE_EVIDENCE":
                score -= 1
                risk += 3
            elif status == "RISKY":
                rep["risky_campaigns"] = int(rep.get("risky_campaigns", 0)) + 1
                score -= 5
                risk += 10
            elif status == "SUSPICIOUS":
                rep["risky_campaigns"] = int(rep.get("risky_campaigns", 0)) + 1
                score -= 10
                risk += 20
            elif status == "REJECTED":
                rep["rejected_campaigns"] = int(rep.get("rejected_campaigns", 0)) + 1
                score -= 15
                risk += 25

            rep["reputation_score"] = score
            rep["risk_score"] = self._clamp_int(risk, 0, 1000)

            self._save_reputation(creator, rep)

    # ---------------------------------------------------------------------
    # Campaign similarity review
    # ---------------------------------------------------------------------

    @gl.public.write
    def detect_campaign_similarity(self, campaign_id: str, comparison_text: str) -> str:
        campaign_id = str(campaign_id).strip()

        campaign_json = self.campaigns.get(campaign_id, "")
        if not campaign_json:
            self._fail("unknown campaign")

        comparison_text = str(comparison_text or "")[:5000]

        def leader_review() -> str:
            prompt = (
                "You are comparing a crowdfunding campaign to a reference text.\n"
                "Decide if the campaign appears original, shares a common template, "
                "or is likely a suspicious duplicate.\n\n"
                "CAMPAIGN RECORD JSON:\n"
                + campaign_json
                + "\n\nCOMPARISON TEXT:\n"
                + comparison_text
                + "\n\n"
                "Return STRICT JSON ONLY:\n"
                "{\n"
                '  "similarity_verdict": "ORIGINAL",\n'
                '  "similarity_score": 0,\n'
                '  "plagiarism_risk": "LOW",\n'
                '  "matched_elements": ["short matched element"],\n'
                '  "explanation": "Short explanation."\n'
                "}\n"
            )
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            parsed = self._extract_json(raw)
            final = self._normalise_similarity_review(parsed)
            return json.dumps(final, sort_keys=True)

        review_json = gl.eq_principle.prompt_non_comparative(
            leader_review,
            task="Compare a crowdfunding campaign against reference text for suspicious copying or reused scam-story structure.",
            criteria=(
                "The output must be strict JSON. The similarity_verdict must be ORIGINAL, "
                "SHARED_TEMPLATE, POSSIBLE_DUPLICATE, or CONFIRMED_DUPLICATE. "
                "The plagiarism_risk must be LOW, MEDIUM, HIGH, or CRITICAL."
            ),
        )

        parsed = self._extract_json(review_json)
        final = self._normalise_similarity_review(parsed)

        key = campaign_id + "::similarity::" + str(self.review_count + u256(1))
        final["campaign_id"] = campaign_id
        final["review_key"] = key
        final["reviewed_at"] = self._marker()

        final_json = json.dumps(final, sort_keys=True)
        self.campaign_similarity_reviews[key] = final_json
        self.review_count = self.review_count + u256(1)

        return final_json

    def _normalise_similarity_review(self, parsed: dict) -> dict:
        verdict = str(parsed.get("similarity_verdict", "ORIGINAL")).upper()
        if verdict not in ("ORIGINAL", "SHARED_TEMPLATE", "POSSIBLE_DUPLICATE", "CONFIRMED_DUPLICATE"):
            verdict = "ORIGINAL"

        risk = str(parsed.get("plagiarism_risk", "LOW")).upper()
        if risk not in PLAGIARISM_RISK:
            risk = "LOW"

        return {
            "similarity_verdict": verdict,
            "similarity_score": self._clamp_int(parsed.get("similarity_score", 0), 0, 100),
            "plagiarism_risk": risk,
            "matched_elements": self._clean_list(parsed.get("matched_elements", []), 8, 240),
            "explanation": str(parsed.get("explanation", ""))[:1000],
        }

    # ---------------------------------------------------------------------
    # Campaign updates
    # ---------------------------------------------------------------------

    @gl.public.write
    def submit_update(self, update_id: str, campaign_id: str, update_json: str) -> str:
        update_id = str(update_id).strip()
        campaign_id = str(campaign_id).strip()

        if not update_id:
            self._fail("update_id required")

        if not self.campaigns.get(campaign_id, ""):
            self._fail("unknown campaign")

        if self.campaign_updates.get(update_id, ""):
            self._fail("update id exists")

        data = self._safe_json_obj(update_json)
        if not data:
            self._fail("update_json must be a JSON object")

        data["update_id"] = update_id
        data["campaign_id"] = campaign_id
        data["created_at"] = self._marker()

        self.campaign_updates[update_id] = json.dumps(data, sort_keys=True)
        self.update_count = self.update_count + u256(1)

        self._append_index(self.updates_by_campaign, campaign_id, update_id)

        campaign = self._safe_json_obj(self.campaigns.get(campaign_id, "{}"))
        creator = str(campaign.get("creator", "") or "")

        if creator:
            rep = self._load_reputation(creator)
            rep["updates_submitted"] = int(rep.get("updates_submitted", 0)) + 1
            self._save_reputation(creator, rep)

        return update_id

    @gl.public.write
    def review_update(self, update_id: str) -> str:
        update_id = str(update_id).strip()

        update_json = self.campaign_updates.get(update_id, "")
        if not update_json:
            self._fail("unknown update")

        update_data = self._safe_json_obj(update_json)
        campaign_id = str(update_data.get("campaign_id", "") or "")
        campaign_json = self.campaigns.get(campaign_id, "{}")

        def leader_review() -> str:
            prompt = (
                "You are reviewing a crowdfunding campaign update.\n"
                "Assess whether the update aligns with the original campaign and whether "
                "the stated fund usage is plausibly supported.\n\n"
                "ORIGINAL CAMPAIGN JSON:\n"
                + campaign_json
                + "\n\nUPDATE JSON:\n"
                + update_json
                + "\n\n"
                "Return STRICT JSON ONLY:\n"
                "{\n"
                '  "verdict": "UPDATE_CONFIRMS_PROGRESS",\n'
                '  "trust_delta": 5,\n'
                '  "risk_delta": -3,\n'
                '  "spending_alignment": "MODERATE",\n'
                '  "evidence_quality": "MODERATE",\n'
                '  "concerns": ["short concern"],\n'
                '  "positive_signals": ["short positive signal"],\n'
                '  "reasoning_summary": "Short summary."\n'
                "}\n"
            )
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            parsed = self._extract_json(raw)
            final = self._normalise_update_review(parsed)
            return json.dumps(final, sort_keys=True)

        review_json = gl.eq_principle.prompt_non_comparative(
            leader_review,
            task="Review whether a crowdfunding update supports campaign progress and responsible fund usage.",
            criteria=(
                "The output must be strict JSON. The verdict must use one allowed update verdict. "
                "trust_delta and risk_delta must be bounded integers. The explanation must be evidence-based."
            ),
        )

        parsed = self._extract_json(review_json)
        final = self._normalise_update_review(parsed)

        final["update_id"] = update_id
        final["campaign_id"] = campaign_id
        final["reviewed_at"] = self._marker()

        final_json = json.dumps(final, sort_keys=True)

        self.update_reviews[update_id] = final_json

        self._apply_update_review(campaign_id, final)

        return final_json

    def _normalise_update_review(self, parsed: dict) -> dict:
        verdict = str(parsed.get("verdict", "UPDATE_NEEDS_MORE_EVIDENCE")).upper()
        if verdict not in UPDATE_VERDICTS:
            verdict = "UPDATE_NEEDS_MORE_EVIDENCE"

        spending = str(parsed.get("spending_alignment", "NONE")).upper()
        if spending not in SPENDING_ALIGNMENT:
            spending = "NONE"

        evidence = str(parsed.get("evidence_quality", "NONE")).upper()
        if evidence not in EVIDENCE_QUALITY:
            evidence = "NONE"

        return {
            "verdict": verdict,
            "trust_delta": self._clamp_int(parsed.get("trust_delta", 0), -50, 50),
            "risk_delta": self._clamp_int(parsed.get("risk_delta", 0), -50, 50),
            "spending_alignment": spending,
            "evidence_quality": evidence,
            "concerns": self._clean_list(parsed.get("concerns", []), 8, 240),
            "positive_signals": self._clean_list(parsed.get("positive_signals", []), 8, 240),
            "reasoning_summary": str(parsed.get("reasoning_summary", ""))[:1000],
        }

    def _apply_update_review(self, campaign_id: str, review: dict) -> None:
        raw = self.campaigns.get(campaign_id, "")
        if not raw:
            return

        campaign = self._safe_json_obj(raw)
        campaign["last_update_review"] = review.get("verdict", "UPDATE_NEEDS_MORE_EVIDENCE")
        campaign["last_update_reviewed_at"] = self._marker()

        self.campaigns[campaign_id] = json.dumps(campaign, sort_keys=True)

        creator = str(campaign.get("creator", "") or "")
        if creator:
            rep = self._load_reputation(creator)
            rep["reputation_score"] = int(rep.get("reputation_score", 0)) + int(review.get("trust_delta", 0))
            rep["risk_score"] = self._clamp_int(
                int(rep.get("risk_score", 0)) + int(review.get("risk_delta", 0)),
                0,
                1000,
            )
            self._save_reputation(creator, rep)

    # ---------------------------------------------------------------------
    # Disputes
    # ---------------------------------------------------------------------

    @gl.public.write
    def flag_campaign(self, dispute_id: str, campaign_id: str, dispute_json: str) -> str:
        dispute_id = str(dispute_id).strip()
        campaign_id = str(campaign_id).strip()

        if not dispute_id:
            self._fail("dispute_id required")

        campaign_raw = self.campaigns.get(campaign_id, "")
        if not campaign_raw:
            self._fail("unknown campaign")

        if self.disputes.get(dispute_id, ""):
            self._fail("dispute id exists")

        data = self._safe_json_obj(dispute_json)
        if not data:
            self._fail("dispute_json must be a JSON object")

        data["dispute_id"] = dispute_id
        data["campaign_id"] = campaign_id
        data["reporter"] = self._sender()
        data["created_at"] = self._marker()
        data["status"] = "OPEN"

        self.disputes[dispute_id] = json.dumps(data, sort_keys=True)
        self.dispute_count = self.dispute_count + u256(1)

        self._append_index(self.disputes_by_campaign, campaign_id, dispute_id)

        campaign = self._safe_json_obj(campaign_raw)
        campaign["status"] = "UNDER_DISPUTE"
        campaign["last_dispute_id"] = dispute_id
        self.campaigns[campaign_id] = json.dumps(campaign, sort_keys=True)

        creator = str(campaign.get("creator", "") or "")
        if creator:
            rep = self._load_reputation(creator)
            rep["disputes_received"] = int(rep.get("disputes_received", 0)) + 1
            self._save_reputation(creator, rep)

        return dispute_id

    @gl.public.write
    def resolve_dispute(self, dispute_id: str) -> str:
        dispute_id = str(dispute_id).strip()

        dispute_json = self.disputes.get(dispute_id, "")
        if not dispute_json:
            self._fail("unknown dispute")

        dispute = self._safe_json_obj(dispute_json)

        if str(dispute.get("status", "")) == "RESOLVED":
            self._fail("dispute already resolved")

        campaign_id = str(dispute.get("campaign_id", "") or "")
        campaign_json = self.campaigns.get(campaign_id, "{}")

        def leader_review() -> str:
            prompt = (
                "You are reviewing a dispute filed against a crowdfunding campaign on Judgix.\n"
                "Assess whether the dispute is supported by evidence and what action, if any, "
                "should be taken.\n\n"
                "CAMPAIGN JSON:\n"
                + campaign_json
                + "\n\nDISPUTE JSON:\n"
                + dispute_json
                + "\n\n"
                "Return STRICT JSON ONLY:\n"
                "{\n"
                '  "verdict": "DISPUTE_PARTIALLY_VALID",\n'
                '  "campaign_action": "NEEDS_MORE_EVIDENCE",\n'
                '  "trust_delta": -5,\n'
                '  "risk_delta": 10,\n'
                '  "confirmed_issues": ["short confirmed issue"],\n'
                '  "unconfirmed_issues": ["short unconfirmed issue"],\n'
                '  "reasoning_summary": "Short summary."\n'
                "}\n"
            )
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            parsed = self._extract_json(raw)
            final = self._normalise_dispute_review(parsed)
            return json.dumps(final, sort_keys=True)

        review_json = gl.eq_principle.prompt_non_comparative(
            leader_review,
            task="Resolve a crowdfunding campaign dispute based on campaign evidence and dispute evidence.",
            criteria=(
                "The output must be strict JSON. The verdict must use one allowed dispute verdict. "
                "The campaign_action must be one allowed action. The result must not make legal conclusions."
            ),
        )

        parsed = self._extract_json(review_json)
        final = self._normalise_dispute_review(parsed)

        final["dispute_id"] = dispute_id
        final["campaign_id"] = campaign_id
        final["reviewed_at"] = self._marker()

        final_json = json.dumps(final, sort_keys=True)
        self.dispute_reviews[dispute_id] = final_json

        dispute["status"] = "RESOLVED"
        dispute["verdict"] = final.get("verdict", "INSUFFICIENT_EVIDENCE")
        self.disputes[dispute_id] = json.dumps(dispute, sort_keys=True)

        self._apply_dispute_review(campaign_id, final)

        return final_json

    def _normalise_dispute_review(self, parsed: dict) -> dict:
        verdict = str(parsed.get("verdict", "INSUFFICIENT_EVIDENCE")).upper()
        if verdict not in DISPUTE_VERDICTS:
            verdict = "INSUFFICIENT_EVIDENCE"

        action = str(parsed.get("campaign_action", "NO_ACTION")).upper()
        if action not in CAMPAIGN_ACTIONS:
            action = "NO_ACTION"

        return {
            "verdict": verdict,
            "campaign_action": action,
            "trust_delta": self._clamp_int(parsed.get("trust_delta", 0), -100, 50),
            "risk_delta": self._clamp_int(parsed.get("risk_delta", 0), -50, 100),
            "confirmed_issues": self._clean_list(parsed.get("confirmed_issues", []), 8, 240),
            "unconfirmed_issues": self._clean_list(parsed.get("unconfirmed_issues", []), 8, 240),
            "reasoning_summary": str(parsed.get("reasoning_summary", ""))[:1000],
        }

    def _apply_dispute_review(self, campaign_id: str, review: dict) -> None:
        raw = self.campaigns.get(campaign_id, "")
        if not raw:
            return

        campaign = self._safe_json_obj(raw)

        action = str(review.get("campaign_action", "NO_ACTION"))

        if action == "NEEDS_MORE_EVIDENCE":
            campaign["status"] = "NEEDS_MORE_EVIDENCE"
        elif action == "RISKY":
            campaign["status"] = "RISKY"
        elif action == "SUSPICIOUS":
            campaign["status"] = "SUSPICIOUS"
        elif action == "SUSPENDED":
            campaign["status"] = "SUSPENDED"
        elif action == "REJECTED":
            campaign["status"] = "REJECTED"
        elif action == "NO_ACTION":
            if campaign.get("status") == "UNDER_DISPUTE":
                campaign["status"] = "RESOLVED_NO_ACTION"

        campaign["last_dispute_action"] = action
        campaign["last_dispute_reviewed_at"] = self._marker()

        self.campaigns[campaign_id] = json.dumps(campaign, sort_keys=True)

        creator = str(campaign.get("creator", "") or "")
        if creator:
            rep = self._load_reputation(creator)

            rep["reputation_score"] = int(rep.get("reputation_score", 0)) + int(review.get("trust_delta", 0))
            rep["risk_score"] = self._clamp_int(
                int(rep.get("risk_score", 0)) + int(review.get("risk_delta", 0)),
                0,
                1000,
            )

            if review.get("verdict") == "DISPUTE_CONFIRMED":
                rep["disputes_confirmed"] = int(rep.get("disputes_confirmed", 0)) + 1

            self._save_reputation(creator, rep)

    # ---------------------------------------------------------------------
    # Views
    # ---------------------------------------------------------------------

    @gl.public.view
    def get_campaign(self, campaign_id: str) -> str:
        return self.campaigns.get(str(campaign_id), "")

    @gl.public.view
    def get_campaign_review(self, campaign_id: str) -> str:
        return self.campaign_reviews.get(str(campaign_id), "")

    @gl.public.view
    def get_similarity_review(self, review_key: str) -> str:
        return self.campaign_similarity_reviews.get(str(review_key), "")

    @gl.public.view
    def get_update(self, update_id: str) -> str:
        return self.campaign_updates.get(str(update_id), "")

    @gl.public.view
    def get_update_review(self, update_id: str) -> str:
        return self.update_reviews.get(str(update_id), "")

    @gl.public.view
    def get_dispute(self, dispute_id: str) -> str:
        return self.disputes.get(str(dispute_id), "")

    @gl.public.view
    def get_dispute_review(self, dispute_id: str) -> str:
        return self.dispute_reviews.get(str(dispute_id), "")

    @gl.public.view
    def get_creator_campaigns(self, creator: str) -> str:
        return self.creator_campaigns.get(str(creator), "[]")

    @gl.public.view
    def get_creator_reputation(self, creator: str) -> str:
        return self.creator_reputation.get(str(creator), "{}")

    @gl.public.view
    def get_protocol_stats(self) -> str:
        return json.dumps(
            {
                "campaigns": str(self.campaign_count),
                "reviews": str(self.review_count),
                "updates": str(self.update_count),
                "disputes": str(self.dispute_count),
            },
            sort_keys=True,
        )

    # ---------------------------------------------------------------------
    # Global / per-campaign listing views
    # ---------------------------------------------------------------------

    @gl.public.view
    def list_campaigns(self, offset: str, limit: str) -> str:
        """Return a JSON list of campaign_ids in insertion order, paginated."""
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

        all_ids = self._safe_json_list(self.campaign_index.get("all", "[]"))
        return json.dumps(all_ids[start:start + n])

    @gl.public.view
    def get_updates_for_campaign(self, campaign_id: str) -> str:
        """Return a JSON list of update_ids for a campaign."""
        return self.updates_by_campaign.get(str(campaign_id), "[]")

    @gl.public.view
    def get_disputes_for_campaign(self, campaign_id: str) -> str:
        """Return a JSON list of dispute_ids for a campaign."""
        return self.disputes_by_campaign.get(str(campaign_id), "[]")