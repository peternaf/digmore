# Digmore — Landscape

A five-phase research pass over a market or space. The goal is a fact-checked, expert-vetted map of who exists, what they sell, what users say, and where the surprises are. No verdict, no recommendation — just the map.

**Read `../brain/index.md` first and follow it.** This file adds only what is specific to `landscape`.

## Input framing

Free-form prose. Examples:

- `/digmore landscape video API providers — pricing tiers and recent moves`
- `/digmore landscape ffmpeg as a service` (underspecified — clarify before slugging, per `../brain/phases/plan_phase_a.md` §1)
- `/digmore landscape --auto serverless OLAP databases B2B`

## What this command emphasizes

Breadth over depth on any one player. Each player gets coverage; none gets exhaustive. The payoff is in:

- Non-trivial insights and contrarian expert takes (the "why we paid for this research" section).
- A clean comparison matrix (`players.csv`) that holds up across players.
- Discovery of hubs and experts the user can follow.

Phase weights: Extract and Synthesize carry the most signal. Vet is cheap when `experts.csv` is pre-populated (chained topics), expensive when fresh. Audit is bounded by its claim cap either way.

## 1. The summary

Sections in this exact order.

1. **Players** — single consolidated table; no per-player sub-sections. Columns: `Player | Visits | Positioning | Price`. Two rows per player. Rows sorted by `monthly_visits` DESC, then `name` ASC.

   Each player = exactly **2 markdown rows**. Cells separated by `|` (NOT `·` — that's the visual bullet inside a single cell, not between cells). Worked example:

   ```
   | **[Ollama](https://ollama.com)** | **11.1M** | Local LLM runtime hosting the VLMs builders run on-device | free |
   | Recent moves: Substrate beneath visaioss / LLM Vision / Aegis AI | Segment: B2B-prosumer · Deployment: self-hosted | Integrations: LLM Vision, Frigate genai, visaioss, Aegis AI, Home Assistant | Funding: VC-backed (undisclosed) |
   ```

   Row 1 cells (linked, visits bold): name · visits · positioning · price.
   Row 2 cells (plain text): recent moves · segment + deployment · integrations · funding.

   - Price values: `$50/mo`, `$0.005/min`, `~$25 one-time`, `bundled hardware`, `free`, or `contact sales`. NOT `tiered + usage` / `usage-based` — fetch the vendor's pricing page.
   - Funding values: total $ raised (`$180M total`), or `public`, `none`, `donations`, `foundation: <name>`, `acquired by <buyer>`, `academic: <institution>`, `solo dev`. NOT round names (`seed`, `Series B`).

   No truncation. Below the table: one line linking to `players.csv`.

2. **Hubs** — subreddits, HN keyword feeds, specialty forums, expert blogs, and any organisation account worth following. No vendor Twitter/X (see `../brain/output.md` "Hubs voice"). Closes with an **Individuals to follow** table: 10-17 humans from `experts.csv`, keeping rows whose `topical_relevance` is `high` or `medium`, and people rather than organisations.

   Columns: `Handle | Platform | Karma/Followers | Activity | Last active | Why interesting | Community value`. Row order: Reddit → HN → forums → Twitter/X. Within each block, sort by Karma/Followers DESC.

   Handles are linked: `[u/handle](https://www.reddit.com/user/handle)`, `[hn/handle](https://news.ycombinator.com/user?id=handle)`, `[@handle](https://x.com/handle)`, forums by their profile URL pattern.
   - Karma/Followers: total karma (Reddit/HN) or followers + notable follow-ratio (X). Split post/comment karma when tracked.
   - Activity: one extractable number — comments-sampled / `<stories>+<comments>` / tweet count.
   - Last active: from `experts.csv.last_active`. `—` if unknown. Dormant >6mo = downweight signal.
   - Why interesting: identity — who they are, role, what they're known for.
   - Community value: lead with **sustained contribution** (subject = the person: "his sustained X", "he bridges Y"); gain follows after a dash. Describe the role that makes the artifact matter ("his bridges are the layer every prosumer HA dashboard rides on — any RTSP camera renders in Chrome without a vendor cloud"), not the artifact itself ("he built the bridge"). Sustained patterns only.
   - Generic or `—` when genuinely unknown; otherwise the person doesn't belong.

3. **What users complain about** — each item is a research seed for future passes.

4. **What users pay for** — what users open their wallets for (distinct from "like"; pay = evidence of value).

5. **Buying signals** — stated willingness-to-pay, switching intent, feature requests with payment context.

6. **Non-trivial insights & unexpected expert takes** — surprises contradicting likely priors, contrarian takes, misconceptions experts call out. Every entry: inline URL + handle + verdict.

7. **Adjacent spaces** (nice-to-have) — related markets. Informational; do NOT pre-bake follow-up suggestions.

8. **Refuted / unsubstantiated** — claims that didn't survive Audit. Kill reason + original source URL.

9. **Jargon** — recurring terms + meaning.

10. **Run footer** — per `../brain/reporting.md`.

## 2. `players.csv` — full player matrix

Wide-table CSV of every player × every dimension. Renders cleanly in a spreadsheet or CSV viewer. Linked from the summary.

**Who counts as a player.** A player is anyone whose product, platform, or service the user would have to know about to operate in this market — competitors, the platforms users ship into, the channels they distribute through, the integrators who package their work, and incumbents reaching in from adjacent markets. The test: does what this entity ships, charges, or roadmaps materially affect a builder in this market? If yes, it's a player. Being "the platform users build on" is NOT a reason to exclude — if it also ships first-party products in the same space, it's a player too.

**Inclusion cross-check (run before finalizing).** List every entity mentioned 5+ times across `raw_research_outcomes.md` and the source notes. Each one is either a row in `players.csv` OR excluded on purpose — and an exclusion is written into `audit.md` with the entity and the reason. If it is neither, add it as a player.

Required columns (in this order):
- `name`
- `positioning` (short headline)
- `url`
- `offerings` (semicolon-separated)
- `pricing_model` (e.g. usage-based, seat-based, tiered)
- `entry_tier_price_usd` — numeric (e.g. `40`, `0.005`), `free`, or `contact sales` (not `POA`).
- `monthly_visits` — encoded per `../brain/sources/websearch.md`, filled per `../brain/phases/synthesize_phase_d.md` §3.5.
- `top_user_sentiment` (one-line: positive / mixed / negative + the dominant theme)
- `recent_moves` (last 90 days; semicolon-separated; each with date)
- `funding_stage` (if applicable: bootstrapped / seed / A / B / public / acquired)

Optional columns the run may add when surfaced (decide per-topic):
- `target_segment` (B2B / B2C / B2B-prosumer)
- `deployment_model` (SaaS / self-hosted / hybrid)
- `key_integrations`
- `notable_customers`

## 3. The rest

`experts.csv`, `raw_research_outcomes.md` and `audit.md` are the brain's, unchanged — see `../brain/vetting.md` and `../brain/phases/`. `raw_research_outcomes.md` carries every datapoint as a structured claim, with no per-source cap.
