# Vetting (mandatory, per source)

Two independent dimensions are tagged per datapoint:
1. **Person credibility** — the commenter / author.
2. **Source quality** — the URL itself.

Both must be tagged. They feed different downstream decisions (credibility filters Synthesize, source quality ranks Audit).

## Person credibility — `vet_user`

Every sourced quote must pass `vet_user` (or the source equivalent) before being used. No exceptions.

Verdicts:
1. `legit` — quote freely.
2. `unknown` — quote with caveat ("anonymous, unverified"). Applies when signal is insufficient: profile hidden/deleted, brand-new account with no history, or source doesn't expose enough metadata.
3. `promoter` — only quote as a promotional signal, labeled.
4. `troll` / `spammer` — drop.

Verdict schema is shared across sources. Source-specific signals live in `subagents/handle_vetter_agent/<source>.md`.

## Source quality (per URL, independent of commenter)

Each fetched source is classified independently of who posted it:
- `primary-self` — the subject's own vendor docs, pricing pages, company changelogs, first-party benchmarks. Factually accurate for THEIR product but biased; never trust marketing claims at face value.
- `primary-3p` — independent primary sources: analyst reports, regulatory filings, third-party benchmarks, academic papers, government data.
- `secondary` — established outlets (Stripe blog, TechCrunch, Smashing Magazine), well-known engineering blogs.
- `blog` — individual blogs, Medium, Substack, personal sites.
- `forum` — Reddit, HN, Discord, specialty forums.
- `internal` — a document or text the user handed over. See `subagents/page_analyst_agent/local.md`.
- `unreliable` — content farms, marketing collateral, dead links, paywalled-no-cache.

Used to (a) rank claims in Audit, (b) drive the confidence label on each finding in the summary.

Rank order: `primary-3p` > `primary-self` > `secondary` > `blog` > `forum` > `unreliable`. `internal` sits outside the ranking — see `subagents/page_analyst_agent/local.md`.

## Confidence tag rule

Each finding in the summary gets a `high` / `medium` / `low` confidence tag:

- `high` — `primary-3p`, OR multi-source corroboration (different domain AND different source AND different expert — any 2 of 3 axes per `phases/synthesize_phase_d.md`).
- `medium` — single `primary-self` or `secondary` source, or split signal.
- `low` — blog/forum single source, OR `manual-verify-required` / `low-confidence-unverified` after Audit.

Audit can demote a tag (e.g. high → low if the corroborating sources turn out to share an author).

## Output marking

Output sections that cite a source must include the verdict next to the handle:

```
**u/<name>** [legit]    ← Reddit
**hn/<name>** [legit]   ← Hacker News
**x/<name>** [legit]    ← Twitter / X
```

If the verdict is `unknown` or `promoter`, mark accordingly. `troll` / `spammer` should not be in the output at all (the quote was dropped).

## Curated experts (per topic)

`digmore/<topic-slug>/experts.csv`. Schema (column order is load-bearing):

```
real_name, reddit, hn, twitter, github, website, sources, notes, last_active, topical_relevance
```

- Only experts (legit verdict). Charlatans / promoters / spammers are not stored — they're dropped per-run.
- One row per person, spanning sources. Cross-source identity = filling more handle columns when known (e.g., an HN bio that links elsewhere).
- A row needs a `real_name` or at least one handle. An empty `real_name` is fine — plenty of experts are known only as `u/someone` — but a row with neither can never be matched again, and `experts.mjs` refuses it.
- `sources` = pipe-separated list of sources where this person is active.
- `github` holds a GitHub handle found through web search — worth recording wherever it turns up.
- During a run: any commenter / author whose handle matches a row is auto-promoted to `legit`, skipping behavioral vetting.
- Vet appends newly identified experts via `experts.mjs add` (locked, atomic).
- `last_active` = the user's real last post or comment (`YYYY-MM-DD`) — NOT the vetting run date. `—` when unknown. Reddit/HN: the most recent comment timestamp; Twitter: the latest tweet. When several sources report a date for one person, the latest wins: one person, one *last active anywhere*.
- `topical_relevance` = `high` / `medium` / `low`, your own reading from the topical-relevance check below. `high` — this topic is something they work on or return to; `medium` — they touch it credibly but it is not their subject; `low` — one or two on-topic posts and no more. Anyone scoring below that has zero recent on-topic activity, which demotes them to `unknown` and keeps them out of the file entirely. When several sources disagree, the strongest reading wins — squarely on-topic in one place and glancing in another is on-topic.

The CSV is the union of every legit person across the topic. `experts.mjs` enforces an idempotent merge: re-merging the same row returns `no-op`; matching by `real_name` OR any handle column unions sources and fills missing handle columns. It takes a lock while it does so, because Vet fans out per source and two sub-agents appending at once would otherwise lose one of the two rows.

## Inheritance on branched topics

When a topic is branched from a parent, the child inherits the parent's `experts.csv` by **copy at the moment of branching**. The child can diverge cleanly without affecting the parent. There is no chain-lookup.

## Per-source vetting signals

Behavioral signals live in `subagents/handle_vetter_agent/<source>.md`. Examples:
- Reddit: account age, karma split, URL repetition, sub concentration, burst posting.
- Hacker News: karma, account age, lifetime story / comment counts, recent comment sampling.
- Twitter: two depths (profile alone, or profile + the handle's recent posts), heuristic floor + LLM judgment for the expert/marketer call.
- WebSearch: domain authority + cross-reference against other sources' people.
- The user's own documents: no vetting — there is no handle to vet. See `subagents/page_analyst_agent/local.md`.

## Topical relevance — caller responsibility

The source scripts' `vet_user` heuristics do NOT check topical relevance (the "does the commenter discuss similar topics elsewhere" signal). The script doesn't know what the topic is.

You — the orchestrating skill — layer that check on top of the script's verdict using the user's recent comments: on Reddit that is `recent_comments`, each object carrying its own body and subreddit, and on other sources the equivalent field. A handle that the heuristic returns `legit` for is still demoted to `unknown` if they have zero recent on-topic activity.

The reading you take here is not just a filter — record it as `topical_relevance` on the row you write, per the schema above. It is the only place that judgement is made, and `../reference/landscape.md`'s Hubs table reads the column back.
