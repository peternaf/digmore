# Digmore — Competitor

A five-phase research pass focused on ONE competitor. Goal: a verdict — moat strength, wedge to exploit, weakness to attack — backed by depth across positioning, pricing, GTM, recent moves, customer sentiment, leadership and hiring signals. Plus the same non-trivial-insights payoff `landscape` produces.

**Read `../brain/index.md` first and follow it.** This file adds only what is specific to `competitor`.

## Input framing

Args can be a name, a URL, prose, or any mix:

- `/digmore competitor Mux`
- `/digmore competitor mux.com`
- `/digmore competitor Mux, focus on live-streaming pricing and Cloudflare encroachment`
- `/digmore competitor --auto Cloudflare Stream`

Parse out the competitor's identity (name + URL if known), any focus areas, and a parent-topic hint ("the X from my video-apis topic"). `topic.json.kind` is `competitor`. If the args cannot disambiguate the subject — "research Stream" could be Cloudflare Stream, Mux Stream or Stream.io — clarify before slugging, per `../brain/topic.md`.

## Chaining from landscape

When `parent_slug` points at a landscape topic AND that topic's `players.csv` has a row matching the competitor:

1. Inherit the parent's `experts.csv`, per `../brain/topic.md` §"Branched topic".
2. Read the parent's `players.csv` row for this competitor — it becomes Extract's starting frame, saving a rediscovery of positioning, URL, `monthly_visits` and the rest.
3. Read the parent's summary sections that reference this competitor (the Players row plus any inline insights). These reach the synthesizer as prior context, not as claims to re-cite.
4. This topic's `players.csv` lists the focal competitor plus its 3–5 nearest peers, drawn from the parent where available.

No parent, or no matching row: research from scratch, no inheritance.

## What this command emphasizes

Depth on one player, not breadth across a market. Scope's angles are tighter and tailored:

- Positioning + messaging (how they describe themselves vs. how the market describes them).
- Pricing teardown (public tiers + hidden costs + comparable market pricing).
- Recent moves (funding, launches, hires, shutdowns, GTM pivots — last 90 days).
- Customer sentiment (likes, complaints, willingness-to-pay — specific to this player, deeper than landscape).
- GTM (channels, ICPs, sales motion, marketing motions).
- Leadership + hiring signals (founders, exec hires, open roles — open roles signal roadmap).

Search fans across the same sources as landscape, but every query is competitor-anchored ("Mux pricing", "Mux complaints", "Mux vs Cloudflare Stream").

Phase weights: Extract and Synthesize carry the most signal. Vet is usually cheap when chained from a parent, because `experts.csv` arrives pre-populated.

## 1. `<topic-slug>.md` — the summary

Sections in this exact order.

1. **Verdict** — three to five short bullets total:
   - **Moat** — what protects this competitor (network effect, data lock-in, distribution, IP, brand, capital). One line each. If no moat is identifiable, say so.
   - **Wedge** — where a new entrant could attack (under-served segment, pricing gap, product weakness). One or two specific openings.
   - **Weakness** — what they're bad at, what users complain about most, what their recent moves suggest they're worried about.

   This is the top-of-summary payoff. Anchor every bullet with at least one inline URL.

2. **Non-trivial insights & unexpected expert takes** — surprises that contradict the user's likely priors, contrarian expert takes, common misconceptions about this competitor or the space they operate in (even if not directly about the competitor). This is the discovery payoff — sometimes the most valuable finding is adjacent to the competitor, not about them.

3. **Positioning** — how they describe themselves (messaging, taglines, ICP signals from their site / pricing page / content) vs. how the market describes them (analyst takes, customer reviews, expert commentary). Surface the gap when present.

4. **Pricing teardown** — public tiers with entry-tier numbers, model (usage / seat / tiered), hidden costs (overages, support tiers, enterprise minimums). One paragraph on how this compares to the 2–3 closest peers (pull from `players.csv` if chained).

5. **Product / feature inventory** — what they actually ship vs. what they market. Group by capability area. Flag features that are marketing-only (announced, not generally available).

6. **Recent moves (last 90 days)** — funding, launches, shutdowns, exec hires, GTM pivots. Each with a date and an inline URL. If nothing surfaced, say so explicitly — silence reads as activity.

7. **Customer sentiment** — three sub-sections: what users love, what they complain about, what they pay for or would pay more for. Each entry cites handle + verdict + URL.

8. **GTM** — channels (where they sell), ICPs (who they sell to, by evidence not stated targeting), sales motion (PLG / sales-led / hybrid), marketing motions (content, community, partnerships).

9. **Leadership & hiring signals** — founders + exec team (background, prior companies). Open roles as a roadmap signal: what they're hiring for tells you what they're building. Cite the job-board URL.

10. **Refuted / unsubstantiated** — claims that surfaced but didn't survive Audit. Kill reason + original URL. Negative space matters — silently dropping looks like coverage.

11. **Run footer** — per `../brain/reporting.md`.

## 2. `players.csv` — focal competitor + 3–5 nearest peers

Same columns and the same player test as `landscape.md` §2. When chained from a parent, inherit the matching rows and refresh them; add new peers surfaced during research. One row per competitor.

## 3. The rest

`experts.csv`, `raw_research_outcomes.md` and `audit.md` are the brain's, unchanged. `experts.csv` is inherited at the moment of branching when chained, and augmented during the run.
