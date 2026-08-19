# Extract

Where the run does its bulk work: search every branch, read what it finds, then write per-source notes. Three sub-steps, each with its own progress marker — `[2.1/5] Extract · Search`, `[2.2/5] Extract · Read`, `[2.3/5] Extract · Source notes` (`../reporting.md`). All write incrementally to `digmore/<topic-slug>/cache/<source>/` and `digmore/<topic-slug>/source_notes/`.

The branches come from `research_plan.json`, written by the phase before this one (`plan_phase_a.md`). Read it rather than re-deriving the plan — on a resumed run, re-deriving produces different angles from the ones the existing cache was built against.

Read `../output.md` before any sub-agent dispatch. Read the relevant `../sources/<source>.md` before issuing requests through that source.

## Search

A **branch** is one angle paired with one source: `pricing × websearch` is a branch, and so is `pricing × reddit`. Fan-out is one searcher sub-agent per branch. With 5 sources and 5 angles that is 25 branches, dispatched at once — do NOT introduce a cap of your own on how many branches run.

**The harness does not queue past its concurrent-subagent limit, it errors** — the one past the limit comes back `Concurrent subagent limit reached ... Do not retry`. **The limit is whatever preflight reported**, which is the user's setting, not a default; batching at 20 on a machine configured for 100 throttles the run for no reason. Do not retry the failures, and do not silently drop them — a branch that never ran is not a source that came back empty, and Extract would end with a gap nothing records.

When it happens:

1. Dispatch the branches that did not run in batches inside the limit, so the fan-out still completes.
2. Tell the user once, in the run's closing message, that the run was throttled and how to lift it — the ceiling is theirs to raise and the plugin never edits their settings:

   > This run hit Claude Code's concurrent-subagent limit (<the number preflight reported>) and fanned out in batches instead. To let it run wider, raise `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` in `~/.claude/settings.json` and start a new session.

3. Record it in `audit.md` alongside the other caps, so the summary's Run footer can name it.

Which sources are in play was settled in Plan and is listed in `research_plan.json`. The `local` source issues no query — its searchers read the handed-over material through each angle instead (`../sources/local.md`).

**A source missing from the plan was unavailable, not empty.** Plan already left it out — with no API key there are no Reddit or Twitter branches. Carry `sources_unavailable` from `research_plan.json` through to the summary and the terminal output; a source nobody queried must never read as a source that came back with nothing.

Each searcher:
1. Reads the relevant `../sources/<source>.md` before issuing requests.
2. Uses that source's own tool — its script where it has one, `WebSearch` for the web source.
3. **Must pass `--topic <slug>` on every source-script call.** The scripts refuse to run without it, because without a topic there is nowhere to cache and the run would look complete having saved nothing. Same rule for `fetch.mjs`: the `--output` path must resolve under `digmore/<slug>/cache/<source>/<safe-name>`, and the script enforces it.
4. Returns the Branch searcher schema (see `../../scripts/subagent_returns.json`), dispatched per `../dispatch_structured_subagent.md`: `{results[{url, title, relevance}]}`.

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

## Read — one sub-agent per URL

Print `[2.2/5] Extract · Read`. For each URL a branch kept, dispatch a Source extractor sub-agent, per `../dispatch_structured_subagent.md`, that reads the cached content and returns structured claims (Source extractor schema in `../../scripts/subagent_returns.json`).

**One sub-agent per URL. Never a batch of URLs to one sub-agent.** Twelve URLs handed to one agent is a compound job over independent items, which reads as an invitation to parallelise — and a sub-agent that dispatches work cannot await it, so it hangs. One verb, one item: fan-out is yours, not theirs. See `../dispatch_structured_subagent.md` for the prompt.

## Incremental persistence

Raw data writes to `digmore/<topic-slug>/cache/<source>/` incrementally — one file per response, written before the next request returns. If a script crashes, whatever was already fetched stays on disk.

## Per-branch fetch cap

**20 URLs per branch** — per angle-source pair, so `pricing × reddit` and `complaints × reddit` get 20 each. The number belongs to the user: `fetchesPerBranch` in `~/.digmore/settings.json`, 20 by default. Read it at the start of the run rather than assuming, and never substitute a number of your own.

**It counts every URL the branch fetches, whatever fetched it** — `fetch.mjs`, `api.mjs reddit thread`, `hackernews.mjs story`, `api.mjs twitter tweet` or `WebFetch`. Counting one tool's fetches would miss most of them.

When a branch has more candidates than its cap:

- Keep the highest-relevance ones and drop the rest.
- Record what was dropped in `audit.md` under "dropped-for-budget", naming the branch.

A hard cap, not advisory. Re-runs must not loosen it implicitly.

**Pages are fetches.** A paginated thread followed to page 5 has spent five of the branch's budget — see `../page_analyst_agent/index.md` §"Follow the document to its end". A branch that spends all 20 on one long thread has read one document, and the run says so rather than reporting a source that looks fully searched. When the budget cuts a document short, record it beside "dropped-for-budget": the URL, the pages read, and that more existed.

Vetting fetches are **not** in this cap — they are bounded separately in `vet_phase_c.md`. They are roughly half of a run's network traffic, so a cap that ignored them would be bounding the smaller half.

## Source notes

For each source that pulled data, dispatch ONE sub-agent that reads the source's cached raw content with no schema. The sub-agent writes unstructured observations to `digmore/<topic-slug>/source_notes/<source>.md`.

What goes in there:
- Patterns that aren't claims (recurring tone, vibe shifts, "everyone is suddenly talking about X").
- Throwaway lines a claim-extractor would skip.
- Cross-thread connections (the same author contradicting themselves elsewhere).
- Oddities.

Constraints:
- No JSON schema, but writing-style rules in `../output.md` still apply. Concrete. Cite URLs. No fluff.
- These notes are an LLM-only artifact — Synthesize reads them alongside structured claims. They do NOT appear in the summary directly. Surprises mined from them feed into "Non-trivial insights" via Synthesize's synthesizer.

## End of Extract

Extract is complete when every branch's searcher has returned and every source with data has its `source_notes/<source>.md`. No marker file is written — resume infers completion from the presence of these artifacts.
