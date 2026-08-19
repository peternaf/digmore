# digmore V0.1.1 — implementation plan

Todo list only. All substance is in `V0.1.1-subagents.md`; each line below cites the agent
number or file it belongs to. Written from what is already settled — it grows once Peter's
edits to the design land.

## Decisions that block tasks below

- [ ] **Who performs the fetch** — the Branch Researcher or the Document Analyst. Blocks 12,
      13, 14. Design: §2, §3.
- [ ] **Concurrency caps** for Document Analyst, Source Analyst, Expert Document Analyst, Claim
      Fact Checker, and Reddit/Twitter Handle Vetters. Blocks 16.
- [ ] **Does the Handle Vetter write `experts.csv` itself** under the lock, or return the row.
      Blocks 08.
- [ ] **Does `--fast` cap the player count.** Blocks 10.
- [ ] **Schema naming** — after the agent, or after the content. Blocks 02.

## Sections — done in this pass

- [x] **64** New `brain/sections.md` — the three section types, how an invented enumerable section
      plans its CSV, who fills it, how it renders.
- [x] **65** `plan_phase_a.md` §3 rewritten: `scope.deliverables` is every section in order, key is
      the title, value is a pointer or a definition. Predefined first, invented after.
- [x] **66** `plan_phase_a.md` §3.1 added: manual mode presents the plan and waits; sections are
      raised only when one was dropped or invented; `--auto` states and proceeds.
- [x] **67** `research_plan.json`'s schema — `scope` gains `deliverables` (map) and `sections`; run
      ceilings move into each `run_history` entry, recording what actually applied. (The schema was
      in `brain/research_plan.md` at the time; see 43 below for where it lives now.)
- [x] **68** `subagent_returns.json` — the `scope` shape returns the section list.
- [x] **69** `synthesize_phase_d.md` §3.6 — an invented enumeration renders from its own file.
- [x] **70** `general-inquiry.md` — dropped the claim that angle approval is unique to `ask`.

## File boundaries — done in this pass

`brain/research_plan.md` was `topic.md` renamed, and held five unrelated jobs. It is deleted; each
part moved to the file that owns it.

- [x] **43** Plan's own work → `phases/plan_phase_a.md`: slugging and the conditional stop, the
      fresh / re-run / branched detection, the three flows, and the `research_plan.json` schema.
      §1 was a three-bullet stub that deferred elsewhere; it is now the whole step.
- [x] **44** The output contract → `phases/index.md` §"Where a run writes": the directory layout,
      the summary filename convention, the who-writes-what table, and the temp-file / `_misc` rule.
      Every phase reads that file already.
- [x] **45** "Anything new that writes a shared file needs a lock or a single writer" → `AGENTS.md`.
      It is a build-time constraint on us, not an instruction to a run — same move as the anonymity
      rule. The file-to-writer map stays in the brain, at `phases/index.md`.
- [x] **46** What an executive summary is → `output.md`. It is a writing rule, and `output.md` is
      the one file the dispatch template sends automatically, so the Report Writer now receives it.
      Closes half of §8's Missing rules. The two editors still get nothing — task 16.
- [x] **47** Player numeric carryover → `synthesize_phase_d.md` §1, beside carryover revalidation,
      which is where it was always executed.
- [x] **48** Deleted the duplicate `research_plan.json` example in `plan_phase_a.md` — the copy where
      `fetchesPerBranch` had drifted back into `scope`. One copy now.
- [x] **49** Repointed every reference: `brain/index.md` (the Plan step, the phase-map row, and the
      one-row Topic-state map, now collapsed into the phase map), `modes.md`, `sections.md`,
      `synthesize_phase_d.md`, `SKILL.md`, and all four reference files.
- [x] **50** Fixed two stale prose links found on the way: `sources/reddit.md` and `vetting.md`.

Left open, and now visible in one file rather than split across two: **manual mode has two stops
in Plan** — §1 step 3 (conditional, about the topic) and §3.1 (unconditional, about the plan).
Neither changed; §1 now says outright that they are separate. Decide whether both should stay.

## Cache naming and the fetch path

**Built in this pass — `fetch.mjs`, `api.mjs`, `hackernews.mjs`:**

- [x] **51** `fetch.mjs` derives the filename from the URL — `filenameOnlyFromUrl`, host then path
      and query, non-alphanumerics to `_`, truncated at `FILENAME_ONLY_MAX` with `_<md5(url)[:8]>`
      appended **only** when truncation happened. One URL, one file. Design: §3, the DECIDED item.
- [x] **52** `--output-dir` replaces `--output`. The caller says where, the script says what.
      Passing a filename is no longer possible — that was how one page got cached twice under two
      names an agent typed.
- [x] **53** `--output-dir` returns a page already on disk instead of re-fetching it
      (`{path, bytes, cached: true}`). `long-form.md` asked for this and left it to the caller,
      which meant it never happened: the caller could not know the name.
- [x] **54** On failure, `fetch.mjs` puts `filename_only` and `path` in the error payload. A wall is
      where the run defers to WebFetch, and what WebFetch returns must be saved under the name
      `fetch.mjs` would have used, or resume and dedup see two files for one URL. No second call,
      and nothing for the agent to derive.
- [x] **55** Cache filenames carry their platform: `reddit-`, `twitter-`, `hackernews-`. 14 sites
      across `api.mjs` and `hackernews.mjs`. The directory already says it, but files leave the
      directory — the real runs put 46 vet verdicts in `_misc/`, where the model had invented
      `vet-hn-` and `vet-rd-` prefixes for exactly this reason.

**The brain has not been updated to match. Nothing below is done:**

- [ ] **56** `long-form.md` — `--output` → `--output-dir` throughout; drop the "check existence
      before calling" advice, which the script now does; state that the caller no longer names files.
- [ ] **57** `long-form.md` — write the wall rule: `fetch.mjs` first; on a bot wall, defer to
      WebFetch and save what it returns under the `filename_only` the error carried. Say plainly what
      that costs — WebFetch truncates and does not say where, so a page taken this way may be short a
      tail nobody can see, and the run records which tool got it.
- [ ] **58** `sources/forums.md` and `sources/websearch.md` — the `--output` invocations.
- [ ] **59** `sources/reddit.md`, `sources/hackernews.md`, `sources/twitter.md` — the cache-layout
      sections still list the unprefixed filenames.
- [ ] **60** `phases/index.md` §"Where a run writes" — the layout tree predates 55.
- [ ] **61** `extract_phase_b.md:72` counts WebFetch against the branch budget while
      `long-form.md:5` says "Do NOT use `WebFetch`". 57 settles which; make this line agree.
- [ ] **62** Tests: `fetch.test.mjs` asserts `--output`; `api-reddit`, `api-twitter`,
      `api-core` and `hackernews` assert the unprefixed filenames. All will fail as written.
      Add coverage for `filenameOnlyFromUrl`, the cache hit, and `filename_only` on the error.
- [ ] **63** `sources/hackernews.md` documents `vet-<name>.json`, which `hackernews.mjs` has never
      written — the `vet` verb returns a verdict and caches nothing. Either cache it or drop the line.

## One directory per sub-agent — done in this pass

`brain/sources/` gave one file per source to four different agents at once: discovery rules the
Branch Searcher needed, payload shapes the Page Analyst needed, vetting signals the Handle Vetter
needed, SimilarWeb the Player Profiler needed. Every agent read all of it, and five instructions in
those files named a destination without naming who writes there.

Replaced by `brain/subagents/`, one directory per agent, each file self-contained.

- [x] **71** `subagents/scoping_agent.md` — flat, one file. The 10-search cap is in it.
- [x] **72** `subagents/branch_searcher_agent/` — index + all six sources.
- [x] **73** `subagents/page_analyst_agent/` — index + all six sources. Absorbed `long-form.md`.
- [x] **74** `subagents/source_analyst_agent/` — index + all six sources. Output renamed
      `full_source_analysis/`.
- [x] **75** `subagents/handle_vetter_agent/` — index + reddit, hackernews, twitter, forums. Not
      websearch or local: a web page has an author, not an account, and a handed-over document has
      nobody to vet.
- [x] **76** `subagents/player_profiler_agent.md` — flat. Holds the SimilarWeb/WebFetch exception,
      the one place in the skill where WebFetch beats `fetch.mjs`.
- [x] **77** `brain/long-form.md` deleted, content absorbed, all four references repointed —
      including two `fetch.mjs` comments that described behaviour the script no longer has.
- [x] **78** `brain/sources/` deleted. Every reference repointed across `brain/`, `reference/` and
      the two scripts; all relative links verified to resolve.
- [x] **79** Recency settled: the scripts apply the window, WebSearch's `after:` is not used.

Left open by this pass:

- **`brain/vetting.md` is the next `long-form.md`.** Its parts now split three ways — source-quality
  definitions to the Page Analyst, verdicts and topical relevance to the Handle Vetter, the
  confidence-tag rule to the Report Writer. All three agent files point back at it rather than
  carrying it.
- **`brain/recency.md`** is in the same position, smaller.
- **The remaining seven agents** — #7 to #13 — have no directory. #13 reads the Page Analyst's.

## New agents

- [ ] **01** Add the `handle-vetting` shape to `scripts/subagent_returns.json`.
- [ ] **02** ~~Rename the stale `scope` shape reference~~ — done: the markdown copy is gone and
      `dispatch_structured_subagent.md` now names `scope`.
- [ ] **03** Add the `player-profile` shape to `scripts/subagent_returns.json`.
- [ ] **04** Rewrite `vet_phase_c.md` steps 3–5 as one Handle Vetter dispatch per handle.
- [ ] **05** Fold the topical-relevance check (`vet_phase_c.md:34`) into the Handle Vetter.
- [ ] **06** Fold the Twitter voice judgment (`vet_phase_c.md:62`) into the Handle Vetter;
      delete it as a separate dispatch.
- [ ] **07** Set Handle Vetter concurrency: Hacker News 1, because `hackernews.mjs:95-107`
      throttles per process and the first request in each never waits.
- [ ] **08** Decide and write who appends to `experts.csv` — the Vetter under the lock, or the
      orchestrator from the returned row.
- [ ] **09** Rewrite `synthesize_phase_d.md` §3.5 as a Player Profiler dispatch, one per row,
      5 concurrent, returning cells rather than writing `players.csv`.
- [ ] **10** Replace §3.5's per-row user prompt with per-wave handling: manual asks once per
      wave (retry / skip / abort); auto re-dispatches once, then skips and records.
- [ ] **11** Fix `vet_phase_c.md:9` — enrichment is a dispatch, not "the rest goes to
      sub-agents". The line contradicts `vet_phase_c.md:33`.

## Fetch ownership

- [ ] **12** Pick one owner for the fetch and make all six `brain/sources/*.md` say it.
      Today: `reddit.md:35` and `websearch.md:19` say the Document Analyst, `hackernews.md:21`
      says the Branch Researcher, `forums.md:16` names nobody.
- [ ] **13** Make `fetchesPerBranch` countable by whoever owns the fetch — a per-branch tally
      or a single fetching agent per branch. Today no agent can see the branch total.
- [ ] **14** State the pagination rule where the fetching agent will read it, not only in
      `long-form.md`.

## Rules that never reach the agent

- [ ] **15** Move the heartbeat line out of `dispatch_structured_subagent.md` so every agent
      gets it, not only those returning JSON. Affects §4, §9, §10, §11, §12.
- [ ] **16** Same for the `brain/output.md` line — the Copy Editor rewrites the user-facing
      report without the writing-style rules.
- [ ] **17** Pass `recency.md` to the Branch Researcher; it writes the queries and the
      `after:<date>` rule lives there.
- [ ] **19** Pass `vetting.md`'s source-quality definitions to the Document Analyst and Expert
      Document Analyst; the schema gives them the seven words, not what they mean.
- [ ] **20** Pass `vetting.md`'s confidence-tag rule to the Report Writer.

## Unbounded returns and budgets

- [ ] **21** Cap `results` in the `branch-searcher` shape; today it has no `maxItems`, so a
      branch can return 200 URLs into the main context.
- [ ] **22** Cap `claims` in the `source-extractor` shape; same problem, ~700 dispatches.
- [ ] **23** Budget the expert expansion in `synthesize_phase_d.md` §2. `fetchesPerBranch` is
      per branch and expansion has no branch, so 10 URLs × up to 50 experts is unbounded.
- [ ] **24** Bound the Gap Reviewer loop in §4 — "gaps closed cheaply go back into step 3" has
      no limit.
- [ ] **25** Budget or cap the Scoping agent, the only unbudgeted searcher in a run.

## Duplication

- [ ] **26** Dedupe URLs across branches before dispatching readers; a page five branches
      found is read five times.
- [ ] **27** Have the Claim Fact Checker read Extract's cache before fetching; the page is
      usually already on disk.
- [ ] **28** Stop the Report Writer returning `findings[]` as well as writing them, or state
      what the return is used for.

## Reporting and records

- [ ] **29** Replace the five tally buckets at `audit_phase_e.md:73` with the thirteen agent
      names, so Extract's cost is separable from expansion's.
- [ ] **30** Give the Document Analyst a way to report paywalled or empty distinctly from
      "no claims found".
- [ ] **31** Have the Branch Researcher report how many candidates it discarded.
- [ ] **32** Mark unverified claims in the report — everything ranked 51+ is unchecked and
      indistinguishable from a verified claim.
- [ ] **33** Re-run the Brief Reviewer after the orchestrator fixes what it found; today the
      fix is never verified.

## Editing passes

- [ ] **34** Move rules 2, 3 and 4 of `synthesize_phase_d.md` §4.5 into `scripts/validate.mjs`;
      they are format validation, not editing.
- [ ] **35** Have the Copy Editor and Repetition Editor each report what they changed, so a
      citation lost between them can be traced.
- [ ] **36** State the ordering rationale for §4.5 before §4.6, or merge them.

## Ownership gaps

- [ ] **37** Assign an owner for `entry_tier_price_usd`, `pricing_model` and `funding_stage` in
      `players.csv`; §3.5 covers neither and nothing notices when they are empty.
- [ ] **38** Assign an owner for cross-source identity — nothing merges `hn/foo`, `u/foo` and
      `@foo` into one person.
- [ ] **39** Define the Report Writer's input: how every surviving claim reaches it. It is the
      largest prompt in the run and nothing specifies it.
- [ ] **40** Settle who writes `players.csv` and the summary. `phases/index.md:49` says the
      Report Writer; §3.5 and §3.6 are written as orchestrator steps against the same files.

## Repo hygiene

- [ ] **41** `AGENTS.md:16` says the brain owns "the four phases"; there are five — Plan,
      Extract, Vet, Synthesize, Audit.
- [ ] **42** Rebuild `plugin/` and commit, so the built output matches `skill/`.

## Verification gates — manual, once

- [ ] `npm test` passes.
- [ ] `node scripts/build.js && git diff --exit-code plugin/` is clean.
- [ ] One full run per command, `--fast` and full, keyed and keyless.
- [ ] `cache/_progress/` holds one log per dispatched agent, including the five that write none
      today.
- [ ] `audit.md`'s dispatch tally names every agent kind that ran.
- [ ] A run's fetch count per branch matches `fetchesPerBranch`, checked on disk rather than
      trusted.
