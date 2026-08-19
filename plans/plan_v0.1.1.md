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

- [x] **S1** New `brain/sections.md` — the three section types, how an invented enumerable section
      plans its CSV, who fills it, how it renders.
- [x] **S2** `plan_phase_a.md` §3 rewritten: `scope.deliverables` is every section in order, key is
      the title, value is a pointer or a definition. Predefined first, invented after.
- [x] **S3** `plan_phase_a.md` §3.1 added: manual mode presents the plan and waits; sections are
      raised only when one was dropped or invented; `--auto` states and proceeds.
- [x] **S4** `research_plan.md` — `scope` gains `deliverables` (map) and `sections`; run ceilings
      move into each `run_history` entry, recording what actually applied.
- [x] **S5** `subagent_returns.json` — the `scope` shape returns the section list.
- [x] **S6** `synthesize_phase_d.md` §3.6 — an invented enumeration renders from its own file.
- [x] **S7** `general-inquiry.md` — dropped the claim that angle approval is unique to `ask`.

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
- [ ] **40** Settle who writes `players.csv` and the summary. `research_plan.md:31` says the
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
