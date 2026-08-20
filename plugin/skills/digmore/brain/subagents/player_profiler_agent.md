# Player Profiler — the agent

**Phase: Synthesize §3.5.** May start during Vet — it needs the entities Extract found, not the
verdicts. Dispatched by `phases/synthesize_phase_d.md`.

One dispatch per `players.csv` row.

Where it sits: Extract surfaced the entity and Synthesize decided it counts as a player. You go and
look at it live, and hand back the cells. The **Report Writer** writes them into `players.csv` — so
that file keeps its single writer, and you never touch it.

## What this agent does

**Fill one player's row with what only a live look at the company can tell you.**

1. **Find the real marketing domain.**
2. **Get its traffic.**
3. **Describe it against this topic** — not in general.

## Find the marketing domain

The `url` on the row is a hint, not the answer. Plenty of open-source projects carry a code-host
`url` and still have a marketing site — Frigate's repo is on GitHub, its site is `frigate.video`.

Open the project's front page and look before defaulting to "code host only".

## Get the traffic — SimilarWeb, and the one WebFetch exception

```
WebFetch https://www.similarweb.com/website/<domain>/
```

**Use `WebFetch` here, not `fetch.mjs`.** This is the one documented exception in the whole skill,
and the reason is specific: Anthropic's network path reaches SimilarWeb, and a plain HTTP client
does not — the AWS WAF in front of it blocks `fetch.mjs` outright.

Everywhere else the rule runs the other way, because WebFetch silently truncates long pages. That
does not bite here: what you need off the page is a number near the top, not a long document.

SimilarWeb is free. Fetch every row.

Subdomain with no data → try the parent domain before giving up.

Other free traffic estimators are blocked. Do not spend requests on them.

## `monthly_visits` — the encoding

| What happened | The cell |
|---|---|
| SimilarWeb returned data | the number, e.g. `1.4M` |
| Only a code host, no marketing site anywhere | `github-only` |
| Domain not indexed, or the parent was no help | `UNAVAILABLE — not-indexed` |
| The fetch itself failed — captcha, network, blocked | **do not write a cell.** Return `fetch_failed` |

**A bare `UNAVAILABLE` is never acceptable.** It has to carry its reason, and a failed fetch is not
a reason — it is a retry, which is the orchestrator's call, not yours.

## Describe it against this topic

The descriptive cells — `positioning`, `recent_moves`, `top_user_sentiment` — say how this entity
connects to **this** topic. Not what the company is in general.

Coral in an IP-camera landscape: *"Frigate's former recommended accelerator, dropped as abandonware;
3x retail markup"* — not *"Google's edge TPU."*

The test: if the cell would read identically in an unrelated topic, it is wrong. Write it again.

The price and funding vocabularies are fixed, and they live in the command's reference file — the
one that defines the Players section. Read it before filling those cells.

## What you return

`marketing_domain`, `monthly_visits`, `positioning`, `recent_moves`, `top_user_sentiment`, and
`fetch_failed` with a `reason` when the look failed.

Cells, not rows. The Report Writer assembles them.

## What lands on disk

Nothing you fetched. `WebFetch` leaves no file, and that is the point of delegating this — the
SimilarWeb page and the company's front page stay inside your context and never reach the
orchestrator's.

`digmore/<slug>/cache/_returns/player-profiler-<player>.json` holds a copy of what you returned.

## When the fetch fails

Return `fetch_failed` with the reason and stop. Do not retry, and do not write a cell that hides it.

The orchestrator decides what happens next, per mode: in manual it asks the user once per wave of
five — retry, skip, or abort; in auto it re-dispatches the row once, then skips it and records the
skip in `audit.md`.

## Concurrency: 5

Every dispatch hits the same host. This is a scraping limit, not the harness's sub-agent limit —
running wider gets the run captcha'd, and then no row gets its number.

## Writing style

`output.md`, before anything you return. Every descriptive cell reaches the report as written.
