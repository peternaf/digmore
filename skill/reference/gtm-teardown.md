# Digmore — GTM teardown

A five-phase pass focused on ONE company's go-to-market behavior. Name every tactic, channel, insider promoter and community reaction — with measured reach and worked-example URLs.

**Read `../brain/index.md` first and follow it.** This file adds only what is specific to `gtm`.

## Input framing and chaining

Parse args for company identity, focus axes and a parent-topic hint. List `digmore/`; if a `competitor` or `landscape` topic exists for the same company, treat this as chained per `../brain/topic.md` §"Branched topic", and read the parent's GTM and Customer-sentiment sections as the starting frame. Extract still runs, tightened to angles the parent didn't cover.

`topic.json.kind` is `gtm-teardown`.

## What this command emphasizes

Behavior, not capability. "How do they show up in front of buyers, and what happens when they do?"

Scope's angles replace the generic set:

1. **Channel mapping** — where they appear; per occurrence date · URL · upvotes/comments/views.
2. **Tactics** — repeated go-to-market moves (see the Tactics inventory below for the open list to populate).
3. **Insider promoter network** — every handle observed promoting; cross-source identity; disclosure per handle.
4. **Reception + repercussions** — mod actions, flagged posts, name-and-shame lists, conflict-of-interest call-outs, terms-of-service exposure.
5. **Distribution metrics** — observed reach numbers (upvotes, comments, follower deltas, citation counts).

Search queries are tactic-anchored, not capability-anchored.

**What `--quick` runs here.** This replaces `../brain/modes.md`'s source set for `gtm` only: Reddit and Hacker News, nothing else. Twitter and forums are skipped, because a tactic needs a worked example per occurrence and those two return the least of it per URL. Every other reduction in that file applies here unchanged. With no API key this leaves Hacker News alone — too thin a base for a teardown, and the summary says so at the top.

Three phases carry command-specific weight:

- **Vet** — heavy promoter-pattern vetting. Every brand-mentioning handle gets full `vet_user`, and `promoter` / `spammer` verdicts are first-class findings rather than a drop-list.
- **Synthesize** — build the promoter network as a cross-source identity graph. Replies to insider promoters by `legit` handles are top-tier evidence.
- **Audit** — every "X did Y" tactic-attribution claim must resolve to a URL where Y is visible. The `manual-verify-required` cap is reserved for tactic attributions.

## 1. The summary

Sections in this exact order.

1. **Verdict** — 3–5 bullets, each cited:
   - **Authenticity stance** — transparent / mixed / covert / deceptive.
   - **Dominant channel** — where most observed reach comes from.
   - **Strongest tactic** — most distribution per unit effort.
   - **Repercussion summary** — bans, flags, conflict-of-interest call-outs (one line each, or "none surfaced" explicitly).
2. **Non-trivial insights & unexpected expert takes** — surprises, contrarian takes, common misconceptions.
3. **Channels** — one table, sorted by activity DESC. Columns: `Channel | Activity | Posts | Median upvotes/comments | Sentiment | Worked-example URL`.
4. **Tactics inventory** — every observed tactic. Per tactic: one-line name + one-line description + **two worked examples** (date · handle · URL · outcome) + tag (`transparent` / `gray` / `deceptive` / `unclear`). Single-instance tactics tagged `single-instance` with downgraded confidence. No tactic listed without a worked-example URL.
5. **Insider promoter network** — one sub-section per identified promoter. Real name (if known), cross-source handles, verdict, brand-mention count per source, URL-repetition pattern, first→last observed dates, disclosure pattern, notes. Source-link every claim.
6. **Distribution metrics observed** — best/median/worst upvotes per channel. Best-post URL + metrics. Worst-or-flagged URL. Follower deltas correlated with posts where observable. Unobservable metrics named explicitly with the reason.
7. **Reception** — quoted reactions from `legit`-verdict handles. Group: praise · skepticism · conflict-of-interest call-outs · indifference. Per entry: handle + verdict + URL + quote.
8. **Repercussions** — concrete consequences (subreddit bans, HN flags, mod removals, name-and-shame entries, terms-of-service exposure). Per entry: URL + date + the consequence.
9. **Cadence & lifecycle** — steady drip vs burst; account ages of insider handles; correlations with product launches / pricing changes / competitor moves.
10. **What independents say works (or doesn't)** — `legit`-verdict replies to insider promoters. The reply is evidence about the tactic, even when it doesn't name the brand.
11. **Refuted / unsubstantiated** — claims that didn't survive Audit. Kill reason + original URL.
12. **Run footer** — per `../brain/reporting.md`.

**When the run reached only one source**, say so at the top of the summary rather than presenting a one-source run as a survey of the company's go-to-market.

## 2. `promoter_network.csv` — first-class output

Parallel to `experts.csv` but for insiders. Columns:

```
real_name, role, reddit, hn, twitter, github, website, sources, person_verdict, brand_mention_count, url_repetition_pattern, first_seen, last_seen, disclosure_pattern, notes
```

- `role` — `founder` / `cofounder` / `employee` / `contractor` / `affiliate` / `fan` / `unknown`.
- `sources` — pipe-separated.
- `person_verdict` — Vet verdict (`promoter` / `spammer` / `unknown` / `legit-but-conflicted`).
- `brand_mention_count` — encoded `reddit|24,hn|13`.
- `url_repetition_pattern` — `same-URL` / `same-brand-different-URLs` / `mixed` / `none`.
- `disclosure_pattern` — `always` / `sometimes` / `never`.

Written directly, not through `experts.mjs` — that script owns `experts.csv` and its schema only.

## 3. The rest

`experts.csv` here captures the non-conflicted observers who commented on the company's tactics; their critiques drive sections 7 and 10. `players.csv` is written only when chained from a landscape parent — focal company plus 3–5 nearest peers — and omitted otherwise. `raw_research_outcomes.md` and `audit.md` are the brain's, unchanged.
