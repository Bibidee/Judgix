# Judgix — Crowdfunding Trust, Judged by Decentralised Intelligence

A GenLayer-powered legitimacy and authenticity layer for crowdfunding campaigns. Donors, platforms, and grantmakers get a structured verdict — authenticity score, risk level, evidence quality, red flags, donor advisory — produced by GenLayer validator consensus over messy real-world evidence.

## Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript strict + Tailwind CSS + Relief Signal palette (Fraunces / IBM Plex Sans / IBM Plex Mono).
- **Contract**: GenLayer intelligent contract ([contracts/judgix.py](contracts/judgix.py)).
- **Wallet**: embedded localStorage signer with reveal/copy/rotate/import/backup.
- **State**: IndexedDB for submit-form drafts; the contract is the source of truth for everything else.

## Network and contract

- **Network**: GenLayer Studio Network — chain id `6199`, symbol `GEN`, endpoint `https://studio.genlayer.com/api`.
- **Contract**: `0x53Fa17B148006bd59B2484ef8414840ECfaAfd06`.
- **CORS**: the browser cannot reach Studio directly. `next.config.js` rewrites `/api/genlayer/*` → `${GENLAYER_UPSTREAM}/*` server-side, so all SDK calls funnel through the Next.js process.

## Environment variables (`.env.local`)

```bash
NEXT_PUBLIC_JUDGIX_ADDRESS=0x53Fa17B148006bd59B2484ef8414840ECfaAfd06
NEXT_PUBLIC_GENLAYER_RPC=/api/genlayer
GENLAYER_UPSTREAM=https://studio.genlayer.com/api
NEXT_PUBLIC_DEMO_MODE=false
```

- `NEXT_PUBLIC_JUDGIX_ADDRESS` — deployed Judgix contract.
- `NEXT_PUBLIC_GENLAYER_RPC` — what the browser talks to (the local proxy).
- `GENLAYER_UPSTREAM` — what the proxy forwards to (Studio Network API). **Not** prefixed `NEXT_PUBLIC_` so the value stays server-side.
- `NEXT_PUBLIC_DEMO_MODE` — leave as `false`. Demo/mock data has been removed; this flag is kept for forward-compat only.

## Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Sanity-check the proxy:

```bash
curl -X POST http://localhost:3000/api/genlayer \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":[]}'
# → {"jsonrpc":"2.0","result":"OK","id":1}
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing · hero, how-it-works, recent on-chain case files |
| `/campaigns` | Explorer — reads `list_campaigns` from contract; filters/search/sort |
| `/campaigns/[id]` | Case file — verdict, evidence, public signals, updates, disputes, reputation, audit |
| `/campaigns/[id]/update` | Creator-only update; calls `submit_update` → `review_update` |
| `/campaigns/[id]/flag` | Any wallet files a dispute; owner gets `resolve_dispute` |
| `/submit` | New campaign — `create_campaign` → `submit_campaign_for_review` → `review_campaign`, with IndexedDB autosave |
| `/review` | Moderator docket — owner-only `review_campaign` trigger |
| `/creators/[address]` | All campaigns by a creator + their on-chain reputation |

## GenLayer contract

[contracts/judgix.py](contracts/judgix.py) is a single intelligent contract that:

1. Stores campaigns / updates / disputes / reviews as JSON strings in `TreeMap[str, str]`.
2. Maintains a **global campaign index** (`campaign_index`) plus per-campaign **update** and **dispute** indices so the explorer can list everything without an off-chain crawler.
3. Runs **non-deterministic** review via `gl.eq_principle.prompt_non_comparative` for:
   - `review_campaign` — authenticity verdict
   - `detect_campaign_similarity` — plagiarism / duplicate-story risk
   - `review_update` — fund-usage alignment
   - `resolve_dispute` — campaign action and trust/risk deltas
4. Normalises validator JSON output against the allowed enums and clamps scores.
5. Maintains `creator_reputation` (verified / risky / rejected counts, reputation & risk scores) so creator pages have an on-chain track record.

### Key views

- `list_campaigns(offset, limit) -> str` — paginated global id list
- `get_campaign(id)`, `get_campaign_review(id)`
- `get_updates_for_campaign(id)`, `get_update(id)`, `get_update_review(id)`
- `get_disputes_for_campaign(id)`, `get_dispute(id)`, `get_dispute_review(id)`
- `get_creator_campaigns(creator)`, `get_creator_reputation(creator)`
- `get_protocol_stats()`

## Role gating

| Role | Can do |
| --- | --- |
| Public (no wallet) | Read everything |
| Connected wallet | File a dispute |
| Connected wallet matching `campaign.creator` | Post updates |
| Connected wallet matching contract `owner()` | Trigger `review_campaign` and `resolve_dispute` |

The wallet popover displays the role chip (`PUBLIC` or `MOD`) and the contract owner so role state is auditable from the UI.

## Disclaimer

Judgix provides decentralised evidence review, not a legal guarantee.
