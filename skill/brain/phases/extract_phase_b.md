# Extract

Where the run does its bulk work: search every branch, read what it finds, then write one report per source. Three sub-steps, each with its own progress marker — `[2.1/6] Extract · Search`, `[2.2/6] Extract · Read`, `[2.3/6] Extract · Source reports` (`../reporting.md`). All write incrementally to `digmore/<topic-slug>/cache/<source>/` and `digmore/<topic-slug>/full_source_analysis/`.

The branches come from `research_plan.json`, written by the phase before this one (`plan_phase_a.md`). Read it rather than re-deriving the plan — on a resumed run, re-deriving produces different angles from the ones the existing cache was built against.

Read `../output.md` before any sub-agent dispatch. Three agents work here, each with its own directory holding its instructions and a file per source — `../subagents/branch_searcher_agent/`, `../subagents/page_analyst_agent/`, `../subagents/source_analyst_agent/`. Every dispatch names the paths to the agent's `index.md` and the `<source>.md` it needs, per `../subagents/dispatch_structured_subagent.md` §"Send the agent its own files".

## Search

A **branch** is one angle paired with one source: `pricing × websearch` is a branch, and so is `pricing × reddit`. Fan-out is one searcher sub-agent per branch. With 5 sources and 5 angles that is 25 branches, dispatched at once — do NOT introduce a cap of your own on how many branches run.

**The harness does not queue past its concurrent-subagent limit, it errors** — the one past the limit comes back `Concurrent subagent limit reached ... Do not retry`. **The limit is whatever preflight reported**, which is the user's setting, not a default; batching at 20 on a machine configured for 100 throttles the run for no reason. Do not retry the failures, and do not silently drop them — a branch that never ran is not a source that came back empty, and Extract would end with a gap nothing records.

When it happens:

1. Dispatch the branches that did not run in batches inside the limit, so the fan-out still completes.
2. Tell the user once, in the run's closing message, that the run was throttled and how to lift it — the ceiling is theirs to raise and the plugin never edits their settings:

   > This run hit Claude Code's concurrent-subagent limit (<the number preflight reported>) and fanned out in batches instead. To let it run wider, raise `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` in `~/.claude/settings.json` and start a new session.

3. Record it — `runlog.mjs finding budget-overrun` — alongside the other caps, so the summary's Run footer can name it.

Which sources are in play was settled in Plan and is listed in `research_plan.json`. The `local` source issues no query — its searchers read the handed-over material through each angle instead (`../subagents/branch_searcher_agent/local.md`).

**A source missing from the plan was unavailable, not empty.** Plan already left it out — with no API key there are no Reddit or Twitter branches. Carry `sources_unavailable` from `research_plan.json` through to the summary and the terminal output; a source nobody queried must never read as a source that came back with nothing.

Each searcher:
1. Reads `../subagents/branch_searcher_agent/index.md` and its own `../subagents/branch_searcher_agent/<source>.md` before issuing requests.
2. Uses that source's own tool — its script where it has one, `WebSearch` for the web source.
3. **Must pass `--topic <slug>` on every source-script call.** The scripts refuse to run without it, because without a topic there is nowhere to cache and the run would look complete having saved nothing. Same rule for `fetch.mjs`: the `--output` path must resolve under `digmore/<slug>/cache/<source>/<safe-name>`, and the script enforces it.
4. **Sorts its results by relevance, cuts to `extract.fetchesPerBranch`, writes the survivors to `cache/_returns/branch-searcher-<branch>.json`, and returns the word `done`.** The `branch-searcher` shape (see `../../scripts/subagent_returns.json`), dispatched per `../subagents/dispatch_structured_subagent.md`. The file also carries `droppedCount` and `lowestSurvivingScore` — the two numbers `audit.md` needs about what the cut cost, in place of the rows it discarded.

**Nothing about the search comes back in a message.** You do not read the lists as they arrive; the dedupe below opens the files. A searcher that returns anything other than `done` is a dispatch prompt to fix, not a return to parse.

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

**Read each branch's list from `cache/_returns/branch-searcher-<branch>.json`.** The searchers return
the word `done`; the list is on disk, already sorted by relevance and already cut to
`extract.fetchesPerBranch` by the agent that scored it. The filename carries the branch, which is how
each URL keeps its owning branch through the dedupe.

This is the one moment the whole candidate set is in one place. Cut the duplicates here.

**The lists arrive as files rather than as messages, and that is the only thing that changed.** What
this step does is unchanged. A measured run had the searchers return 1,368 rows of
`{url, title, relevance}` inline against a ceiling of 540 — ~60k of orchestrator context for a copy
nobody opened, because the dedupe was reading the files even then.

A page that five branches found is one page. Read it five times and you have spent five fetches to
get one document, extracted the same claims five times into five files, and given the Source Analyst
five copies of one thread to weigh as five.

1. **Read every branch's `results` from its `_returns/` file and match on the URL.** Normalise before comparing — trailing
   slash, `http` vs `https`, a `?utm_*` query, a `#fragment`, and on Reddit the same thread reached
   through `old.reddit.com` and `www.reddit.com`. Those are one URL.
2. **Keep the highest `relevance` of the copies**, and remember every branch that found it. One
   Page Analyst is dispatched, and its fetch counts against the branch whose copy ranked highest.
3. **Record the duplicates — `runlog.mjs finding url-duplicate`**, all of them in one call, each argument naming a URL and the branches that shared
   it. A page several branches independently surfaced is a signal about the topic, and it is
   lost the moment the copies are dropped silently.

Only what survives this step is dispatched.

## Read — one sub-agent per batch of URLs

Print `[2.2/6] Extract · Read`. Group the URLs that survived the dedupe into batches and dispatch one Page Analyst per batch, per `../subagents/dispatch_structured_subagent.md`. It works through them one at a time, writing each document's claims to `<name>-claims.json` beside its stripped page, and **returns the word `done`** — its receipts, one per URL, go to `cache/_returns/page-analyst-<label>.json` in the `page-analyst` shape (`../../scripts/subagent_returns.json`), which says what became of each page rather than what was in it.

### How a batch is formed

**Up to `extract.urlsPerDispatch` URLs, all from one branch.** `preflight.mjs` prints the number this run uses; read it there rather than assuming.

**One branch, never a mix, and the reason is the fetch cap below.** Each URL has exactly one owning branch by this point — the dedupe charged it to the branch whose copy ranked highest — and you total `pagesRead` per branch to enforce `extract.fetchesPerBranch`. A batch spanning two branches comes back as one array with the fetches of both in it, and the tally becomes a guess.

**One branch also means one source**, a branch being one angle paired with one source, and that is the harder half of the rule: the agent is sent one `<source>.md` and reaches for one source's tool, so a batch holding a Reddit thread and a forum page leaves it with instructions for one of them and guessing at the other. The source goes into the dispatch once, for the whole batch.

**Nothing re-orders them.** Send them as the dedupe left them. `relevance` is one searcher's judgement off a search snippet rather than a measurement, and sorting batches by it would spend real complexity on a number the run does not trust. What it costs is that a branch filling its budget early read whichever URLs came first — recorded in `audit.md` with the rest of "dropped-for-budget".

### One batch per branch at a time, every branch at once

**Dispatch every branch's first batch together, then send a branch its next batch when that branch's receipts come back.** Branches never wait on each other: one that fills its budget in its first batch stops there while the others carry on, and a slow branch on the open web holds up nothing.

**This is what makes the fetch cap below a cap.** A wave is a decision point between dispatches, and the tally is only actionable at one.

**Batch only when the harness limit errors, exactly as in §Search.** At one agent per branch that is far less likely than it was at one agent per URL, but the procedure is unchanged when it happens. Do not invent a lower concurrency of your own.

Three numbers, and none substitutes for another: `extract.urlsPerDispatch` is how many URLs one agent works through in sequence, the wave is how many of a branch's batches are in flight — one — and the harness limit is how many agents run at once.

### The batch is sequential, and the prompt has to say so

**A batch would otherwise invite exactly the fan-out that `index.md` §"What a sub-agent is" forbids** — "fetch these 12 URLs and extract from all 12" is a compound job over independent items, and a sub-agent that dispatches work cannot await it, so it hangs. That reason applies here in full; what changes is that the prohibition is carried in words rather than in the shape of the job. Put this in every dispatch, verbatim:

```
Fetch these one at a time, in the order given. Finish each URL completely — fetch it,
paginate it, strip it, write its page and its claims — before you start the next one.
Do not dispatch sub-agents. Do not parallelise. You receive no completion notification
for anything you start, so whatever you start you wait on forever.
```

Sequential is not a performance preference: an agent that fans out here hangs, and its batch is lost rather than slow.

### What comes back

**Read the receipts from `cache/_returns/`, not from the message.** A dispatch that finished says `done`; its file is the record. Read each batch's file as its dispatch returns — that is where the branch's `pagesRead` total comes from, and it is what gates the next wave.

**Why the receipts moved out of the message too.** A sampled return ran 1,255 tokens where the schema needed 150, and all 85 sampled returns carried prose outside the JSON. The receipts were never large; the message around them was.

**What you take from each file:** the `pagesRead` totals for the branch, and the page-level records — one `runlog.mjs finding blocked-page` call naming every URL that came back `blocked`, one `runlog.mjs finding webfetch-page` naming every URL WebFetch had to take, and anything in `notes`. All of them vanish otherwise, a blocked page because it leaves no file and a shortened one because nothing about it looks short.

**The claims do not come back into your context, and you do not read the claims files.** Several hundred documents are read in one job; a run that holds every claim runs out of room before it reaches the report. Two things read them and both are given the paths: the Source Analyst, which reads every one its source produced, and the Player Profiler, which follows the references `player_candidates.json` gives it. Nothing after Extract opens the directory at all — Synthesize works from the six per-source reports instead.

**A page's own standing is not on its receipt.** Undated, second-hand, sold by the party describing the problem, partial coverage — that is `pageNote` on the claims file, read by the Source Analyst and the Raw report writer. You never weigh a citation, so it would arrive here with nobody to act on it.

**Match each file's array against the URLs you sent**, keyed on `url`, one receipt each. A short array is a batch that did not finish: name the missing URLs — `runlog.mjs finding dropped-receipt`, all of them in one call — rather than reading their absence as a reason to skip them. A missing file is the same finding.

**One `blocked` URL does not fail a batch.** `outcome` is per URL, so four good reads never arrive behind one wall, and a batch that comes back all-`blocked` is four receipts saying so rather than a dispatch that failed.

**A receipt that fails its check is dropped on its own, never the batch.** The agent wrote each page and its claims to disk before returning, so a dropped receipt costs that branch's fetch tally and that URL's `audit.md` line — not the evidence, which the Source Analyst still reads. Record it — `runlog.mjs finding dropped-receipt` — naming the URL: an under-counted branch otherwise reads as a branch with budget left. The one-repair-then-drop rule in `../subagents/dispatch_structured_subagent.md` is otherwise unchanged.

## Incremental persistence

Raw data writes to `digmore/<topic-slug>/cache/<source>/` incrementally — one file per response, written before the next request returns. If a script crashes, whatever was already fetched stays on disk.

## Per-branch fetch cap

**Per angle-source pair**, so `pricing × reddit` and `complaints × reddit` each get their own budget. The number is `extract.fetchesPerBranch`, and it belongs to the user: `preflight.mjs` prints the value that applies to this run. Read it there rather than assuming, and never substitute a number of your own.

**It counts every URL the branch fetches, whatever fetched it** — `fetch.mjs`, `api.mjs reddit thread`, `hackernews.mjs story`, `api.mjs twitter tweet` or `WebFetch`. Counting one tool's fetches would miss most of them.

**You enforce it between waves, which is the only moment you can.** Add each batch's `pagesRead` to its branch's total as the receipts arrive, and send that branch another batch only while its total is under the cap. **Pages are fetches**, so the spending is not knowable in advance — a branch's URLs each paginate as far as their documents go — and a wave is the point where what was actually spent becomes visible. Dispatching a branch's URLs all at once, as this step used to, meant the receipts that would have stopped it arrived after the spending: the cap could be overrun several times over and nothing would notice.

**The overshoot that remains is one batch.** The last wave commits `extract.urlsPerDispatch` URLs before you see any of them, so a branch can end up to `extract.urlsPerDispatch × extract.maxPagesPerDocument` over in the worst case, where every document in that batch paginates to its limit. Record the overrun — `runlog.mjs finding budget-overrun` — and do not try to trim it by sending part of a batch.

**The candidate cut is the searcher's, and it has already happened.** Each branch's list arrives at
most `extract.fetchesPerBranch` long, sorted, because the agent holding the scores made the cut before
writing. Do not re-cut it. Its file carries `droppedCount` and `lowestSurvivingScore`, and those two
go in as one `runlog.mjs finding dropped-for-budget` per branch, naming it — a branch that dropped forty
candidates whose best scored just under the line is a different finding from one that dropped forty
no-hopers, and the survivors cannot tell you which.

**What still cuts here is pagination, not candidates.** A hard cap, not advisory, and re-runs must not
loosen it implicitly.

**Pages are fetches.** A paginated thread followed to page 5 has spent five of the branch's budget — see `../subagents/page_analyst_agent/index.md` §"Follow the document to its end". A branch that spends all 20 on one long thread has read one document, and the run says so rather than reporting a source that looks fully searched. When the budget cuts a document short, record it beside "dropped-for-budget": the URL, the pages read, and that more existed.

Vetting fetches are **not** in this cap — they are bounded separately in `vet_phase_c.md`. They are roughly half of a run's network traffic, so a cap that ignored them would be bounding the smaller half.

## Source reports

For each source that pulled data, dispatch ONE Source Analyst that reads everything that source produced — the stripped pages and the claims files together. It writes three files, all to `digmore/<topic-slug>/full_source_analysis/`. See `../subagents/source_analyst_agent/index.md`.

**`<source>-raw-report.json` — that source's whole record.** The `source-raw-report` shape in `../../scripts/subagent_returns.json`. Two halves:

- **`claims`** — every claim this source produced, deduplicated within this source only, each carrying its citations, and each citation carrying the handle that said it, the URL it can be read at, and the cached page it was read from.
- **`observations`** — markdown prose: what no single-document reader could have seen. Recurring tone, a mood that shifts over time, the same argument arriving in three threads a month apart, one person contradicting themselves, a question everyone asks and nobody answers.

**This is the last read of the claims files.** It is bounded because it is one source, and writing that source's claims out is a third view over material already in front of the agent — which is what lets everything after Extract work from six compact reports instead of several hundred files. `observations` never appears in the summary directly; the surprises mined from it reach "Non-trivial insights" through the raw report. Writing-style rules in `../output.md` still apply: concrete, cite URLs, no fluff.

**`<source>-handles.json` — the handles.** Only on Reddit, Hacker News, Twitter and forums; the open web and the user's own documents have no accounts to vet. Every handle the source produced, ranked by the highest importance of the claims attributed to them and then by how many documents they appear in, with whatever the pages already showed about them. The `source-handles` shape in `../../scripts/subagent_returns.json`.

**Vet depends on this file and cannot rank for itself** — the ranking needs every document a source produced, and this is the only agent that reads them all. A source missing this file is a source that cannot be vetted (`vet_phase_c.md`), so a Source Analyst that fails is worth noticing here rather than in the next phase.

**`<source>-players.json` — every entity this source named.** All six sources: unlike handles, there is no source without players. One entry per company, project or product the material named, with how many of this source's documents named it, one line on how it showed up in that source's conversation, and one entry per claim about it carrying the handle that said it. The `source-players` shape in `../../scripts/subagent_returns.json`.

**Nobody reads the players files here.** Enrichment's script merges the six, joins each claim's handle to its verdict, and hands the orchestrator the candidates (`enrich_phase_d.md`). Recording the handle beside the claim is what makes that possible: this agent runs before Vet and cannot know whose word counts, so it records who said what and lets the next phase decide. The raw reports wait the same way, for `synthesis.mjs join` at the start of Synthesize.

It reads every page and every claims file a source produced, so it is one of the longest silences in
the run and the only one with no script behind it to explain the wait. Its heartbeat is not optional
— but it is not written here either: the instruction is in every dispatch now, whatever comes back
(`../subagents/dispatch_structured_subagent.md`). This file used to carry its own copy, because an
agent returning no schema received no template, and the two copies drifted the first time one was
edited.

### What it reports about the files it wrote

**The agent checks all three itself** — `../subagents/source_analyst_agent/index.md` §"Check what you
wrote" carries the calls, the one repair and the record. It returns no shape and so receives no
dispatch template, which is why the instruction is written into its own file rather than inherited.
**You run no `validate.mjs` here**, as nowhere else (`../subagents/dispatch_structured_subagent.md`
§"Whoever writes a JSON validates it").

What reaches you is a file it could not make valid, named. What each failure costs is different, and
the run says which:

- **A raw report that still fails** is a source whose evidence never reaches the summary at all —
  the largest loss of the three, because it is every claim that source produced.
- **A handles file that still fails** is a source that cannot be vetted — treat it as a missing one
  below.
- **A players file that still fails** is a source whose entities never reach Enrichment: the run's
  subject list will be short by whatever that source alone would have contributed.

Record any of them — `runlog.mjs finding known-gap` — and name it in the run's Issues.

### When a Source Analyst fails

A source with no handles correctly writes no handles file, and a source that named no companies
correctly writes an empty players file. Neither is this case. This is the agent **dying** on a source
that did produce documents: the material is on disk, one of its files is not, and on disk that looks
identical to a source with nobody and nothing in it.

1. **Re-dispatch it once.**
2. If the second attempt still leaves one of the three missing, or reported as failing its check, record it in
   `audit.md` and name it in the run's Issues, per the costs above.
3. **Do not rebuild any of them by hand.** You no longer hold the claims, so any ranking or count you
   built would be by frequency alone — the thing these files exist to replace.

Which loss it is decides what the rest of the run can still do. A source that produced a raw report
but no handles file still reaches the summary, quoted as unvetted; one that produced no raw report
contributes nothing at all. The run says which rather than quietly shipping the shortfall.

## End of Extract

Extract is complete when every branch's searcher has returned, and every source with data has its checked `full_source_analysis/<source>-raw-report.json` and `<source>-players.json` — plus its checked `<source>-handles.json`, on the sources that carry handles. A source still missing one after a re-dispatch is complete too, and recorded as the loss it is. No marker file is written — resume infers completion from the presence of these artifacts.
