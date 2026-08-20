# Extract

Where the run does its bulk work: search every branch, read what it finds, then write per-source notes. Three sub-steps, each with its own progress marker — `[2.1/5] Extract · Search`, `[2.2/5] Extract · Read`, `[2.3/5] Extract · Source notes` (`../reporting.md`). All write incrementally to `digmore/<topic-slug>/cache/<source>/` and `digmore/<topic-slug>/full_source_analysis/`.

The branches come from `research_plan.json`, written by the phase before this one (`plan_phase_a.md`). Read it rather than re-deriving the plan — on a resumed run, re-deriving produces different angles from the ones the existing cache was built against.

Read `../output.md` before any sub-agent dispatch. Each agent has its own directory holding its instructions and a file per source it works with — `../subagents/branch_searcher_agent/`, `../subagents/page_analyst_agent/`, `../subagents/source_analyst_agent/`. Send the agent its `index.md` and the source file it needs.

## Search

A **branch** is one angle paired with one source: `pricing × websearch` is a branch, and so is `pricing × reddit`. Fan-out is one searcher sub-agent per branch. With 5 sources and 5 angles that is 25 branches, dispatched at once — do NOT introduce a cap of your own on how many branches run.

**The harness does not queue past its concurrent-subagent limit, it errors** — the one past the limit comes back `Concurrent subagent limit reached ... Do not retry`. **The limit is whatever preflight reported**, which is the user's setting, not a default; batching at 20 on a machine configured for 100 throttles the run for no reason. Do not retry the failures, and do not silently drop them — a branch that never ran is not a source that came back empty, and Extract would end with a gap nothing records.

When it happens:

1. Dispatch the branches that did not run in batches inside the limit, so the fan-out still completes.
2. Tell the user once, in the run's closing message, that the run was throttled and how to lift it — the ceiling is theirs to raise and the plugin never edits their settings:

   > This run hit Claude Code's concurrent-subagent limit (<the number preflight reported>) and fanned out in batches instead. To let it run wider, raise `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` in `~/.claude/settings.json` and start a new session.

3. Record it in `audit.md` alongside the other caps, so the summary's Run footer can name it.

Which sources are in play was settled in Plan and is listed in `research_plan.json`. The `local` source issues no query — its searchers read the handed-over material through each angle instead (`../subagents/branch_searcher_agent/local.md`).

**A source missing from the plan was unavailable, not empty.** Plan already left it out — with no API key there are no Reddit or Twitter branches. Carry `sources_unavailable` from `research_plan.json` through to the summary and the terminal output; a source nobody queried must never read as a source that came back with nothing.

Each searcher:
1. Reads `../subagents/branch_searcher_agent/index.md` and its own `../subagents/branch_searcher_agent/<source>.md` before issuing requests.
2. Uses that source's own tool — its script where it has one, `WebSearch` for the web source.
3. **Must pass `--topic <slug>` on every source-script call.** The scripts refuse to run without it, because without a topic there is nowhere to cache and the run would look complete having saved nothing. Same rule for `fetch.mjs`: the `--output` path must resolve under `digmore/<slug>/cache/<source>/<safe-name>`, and the script enforces it.
4. Returns the Branch searcher schema (see `../../scripts/subagent_returns.json`), dispatched per `../subagents/dispatch_structured_subagent.md`: `{results[{url, title, relevance}]}`.

### Source-tool discipline — no WebSearch substitutes

A `WebSearch` query with a `site:<source-host>` filter is NOT a substitute for the dedicated source tool. Each source has its own script for documented reasons (auth, rate limits, robots.txt blocks against the harness's WebSearch UA, client-side-rendered content). The substitution looks like it works (no error) and silently returns empty or garbage results, which then get logged as "the source is empty on this topic" when the truth is "we never queried the source."

Hard rule for the Reddit/HN/Twitter sources:

| Tempted to run | Run this instead |
| --- | --- |
| `WebSearch site:reddit.com ...` | `api.mjs reddit search ...` (reddit.com blocks the harness's WebSearch UA at robots.txt; site-filtered WebSearch returns 0 or near-0 regardless of content) |
| `WebSearch site:news.ycombinator.com ...` | `WebSearch` **is** how HN stories are discovered — harvest `item?id=<N>` URLs from the results, then call `hackernews.mjs story <N>` on each. Algolia's keyword search is deliberately not a discovery path. What you must not do is treat the search snippet as the thread: the comments are the content, and only `story` returns them |
| `WebSearch site:x.com ...` / `site:twitter.com ...` | `api.mjs twitter ...` for anything past the title — x.com renders client-side, so a crawler sees only the first few words of a tweet |

WebSearch IS the right tool for generic web discovery, `site:` filters on outlets without a dedicated source tool, one-off Audit fact-checks, and SimilarWeb / external metric pages. The rule above is specifically about the three sources that have native scripts.

**Three states, three different sentences.** A scripted source that returns nothing is not one condition, and reporting them as one is how a thin answer becomes a false one:

| What happened | How you know | What the run says |
| --- | --- | --- |
| The source was never queried | You ran a `site:` WebSearch instead | Nothing — go and query it. This is the rule above |
| The source was unavailable | Exit 3 (source walled or down) or exit 4 (no API key) | Name the source as unavailable, in the summary and the terminal output |
| The source is genuinely empty | Exit 0 with `{"results": []}` | Report the topic as thin on that source |

On Reddit the API separates the last two for you: it detects a wall, retries on a fresh connection, and reports exit 3 only once every attempt is walled. So exit 0 with no results is an empty topic and can be stated as one.

## Dedupe the URLs before dispatching a single reader

Every branch's results are in your context and nowhere else, so this is the one moment the whole
candidate set exists in one place. Cut the duplicates here.

A page that five branches found is one page. Read it five times and you have spent five fetches to
get one document, extracted the same claims five times into five files, and given the Source Analyst
five copies of one thread to weigh as five.

1. **Collect every branch's `results` and match on the URL.** Normalise before comparing — trailing
   slash, `http` vs `https`, a `?utm_*` query, a `#fragment`, and on Reddit the same thread reached
   through `old.reddit.com` and `www.reddit.com`. Those are one URL.
2. **Keep the highest `relevance` of the copies**, and remember every branch that found it. One
   Page Analyst is dispatched, and its fetch counts against the branch whose copy ranked highest.
3. **Record the duplicates in `audit.md` under "URL duplicates"**, with the branches that shared
   each one. A page several branches independently surfaced is a signal about the topic, and it is
   lost the moment the copies are dropped silently.

Only what survives this step is dispatched.

## Read — one sub-agent per URL

Print `[2.2/5] Extract · Read`. For each URL that survived the dedupe, dispatch a Page Analyst sub-agent, per `../subagents/dispatch_structured_subagent.md`. It writes the claims it pulls to `<name>-claims.json` beside the stripped page and returns a **receipt** — the `page-analyst` shape in `../../scripts/subagent_returns.json`, which says what became of the page rather than what was in it.

**Dispatch them all at once, up to the harness limit `preflight.mjs` reported** — the same rule as the searchers above, and for the same reason: nothing here shares a rate limit, so the only bound is how many sub-agents Claude Code will run. Batch only when the limit errors, exactly as in §Search. Do not invent a smaller batch size of your own.

**The claims do not come back into your context, and you do not read the files.** Several hundred of these run in one job; a run that holds every claim runs out of room before it reaches the report. What needs them reads them: the Source Analyst for its roster, the Report Writer for the summary, the fact checker for verification. What you keep is the receipts — enough to total the branch's fetches, and to write `audit.md`'s two page-level records: the URLs that came back `blocked`, and the ones WebFetch had to take. Both vanish otherwise, a blocked page because it leaves no file and a shortened one because nothing about it looks short.

**One sub-agent per URL. Never a batch of URLs to one sub-agent.** Twelve URLs handed to one agent is a compound job over independent items, which reads as an invitation to parallelise — and a sub-agent that dispatches work cannot await it, so it hangs. One verb, one item: fan-out is yours, not theirs. See `../subagents/dispatch_structured_subagent.md` for the prompt.

## Incremental persistence

Raw data writes to `digmore/<topic-slug>/cache/<source>/` incrementally — one file per response, written before the next request returns. If a script crashes, whatever was already fetched stays on disk.

## Per-branch fetch cap

**Per angle-source pair**, so `pricing × reddit` and `complaints × reddit` each get their own budget. The number is `extract.fetchesPerBranch`, and it belongs to the user: `preflight.mjs` prints the value that applies to this run. Read it there rather than assuming, and never substitute a number of your own.

**It counts every URL the branch fetches, whatever fetched it** — `fetch.mjs`, `api.mjs reddit thread`, `hackernews.mjs story`, `api.mjs twitter tweet` or `WebFetch`. Counting one tool's fetches would miss most of them.

When a branch has more candidates than its cap:

- Keep the highest-relevance ones and drop the rest.
- Record what was dropped in `audit.md` under "dropped-for-budget", naming the branch.

A hard cap, not advisory. Re-runs must not loosen it implicitly.

**Pages are fetches.** A paginated thread followed to page 5 has spent five of the branch's budget — see `../subagents/page_analyst_agent/index.md` §"Follow the document to its end". A branch that spends all 20 on one long thread has read one document, and the run says so rather than reporting a source that looks fully searched. When the budget cuts a document short, record it beside "dropped-for-budget": the URL, the pages read, and that more existed.

Vetting fetches are **not** in this cap — they are bounded separately in `vet_phase_c.md`. They are roughly half of a run's network traffic, so a cap that ignored them would be bounding the smaller half.

## Source notes

For each source that pulled data, dispatch ONE Source Analyst that reads everything that source produced — the stripped pages and the claims files together. It writes two files, both to `digmore/<topic-slug>/full_source_analysis/`. See `../subagents/source_analyst_agent/index.md`.

**`<source>.md` — the notes.** Unstructured observations, no schema:
- Patterns that aren't claims (recurring tone, vibe shifts, "everyone is suddenly talking about X").
- Throwaway lines a claim-extractor would skip.
- Cross-thread connections (the same author contradicting themselves elsewhere).
- Oddities.

These are an LLM-only artifact — Synthesize reads them alongside the claims. They do NOT appear in the summary directly. Surprises mined from them feed into "Non-trivial insights" via the Report Writer. Writing-style rules in `../output.md` still apply: concrete, cite URLs, no fluff.

**`<source>-handles.json` — the roster.** Only on Reddit, Hacker News, Twitter and forums; the open web and the user's own documents have no accounts to vet. Every handle the source produced, ranked by the highest importance of the claims attributed to them and then by how many documents they appear in, with whatever the pages already showed about them. The `handle-roster` shape in `../../scripts/subagent_returns.json`.

**Vet depends on this file and cannot rank for itself** — the ranking needs every document a source produced, and this is the only agent that reads them all. A source whose roster is missing is a source that cannot be vetted (`vet_phase_c.md`), so a Source Analyst that fails is worth noticing here rather than in the next phase.

### Tell it to write a heartbeat

This agent returns no schema, so it never receives the dispatch template and nothing gives it the
heartbeat instruction automatically. Write it into the dispatch yourself, in these words:

> Before each step you take, append one line to
> `digmore/<slug>/cache/_progress/source-analyst-<source>.log`: the time, and what you are about to do.

It reads every page and every claims file a source produced, so it is one of the longest silences in
the run and the only one with no script behind it to explain the wait. Without the line there is
nothing to read when it goes quiet (`index.md` §"When a sub-agent goes quiet").

### Check the roster

The notes are prose and there is nothing to check. **The roster is JSON with a shape**, and Vet
cannot run without it, so check it the way every other payload is checked — the call is yours,
because this agent gets no dispatch template to carry it:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/validate.mjs" handle-roster \
  digmore/<slug>/full_source_analysis/<source>-handles.json
```

One repair attempt on exit 1, then a recorded drop, per `../subagents/dispatch_structured_subagent.md`
§"The repair pass". A roster that still fails is a source that cannot be vetted — treat it as a
missing one below.

### When a Source Analyst fails

A source with no handles correctly writes no roster, and that is not this case. This is the agent
**dying** on a source that did produce documents: the material is on disk, the roster is not, and on
disk that looks identical to a source with nobody in it.

1. **Re-dispatch it once.**
2. If the second attempt also ends with `<source>.md` written and `<source>-handles.json` missing or
   still failing its check, **that source is not vetted.** Record it in `audit.md` and name it in the
   run's Issues.
3. **Do not rank the handles by hand instead.** You no longer hold the claims — any ranking you built
   would be by frequency alone, which is the thing the roster exists to replace.

The claims from that source still reach the report. What is lost is the verdict on the people behind
them, and the run says so rather than quietly quoting unvetted voices.

## End of Extract

Extract is complete when every branch's searcher has returned, and every source with data has its `full_source_analysis/<source>.md` — plus its `<source>-handles.json`, checked, on the sources that carry handles. A source whose roster is missing after one re-dispatch is complete too, and recorded as unvetted. No marker file is written — resume infers completion from the presence of these artifacts.
