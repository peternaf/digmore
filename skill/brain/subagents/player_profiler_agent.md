# Player Profiler — the agent

| Field | |
|---|---|
| **Phase** | Enrichment `[4/6]`, at its profiling sub-step |
| **Purpose** | Fill one player's row — every cell of it. One agent owns everything the run says about one company, so no cell falls between two actors |
| **Input text** | one player's name and url · the topic · **the columns this run's `players.csv` carries**, since the optional ones are decided per topic and cannot be inferred · the topic-lens rule: a cell that would read identically in an unrelated topic is wrong |
| **Input rule files** | `subagents/player_profiler_agent.md` · `fetching.md` · the command's reference file, for the column list and the price and funding vocabularies · `output.md` |
| **Input data files** | **the path to `player_candidates.json`** — it finds its own entry there and follows the claim references, already filtered to the voices the run listens to. It opens those claims files itself; the text never reaches the orchestrator |
| **Runs** | reads the claim files it was pointed at, no network · WebSearch then `fetch.mjs` for sentiment · `fetch.mjs` on the front page · `fetch.mjs` on the pricing page · **WebFetch** on SimilarWeb · WebSearch then `fetch.mjs` for funding and recent moves · `validate.mjs` on the cells it hands back, one repair and one re-check. Gathering is ordered; composing and checking are the closing steps |
| **Settings that control it** | **`extract.fetchesPerBranch` — this agent enforces it**, as the pages one dispatch may open across all six steps. It is the one configuration spent outside the phase it is named for: the quantity is the same one — how many pages an agent may open before it works with what it has — and a second number holding the same value drifts. There is still no cap on rows profiled and no `--fast` reduction; the five-document floor and the claim filter are that bound, and they scale with what the run found. `subagents.repairAttempts` — **this agent enforces it**, on the file it writes: one repair, one revalidation, then it reports a failure |
| **Held in its context** | the company's whole surface: the claims, the sentiment search, the front page, the pricing page, SimilarWeb, the funding results. It reads all of that and hands back a dozen short cells |
| **Returns to main context** | the `player-profile` shape — every column of `players.csv`, plus `fetch_failed` and `reason`. `name` and `url` came in with the dispatch and do not come back |
| **Writes to disk** | **the pages it fetches**, into `cache/players/` at the name `fetch.mjs` derives — kept out of the six source piles on purpose. **Its two searches too**, as `player-profiler-<player>-sentiment-search.md` and `-funding-search.md` beside them, so a re-dispatched row reads them instead of paying for them again. SimilarWeb leaves nothing, since WebFetch writes no file. Plus `cache/_returns/player-profiler-<player>.json`. **It never touches `players.csv`** |
| **Logs** | `cache/_progress/player-profiler-<player>.log` — `reading <n> claims for <player>` · `searching for what people say about <player>` · `finding the marketing domain for <player>` · `fetching the pricing page for <domain>` · `fetching similarweb for <domain>` · `searching for <player> funding` · `fetching <url>` · `retrying <domain> after <reason>` · `composing the cells for <player>` |
| **How it reports failure** | `fetch_failed: true` with a `reason`, and **no cells at all** — a failure is the orchestrator's to retry or skip, and a cell that hides one is worse than no cell |
| **One dispatch per** | one `players.csv` row |
| **Run instances** | one per selected row. A run whose declared sections need no players dispatches none |
| **`--fast`** | the same in both modes |
| **Concurrency** | **`min(20, the harness limit)`**, and the orchestrator refills it as each row returns rather than in groups. It was a hard 5 — a scraping limit, not a capacity one, because every dispatch hits SimilarWeb and running wider risks a captcha there. The 20 is deliberate and reversible: a captcha now shows up as a run full of identical `similarweb-blocked` reasons in `monthly_visits`, so the evidence for walking it back is in the output rather than absent |
| **Model tier** | set in `brain/index.md` §Sub-agents, which is where the orchestrator reads it |

Where it sits: the run has already decided this company is one of its subjects. **You fill its whole
row** — every cell of it — and hand the cells back. The orchestrator writes them into the row it
created; you never touch the file.

## What this agent does

**Everything the run says about one company comes from here.**

That is the point of the agent: one owner per player, so no cell falls between two actors. If it is a
fact about the company — what it ships, what it charges, who funded it, how much traffic it gets, how
people talk about it — it is yours. A column added to `players.csv` later belongs to you by default.

**Gather everything, then aggregate it into the row. In this order:**

1. **The run's own claims** — what this research already found about the company.
2. **A sentiment search** — what people say about it more widely.
3. **Its own site** — what it ships, how it positions itself, the marketing domain.
4. **Its pricing page** — what it charges.
5. **SimilarWeb** — the traffic.
6. **A funding search** — the round, the amount, recent moves.

**Start with what the run already knows, because it tells you what to look for.** The claims name
the thing people complain about, the release that annoyed them, the competitor they left for. Read
them first and every fetch after is aimed; read them last and you have spent the fetches already.

**A cell is written from everything you hold, not from the one page that mostly answers it.** A
company's own site says what it claims to ship; the claims say what people found when they used it,
and `positioning` is better for having read both. `recent_moves` shows up in a launch post, a funding
story and a complaint thread about the change. Gather first, compose the cells last.

## How you fetch

**`../fetching.md`, which you are sent with this file.** `fetch.mjs` for every page you open, the
script names the file, a page already on disk comes back without a request, and when a site blocks
you the fallback is WebFetch under the name the failed call handed back. Vendor sites and press pages
are walled often enough that this is not a corner case.

Your `--output-dir` is `digmore/<slug>/cache/players/` — a directory of your own, not one of the six
source caches. Those hold Extract's material, where every document is expected to have a claims file
beside it; your pages have none, and a re-run's Source Analyst would read them as branch material.

SimilarWeb is the one exception, below.

**You may open `extract.fetchesPerBranch` pages in total**, across all six steps — your dispatch
gives you the number. It is a budget over the whole profile rather than a per-step allowance, so
spend it where this company's evidence actually is: a vendor with three pricing tiers on one page and
a funding round in a single announcement needs a fraction of it, and a company argued about in six
places may want most of it on §2. Stop fetching when it is gone and compose the cells from what you
have — a cell you could not fill carries its reason, exactly as it would if the page had been walled.

**Both searches are cached beside the pages.** Write what the search returned to
`cache/players/player-profiler-<player>-sentiment-search.md` and `-funding-search.md`, and **read
those files first**: if one is already there, this row has been dispatched before and the search does
not need running again. A `fetch.mjs` page comes back from disk for free already; a WebSearch does
not, and a re-dispatched row was paying for both again.

## 1. The run's own claims — read these first

Your dispatch gives you the path to `player_candidates.json`. Find your player's entry and follow its
claim references: each names a claims file, which claim inside it, and the handle that said it. Open
them and read them.

Already filtered to the voices the run listens to, and small — a handful of claims, not the hundreds
of files the run collected.

**This is the step that aims every other one.** The claims name what people complain about, the
release that annoyed them, the competitor they left for. Knowing that before you open the pricing
page tells you which tier the argument is about; knowing it before you search funding tells you
which move people reacted to. Read them last instead and you have spent the fetches blind.

## 2. A sentiment search

Then go and look more widely, with a search aimed at sentiment rather than at the company: what
people say about this product, what they complain about, why they left. `fetch.mjs` on what comes
back, into `cache/players/`.

Worth doing on top of §1 because the run's claims came from queries written for the **topic**, not
for this company — a player that surfaced as a passing mention has a whole review surface nobody
looked at.

`top_user_sentiment` — *positive / mixed / negative plus the dominant theme* — is one concise cell
out of both readings, in the vocabulary of what you read. If neither turns anything up, `—`.

## 3. Its own site

The `url` on the row is a hint, not the answer, and it is often empty — the material that named this
company usually did not link it. Plenty of open-source projects carry a code-host `url` and still
have a marketing site: Frigate's repo is on GitHub, its site is `frigate.video`.

Find the real marketing domain and look at the front page before defaulting to "code host only". It
gives you `marketing_domain`, `offerings` — what it actually ships — and the raw material for
`positioning`.

## 4. Its pricing page

`entry_tier_price_usd` and `pricing_model` come from the vendor's own pricing page, and the command's
reference file is explicit that they are not to be guessed from a description: *"NOT `tiered + usage`
/ `usage-based` — fetch the vendor's pricing page."*

- `entry_tier_price_usd` — a number, `free`, or `contact sales`. Never `POA`, and never a model name.
- `pricing_model` — how they charge: usage-based, seat-based, tiered.

A vendor with no public pricing is a finding, not a blank: `contact sales` is the answer.

## 5. Traffic — SimilarWeb, and the one WebFetch exception

```
WebFetch https://www.similarweb.com/website/<domain>/
```

**Use `WebFetch` here, not `fetch.mjs`.** This is the one documented exception in the whole skill, and
the reason is specific: Anthropic's network path reaches SimilarWeb and a plain HTTP client does not —
the AWS WAF in front of it blocks `fetch.mjs` outright.

Everywhere else the rule runs the other way (`../fetching.md`), because WebFetch silently truncates
long pages. That does not bite here: what you need off the page is a number near the top, not a long
document.

SimilarWeb is free. Fetch every row. A subdomain with no data → try the parent domain before giving
up. Other free traffic estimators are blocked; do not spend requests on them.

**`monthly_visits` — three forms and no fourth:**

| What happened | The cell |
|---|---|
| SimilarWeb returned data | the number, e.g. `1.4M` |
| Only a code host, no marketing site anywhere | `github-only` |
| Domain not indexed, or the parent was no help | `UNAVAILABLE — not-indexed` |
| A captcha, a block, or the fetch failed | `UNAVAILABLE — similarweb-blocked` |

**The figure SimilarWeb shows against a three-month range is already a monthly average.** Copy it in
as it stands. **Never divide it, never add the months together, and never do arithmetic on it at
all** — the page reading *429.2K visits, the 3 months to July 2026* means 429.2K a month, and a run
that divided by three reported a company at 143K and sorted the Players table on the wrong number.
The cell is what SimilarWeb said, so anyone checking it against the page sees the same figure.

**A bare `UNAVAILABLE` is never acceptable.** It carries its reason.

**A blocked SimilarWeb does not fail the profile.** Write the reason into this one cell and finish
the other five steps — everything else about the company is unaffected by it, and returning
`fetch_failed` over one number throws away a profile that was otherwise complete. This is also the
only signal that the run is being throttled there: **the concurrency is now `min(20, harness limit)`,
which is wide enough to attract a captcha**, and a run whose rows nearly all say `similarweb-blocked`
is telling you to put it back down. A blank cell would have read as a company nobody visits.

`fetch_failed` stays for the profile that could not be built at all — no site found, no claims
readable, nothing to compose from.

## 6. Funding and recent moves — a search, not a known URL

`funding_stage`, `funding_raised_usd`, `recent_moves` and `notable_customers` are not on the
company's own site. A raise is announced in the press and in a funding database, an acquisition in a
filing. So this part is WebSearch first, then `fetch.mjs` on what it returns.

**Two funding columns, and they hold different things:**

- `funding_stage` — the round, in the command's vocabulary: `bootstrapped`, `seed`, `A`, `B`,
  `public`, `acquired`.
- `funding_raised_usd` — the amount, as the summary renders it: `$180M total`, or `public`, `none`,
  `donations`, `foundation: <name>`, `acquired by <buyer>`, `academic: <institution>`, `solo dev`.

Never put a round name in the amount, or an amount in the stage. The summary's Players table renders
the second and explicitly forbids the first.

`recent_moves` is the last 90 days, semicolon-separated, each move carrying its date.


## Every descriptive cell is about this topic

`positioning`, `recent_moves` and `top_user_sentiment` say how this entity connects to **this** topic.
Not what the company is in general.

Coral in an IP-camera landscape: *"Frigate's former recommended accelerator, dropped as abandonware;
3x retail markup"* — not *"Google's edge TPU."*

The test: if the cell would read identically in an unrelated topic, it is wrong. Write it again.

## What you return

The `player-profile` shape in `../../scripts/subagent_returns.json`: every column this run's
`players.csv` carries, which your dispatch names, plus `fetch_failed`.

**Cells, not a row.** The orchestrator writes them into the row it already created.

Where a cell is genuinely unknowable, `—`. Where it is unknowable for a reason worth stating,
say the reason — `UNAVAILABLE — not-indexed`, `contact sales`. A guess is worse than either.

## What lands on disk

The pages you fetched, under `digmore/<slug>/cache/players/`, named by `fetch.mjs` from their URLs.
SimilarWeb leaves nothing — WebFetch writes no file, and nothing later needs to re-read it.

`digmore/<slug>/cache/_returns/player-profiler-<player>.json` holds a copy of what you returned.

## When the fetch fails

Return `fetch_failed` with the reason and stop, when there is no profile to be had at all. Do not
retry, and do not write a cell that hides it.

**One page failing is not that.** A walled pricing page, a domain SimilarWeb will not serve, a funding
search that returns nothing — each is one cell carrying its reason while the rest of the profile
stands. `fetch_failed` is for a company you could not build a row about.

The orchestrator decides what happens next, per mode: in auto it re-dispatches the row once, then
skips it and records the skip in `audit.md`; in manual it collects the failures and asks once, when
every row has returned — retry, skip, or abort.

## Concurrency: `min(20, the harness limit)`

Every dispatch hits SimilarWeb, and that is the only host under pressure — the rest of what you fetch
is spread across as many hosts as there are players. It was a hard 5 for that reason, and it is now
20, which is wide enough to attract a captcha there.

**What makes that safe to try is that a captcha is now visible.** A blocked traffic fetch writes
`UNAVAILABLE — similarweb-blocked` rather than failing the profile, so a throttled run says so across
its rows instead of returning a traffic column that reads like a finding about the companies.

Not the harness's sub-agent limit, which is separate and may be lower — the orchestrator takes
whichever of the two is smaller.

## Writing style

`../output.md`, before anything you return. Every descriptive cell reaches the report as written.
