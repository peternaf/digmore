# Branch Searcher — the agent

| Field | |
|---|---|
| **Phase** | Extract `[2.1/6]`, and again in Enrichment `[4/6]` at its search sub-step — see §"Enrichment mode" |
| **Purpose** | Find what is worth reading for one branch, rank it, cut it to what the branch can afford, and leave that list on disk — the ranking is what decides which pages the run spends its budget on |
| **Input text** | **in Extract**, one angle `{label, query, rationale}`, one source name, the topic slug, and **the recency cutoff date** `preflight.mjs` printed — never worked out here, or six branches filter on six different days. **In Enrichment**, one handle, the research question to rank against, and the path to that handle's vetting cache — no angle and no query |
| **Input rule files** | `subagents/branch_searcher_agent/index.md` · that agent's `<source>.md` · `output.md` |
| **Input data files** | **none in Extract** — this agent is the one creating material. **In Enrichment**, that expert's vetting cache, which is the whole of what it picks from |
| **Runs** | `api.mjs reddit search` **twice** on Reddit — site-wide, then scoped to subs it picks itself · WebSearch with a `site:` filter on Hacker News, Twitter and forums · plain WebSearch on the web source · on local, copies the user's named files into `cache/local/`. **In Enrichment it runs nothing**: it reads the vetting cache it was handed |
| **Settings that control it** | **`extract.fetchesPerBranch` — this agent now applies it**, as the length of the list it writes; `enrich.urlsPerExpert` does the same on an expert branch. It is a count of URLs it may hand on, not a fetch budget it can spend — this agent still fetches nothing |
| **Held in its context** | the search responses themselves — Reddit's two result sets, the WebSearch result lists, and in Enrichment the expert's cached comments. Titles and snippets are read to rank and are not carried. **Nothing leaves**: the list goes to disk and the message is one word |
| **Returns to main context** | **the word `done`.** The `branch-searcher` shape goes to `cache/_returns/branch-searcher-<branch>.json`, which the orchestrator's dedupe reads |
| **Writes to disk** | **`cache/_returns/branch-searcher-<branch>.json` — the cut, ranked list, and the only place its candidates exist.** Plus search responses, never a page, a thread or a post: on Reddit two files per branch, written by the script; on Hacker News, Twitter, websearch and forums nothing, since WebSearch results live only in this agent; on local, the user's named files copied into `cache/local/`. **In Enrichment there is no search response to save**, so the `_returns/` file is the whole of it |
| **Logs** | `cache/_progress/branch-searcher-<branch>.log` — `searching <source> for <query>` (Extract) · `reading the vetting cache for <handle>` (Enrichment) · `copying <filename>` (local only, one per file) |
| **How it reports failure** | an empty `results` array plus what the source said. A source that was never queried, one that was unavailable and one that came back empty are three different sentences — see the rules below |
| **One dispatch per** | one branch. In Extract that is one angle paired with one source; in Enrichment it is one expert, whose source is implied — `u/foo` is Reddit's by construction |
| **Run instances** | angles × available sources in Extract, plus one per followed expert in Enrichment — `enrich.expertsFollowed` |
| **`--fast`** | `plan.maxAngles` × sources in Extract, plus one per `enrich.expertsFollowed`, both at their reduced values |
| **Concurrency** | all at once, capped only by the harness limit `preflight.mjs` reported |
| **Model tier** | placeholder, unused for now |

Where it sits: **Plan** produced the angle you were given, along with the vocabulary its own people
use. The list you leave on disk is what the **Page Analyst** works through, a few URLs per dispatch.

## What this agent does

Find what is worth reading for its one branch, rank it, cut it, write it.

- **Search, and stop at the results.** The URLs and titles a search returns are the whole job. The
  Page Analyst opens them, a few URLs per dispatch.
- **Rank what you found.** `relevance` is how likely each URL is to answer this angle, and the run
  reads in that order — so the ranking decides what gets read.
- **Cut to what the branch can afford.** See below.
- **Save the search response.** That one file per query is what this agent leaves on disk beside its
  list.

## Sort, cut, write, and return one word

**Sort by your own `relevance`, highest first, then keep the first `extract.fetchesPerBranch`** — or
`enrich.urlsPerExpert` on an expert branch. `preflight.mjs` prints the number this run uses; read it
there and never substitute one of your own.

**This is not a cap on your ranking, it is the branch's budget.** Everything past that line was going
to be discarded anyway: the orchestrator used to make the same cut one step later, on the same scores,
having been handed every row to do it with. You are the only actor already holding them.

Write the result to:

```
digmore/<slug>/cache/_returns/branch-searcher-<branch>.json
```

**Then return the single word `done`.** Not the list, not a summary of it, not a count.

**That file is the only place your candidates exist**, so a URL you leave out of it is a URL the run
will never read. It is also what the dedupe reads — it always did, even when the list was returned
inline as well, which is how a measured run came to spend ~60k of the orchestrator's context on 1,368
rows nobody opened.

The `branch-searcher` shape from `../../../scripts/subagent_returns.json`:

```json
{"results": [{"url": "…", "title": "…", "relevance": 0.0}],
 "droppedCount": 0, "lowestSurvivingScore": 0.0}
```

`relevance` is 0..1, your own estimate of how on-topic the URL is for its angle — or, in Enrichment,
for the research question.

**The two numbers are what the cut cost, and they are the reason it can be recorded rather than
silent.** `droppedCount` is how many candidates you discarded; `lowestSurvivingScore` is the
relevance of your weakest survivor. Together they let `audit.md` say whether the budget cost this
branch anything worth having — forty candidates dropped just below a strong line is a real finding,
forty no-hopers is not, and the survivor list alone cannot tell them apart. **Never write out the
dropped rows themselves.** Nothing backfills from them: a measured run read 400 documents for only 26
non-ok outcomes, so the machinery would idle for 94% of reads and the branch would be finished before
anyone reached for it.

## Enrichment mode — an expert is a branch

After Vet, the run follows the experts it cleared into what else they wrote. **One dispatch per vetted
expert**, and the source is implied by the handle rather than paired with it: `u/foo` is a Reddit
branch by construction.

**Nothing about the contract changes.** Find candidates, rank them, return the same shape, open
nothing. What differs is where the candidates come from.

- **There is no query.** Vetting already fetched this person's material to judge them, and your
  dispatch names the file. This is the shape `local.md` describes: the material is already in front of
  you. Read it, and return what is relevant.
- **Rank against the research question, not an angle.** An expert branch has no angle, and giving it
  one would multiply ten experts by five angles into fifty dispatches covering the same ten people.
- **You write nothing.** There is no search response to save.

What each source cached during vetting, and so what there is to pick from:

| Source | What is there |
|---|---|
| **Reddit** | up to 100 recent comments, full bodies, with subreddits and permalinks |
| **Hacker News** | recent comments in full, each carrying the story it sits under |
| **Twitter** | the sampled posts — only where `posts_sampled` is above zero, and in `--fast` that is nowhere |
| **Forums** | **nothing.** No script vets forums, so the Handle Vetter's return is the whole record |
| **Websearch, local** | no handles, so no experts |

**A forums expert returns empty, and that is the honest answer.** Its only material is what Extract
already read and already extracted, so there is nothing new to find. Say the source produced nothing
rather than handing back pages the run already has claims from.

**Blogs and anything off-platform are out of scope.** Never search the open web for an expert's other
writing. Cache only.

**`enrich.urlsPerExpert` is this branch's fetch budget**, and like every other budget it bounds the
Page Analyst downstream rather than you.

## Per-source files

Read the one for your source before issuing a query. Each is self-contained — the command, the
query rules, what comes back, where it caches.

- `reddit.md` — `api.mjs reddit search`, through digmore's API. Needs an API key.
- `hackernews.md` — WebSearch with a `site:` filter; Algolia keyword search is deliberately not a
  discovery path.
- `twitter.md` — WebSearch with a `site:` filter. Needs an API key for anything past the title.
- `websearch.md` — the open web. Free, no key, the backbone of a keyless run.
- `forums.md` — WebSearch to find the forums, then to search inside them.
- `local.md` — no query at all: the user's own files, read through this angle.

## Rules that apply on every source

- **Never substitute a `site:` WebSearch for a source's own script.** Reddit blocks the harness's
  WebSearch UA at robots.txt, so `site:reddit.com` returns near-zero regardless of content, and the
  emptiness looks like a finding. Full rule in `../../phases/extract_phase_b.md` §"Source-tool
  discipline".
- **Three states, three different sentences.** A source that was never queried, a source that was
  unavailable, and a source that came back empty are not the same thing, and the run says which.
- **Recency belongs to the scripts, not to the query.** The two-year window is applied by the
  sources that can apply it properly — Reddit through `--after-date`, Hacker News through Algolia's
  `numericFilters`, Twitter by reading `created_at` off each tweet after the fetch. WebSearch's
  `after:` operator is not used: it is approximate on the open web, and on x.com it actively
  suppresses organic results in favour of indexed marketing accounts. So a plain web search runs
  unfiltered and the date is judged when the page is read. See `../../recency.md`.
- **Writing style** — `../../output.md`, before anything you return.
