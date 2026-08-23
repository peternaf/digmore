# digmore V0.1.1 — implementation plan

Todo list only. Every reason is in `V0.1.1-subagents.md`; each line names the agent entry or
section that settles it. One line is one edit. Nothing here is waiting on an answer.

Agent numbers are that file's: 1 Scoping · 2 Branch Searcher · 3 Page Analyst · 4 Source Analyst ·
5 Handle Vetter · 6 Player Profiler · 7 Raw report writer · 8 Final report writer · 9 Final report
reviewer · 10 Final report copy editor · 11 Claim Fact Checker.

## Shapes — `scripts/subagent_returns.json`

- [x] Add `claim-index`, checked as a file after #7 writes it. §Checking the files a run writes
- [x] Rename the citation's `document` to `cachedPage` and point it at the page, not the claims file. #7
- [x] Add `documents` to `source-handles` — the cached files each handle appears in. #4
- [x] Add `statedIdentifiers` to `source-handles`, filled by the orchestrator in the batch pass that
      writes the verdicts. It is the only store for a promoter's linked accounts, and #7 joins
      `promoter_network.csv` rows on it — `experts.csv` holds `legit` people alone. #5, #7
- [x] Narrow `synthesizer` to a receipt: claims dropped with reasons, sections drafted, findings written. #8
- [x] Add a shape for the reviewer's return: one entry per item, plus one per unsourced claim. #9
- [x] Add a shape for the copy editor's return: one entry per removal, plus sentences rewritten. #10
- [x] Replace `verifier` with one paragraph's report: unsupported statements and two counts, no claim
      ids, plus a flag for the unreadable-evidence stop. #11
- [x] Drop the deleted Expert Document Analyst from the `page-analyst` description. #6

## Scripts

- [x] `config.mjs` — rename `synthesize.expertsFollowed` and `synthesize.urlsPerExpert` to `enrich.*`. §Where the Synthesize / Audit seam falls
- [x] `config.mjs` — delete `synthesize.claimsFactChecked` and `synthesize.manualVerifyFlagCap`. §Where the Synthesize / Audit seam falls
- [x] Call these configurations rather than ceilings — the scripts. `CONFIGURATION_DEFAULTS`,
      `CONFIGURATION_NOTES`, `configurationsFor`, `configurationsReport`, and preflight's printed
      heading. §Where the Synthesize / Audit seam falls
- [x] The same rename in `skill/**.md` (22 places) and `tests/*.mjs` (20), plus the `ceilings` field
      name inside every `run_history` entry. **`reference/first-run.md`'s five are Claude Code's
      harness limits and stay.** §Where the Synthesize / Audit seam falls
- [x] `plan_phase_a.md` — both `run_history` examples and the prose describing them carry `ceilings`
      and `synthesize.claimsFactChecked`. §Where the Synthesize / Audit seam falls
- [x] `api.mjs` — retry a 429 with backoff. #5
- [x] `api.mjs` — cache a Twitter vet under one name per handle, record how many posts were read, and treat a shallower file as a miss. #5
- [x] `api.mjs` — write one Reddit vetting file per handle instead of three. #5
- [x] `hackernews.mjs` — write one vetting file per handle instead of five. #5
- [x] `experts.mjs` — remove the lock and the tests covering it; keep the atomic write. #5
- [x] A script joins verdicts to claims and filters them before #7 merges. #7 does the
      `importance × page-quality` itself, in step 4, where the only reader of it is.
      New `synthesis.mjs join`, writing `<source>-joined.json` beside each per-source report.
      §Script changes this phase implies
- [x] A script stamps and appends `run_log.md`, because the timestamp needs a clock and the
      elapsed figure is a subtraction. New `runlog.mjs`, verbs `header`, `start`, `done`, `note`.
      §The run log

## Phase files

- [x] `enrich_phase_d.md` — add the expert step, its four parts, ahead of the candidate filter. §The Enrichment phase
- [x] `enrich_phase_d.md` — take carryover revalidation and player numeric carryover from Synthesize, and run them before the rows are written. §Where the Synthesize / Audit seam falls
- [x] `synthesize_phase_e.md` — replace the file with two dispatches, #7 then #8, and move its eight sections where the table says. §Where the Synthesize / Audit seam falls
- [x] `audit_phase_f.md` — rewrite the fact-check step: no ranking, no verifier per claim, no fetching, no check that the handle is in `experts.csv`. #11
- [x] `audit_phase_f.md` — add the review, the repair, the re-review, the copy edit and both redrafts around it. #11
- [x] `audit_phase_f.md` — before dispatching the fact check, list every prose paragraph with no claim marker and send them to #8 once. #11
- [x] `audit_phase_f.md` — a paragraph whose pages could not be read is removed as unchecked, not as unsupported. #11
- [x] `audit_phase_f.md` — the reviewer runs once more after a repair, over the items it raised and nothing else. #9
- [x] `audit_phase_f.md` — the reviewer is told what #7 dropped, so it does not ask for evidence the run already discarded. #9
- [x] `extract_phase_b.md` — the source notes file becomes `<source>-raw-report.json`, and joins the files that get checked. #4
- [x] `vet_phase_c.md` — replace steps 3 to 5 with one Handle Vetter per handle, and move the judging into that agent's files. #5
- [x] `vet_phase_c.md` — write verdicts in batches as they arrive, and skip a handle that already has one. #5
- [x] `plan_phase_a.md` — drop the rule that the footer section comes last; the footer is not a deliverable. §Where the Synthesize / Audit seam falls
- [x] `phases/index.md` — add `run_log.md` to the layout and to the who-writes-what table. §The run log
- [x] `phases/index.md` — add `cache/players/` to both. #6
- [x] `phases/index.md` — say `<source>-handles.json` has three writers at three different times. #4
- [x] `phases/index.md` — the who-writes-what row gives `promoter_network.csv`, the invented section
      CSVs, the raw report and the summary to one synthesizer. The first three are #7's, the summary
      is #8's. §The agents
- [x] The deleted "Report Writer" and "synthesizer" are still named in six files the rest of this plan
      does not touch: `enrich_phase_d.md`, `extract_phase_b.md` ×2, `page_analyst_agent/index.md`,
      `source_analyst_agent/index.md` and `general-inquiry.md`. Each becomes #7 or #8, whichever
      actually does the reading or the writing that sentence describes. §The agents
- [x] `phases/index.md` — the source notes file becomes `<source>-raw-report.json` in the layout tree,
      the who-writes-what table and the bulk-material table. #4
- [x] `phases/index.md` — four lines describe the abolished ranking: `audit.md` "with verdicts on the
      top-ranked claims", the Synthesize and Audit phase-file blurbs, and the bulk-material table's
      readers column. #11
- [x] `phases/index.md` — the Vet salvage path re-vets un-cached handles; it skips any row that
      already carries a verdict. #5
- [x] `phases/index.md` — the Synthesize salvage path names the old file, the abolished header and a
      re-run over the full claim set. #7's write order is the partial-progress path. #7
- [x] `phases/index.md` — resume reads the run log first, and the disk wins where the two disagree. §Resuming a run
- [x] `phases/index.md` — drop the line saying only `experts.csv` has a lock. #5
- [x] `phases/index.md` — Audit is no longer cheap to re-run. §Resuming inside Audit
- [x] `phases/index.md` — a run that finds the cache gone stops and offers to start over. §When the cache is gone
- [x] `reporting.md` — add the eight Audit sub-step markers. #11
- [x] `reporting.md` and `enrich_phase_d.md` — add Enrichment's five sub-step markers, `[4.1/6]`
      through `[4.5/6]`, the shape Extract and Audit already use. The run log names each pair after
      them, and the Player Profiler waves count down under `[4.5/6]`. §The run log
- [x] `reporting.md` — append every marker it prints to the run log. §The run log
- [x] `modes.md` — Twitter vets in one dispatch per handle, not a profile wave and a deep wave. #5
- [x] `phases/index.md` — drop `cache/_verify/` from the layout with the rest of what #11 abolishes. #11
- [x] `enrich_phase_d.md` — the claim-filter table says "never vetted"; the word is `unvetted`, and it
      covers a handle first seen in expert material as well as one below the cap. §What counts, and what is judgement

## Agent files and brain rules

- [x] Open every agent's file with the summary table. `AGENTS.md` §Writing a sub-agent file
- [x] Write files for #7 to #11 under `brain/subagents/`; none of them has one. §Turning an entry here into a skill file
- [x] `dispatch_structured_subagent.md` — move the heartbeat line and the `output.md` line into every dispatch, not only those returning a shape. #9
- [x] `dispatch_structured_subagent.md` — it lists the shape keys and counts the file-checked ones,
      and both have drifted. Point at `subagent_returns.json` instead of re-listing, and say "the
      shapes checked as files" rather than "three". `AGENTS.md` §one place defines a data piece
- [x] `branch_searcher_agent/index.md` and `source_analyst_agent/index.md` — each gains its
      Enrichment mode, as #3's does. #2, #4
- [x] `vetting.md` — drop both lock sentences, in §"Curated experts" and the paragraph under it. #5
- [x] `vetting.md` — `throwaway` is three reasons carried in `verdictReason`, not "two cases, one
      action". #5
- [x] `page_analyst_agent/index.md` — every claim carries the URL of the page it came from. #3
- [x] `page_analyst_agent/index.md` — in Enrichment the dispatch carries the expert's vetting cache
      beside the URL, so Reddit and Hacker News extract from it without a fetch. #3
- [x] `sections.md` — #7 writes the rows, not the synthesizer, and its two pointers into
      `synthesize_phase_e.md` §3.6 and `audit_phase_f.md` §0 both break. #7
- [x] `brain/index.md` — the phase-to-file map still describes the old Synthesize and Audit, and the
      sub-agent table stops at #6. §The agents
- [x] `source_analyst_agent/index.md` and all six source files — write `<source>-raw-report.json` instead of the notes file. #4
- [x] `source_analyst_agent/index.md` — each citation names the cached page it was read from. #4
- [x] `source_analyst_agent/index.md` — its four log lines. #4
- [x] `handle_vetter_agent/index.md` — write down the identifiers a profile prints; never work one out. #5
- [x] `handle_vetter_agent/index.md` — a verdict other than `legit` changes how a quote is used, not whether it survives. #5
- [x] `handle_vetter_agent/index.md` — Hacker News is not throttled any more. #5
- [x] `fetching.md` and `brain/index.md` — two agents fetch, not four. #6
      — `fetching.md` done; `brain/index.md` is the other implementer's
- [x] `page_quality.md` — drop ranking claims for verification, and the configuration it names. #11
- [x] `vetting.md` — drop the abolished verdicts from the confidence tag rule. #11
- [x] `vetting.md` — a profile that could not be read is `unknown`, not `throwaway`. #5
- [x] Five files — "anonymous, unverified" becomes "unvetted". #5
- [x] #8's file — the writer checks three things, the third being that every paragraph rendering a claim carries its marker. #8
- [x] #8's file — a section with no vetted voice in it opens by saying so. #8

## Documents a run writes

- [x] Every pass writes the summary to a temp file and renames it over the original. §Resuming inside Audit
- [x] Drop the `<!-- SYNTHESIZE-INCOMPLETE -->` header; the rename replaces it. #8
- [x] `audit.md` — replace its verification half with the new list. §`audit.md`
- [x] Rename `raw_research_outcomes.md` to `<slug>-raw-report.md` everywhere it is named. #7
- [x] #7 writes the enumerable sections first, then the raw report and the claim index together. #7

## Reference files

- [x] `landscape.md` §2 — the inclusion cross-check counts entities in the raw report, which does not
      exist when the rows are chosen. The count is `players.mjs candidates`; the exclusions are
      Enrichment's, recorded in `audit.md`. §Why it exists, §What counts and what is judgement
- [x] `reference/**` — `raw_research_outcomes.md` becomes `<slug>-raw-report.md` in all four command
      files; the deleted synthesizer, the abolished `manual-verify-required` cap and the two stale
      "Audit is bounded by its claim cap" phase weights go with it. #7, #11

## README

- [x] The fact check reads the text the run stored: it does not re-fetch, does not detect a dead link, and deletes rather than flags. #11
      — plus the one line saying what "verified" means, which moved out of `audit.md` into here
- [x] Rename the raw findings file in the file table. #7
- [x] It says five phases and names the first one "scope"; there are six and the first is Plan.

## Repo

- [x] Update the tests that assert the old cache filenames and the replaced shapes.
- [ ] Rebuild `plugin/` and commit; it is behind `skill/`.
- [x] `AGENTS.md` says the brain owns four phases; there are six.
      — plus its lock rule, now false: every file has one writer and no file has a lock

## Batching the Page Analyst — §The batch, in #3

- [x] `config.mjs` — `extract.urlsPerDispatch: 5` in `CONFIGURATION_DEFAULTS` and its line in
      `CONFIGURATION_NOTES`. Nothing in `FAST_REDUCTIONS`; `preflight.mjs` needs no edit. §The configuration
- [x] `modes.md` — the `extract` row of the group table gains it. §The configuration
- [x] `plan_phase_a.md` — its two worked `run_history` examples spell out the `extract` group, so both
      gain the new key; same for `plans/sample_research_plan.json`. §The configuration
      — the sample also still used `ceilings` and `synthesize.claimsFactChecked`; both fixed on the way
- [x] `tests/config.test.mjs` — whatever asserts the shape of the defaults tree. §The configuration
      — plus `preflight.test.mjs`'s printed-key list, and `validate.test.mjs`'s `page-analyst` cases
- [x] `subagent_returns.json` — `page-analyst` becomes an array, the present object as its `items`,
      `url` joining the four required fields. §What else has to change
      — `notes` folded in here too, the TO BUILD from the previous run
- [x] `extract_phase_b.md` §"Read" — the heading and the "never a batch" paragraph both say the
      opposite of what now happens; dispatch one agent per batch and read the receipts as an array. §What else has to change
- [x] `extract_phase_b.md` §"Read" — "dispatch them all at once" becomes one batch per branch at a
      time, every branch at once, no barrier between branches. §A branch's batches go out in waves
- [x] `extract_phase_b.md` §"Per-branch fetch cap" — the tally is read between waves, and the
      residual overshoot is at most one batch. §A branch's batches go out in waves
- [x] `dispatch_structured_subagent.md` — "drop that item" is the receipt, not the dispatch, for #3. §What else has to change
- [x] `page_analyst_agent/index.md` — eight summary-table rows, plus the sequential instruction and
      the one-document-at-a-time rule in the body. §What else has to change
- [x] `phases/index.md` — a wrong kill loses up to `extract.urlsPerDispatch` URLs, each recorded in
      `audit.md` individually. §The stuck-agent check
      — plus §"What a sub-agent is", whose one-item rule needed the carve-out named
- [x] `enrich_phase_d.md` §`[4.2/6]` — the expert read batches the same way, an expert being the branch.

## Batching the Handle Vetter — §The batch, in #5

- [x] `config.mjs` — `vet.handlesPerDispatch: 5` in `CONFIGURATION_DEFAULTS` and `CONFIGURATION_NOTES`;
      nothing in `FAST_REDUCTIONS`.
- [x] `modes.md` — the `vet` row of the group table.
- [x] `plan_phase_a.md`'s two `run_history` examples and `plans/sample_research_plan.json` gain the key.
- [x] `vet_phase_c.md` §Flow step 4 — "batched to the concurrent sub-agent limit" now means the batch
      size and the fan-out width; one agent per batch of `vet.handlesPerDispatch`, one source each.
- [x] `vet_phase_c.md` §Flow — the batches are formed after step 2's two filters, from what survives.
- [x] `handle_vetter_agent/index.md` — the summary table's *Input text*, *Run instances*, *`--fast`*,
      *Returns*, *One dispatch per*, *Logs*, and the body's sequential instruction.
- [x] Nothing changes in step 6: it already drops the offending row per handle.
- [x] `dispatch_structured_subagent.md` §"Name every dispatch" — the Page Analyst and Handle Vetter
      rows name a batch's unit, not one item's; `<n>` now counts batches. §What else has to change

## Cutting the orchestrator's context in Extract — §#2, §#3, §The dispatch template closes

Measured: 27 branches, 404 documents, 372k orchestrator context. Returns were ~115k of it, branch
searchers ~60k more.

- [x] `subagent_returns.json` — `branch-searcher` gains `droppedCount` and `lowestSurvivingScore`,
      both required; its description says the file is written, not returned. #2
- [x] `branch_searcher_agent/index.md` — sorts, cuts to `extract.fetchesPerBranch`, writes, returns
      `done`. Summary table's *Purpose*, *Settings*, *Held*, *Returns*, *Writes*. #2
- [x] `branch_searcher_agent/*.md` — the six "What you return" headings become "What you write". #2
- [x] `page_analyst_agent/index.md` — returns `done`; `notes` narrows to what the orchestrator acts
      on; new `pageNote` section. #3
- [x] `subagent_returns.json` — `page-claims` gains `pageNote`; `page-analyst`'s `notes` narrows. #3
- [x] `source_analyst_agent/index.md` — reads `pageNote`: a coverage gap joins the observations, an
      evidence qualifier travels to the claim. #3
- [x] `dispatch_structured_subagent.md` — "nothing outside the JSON" for every agent; the template
      test becomes whether an agent *writes* a shape, not returns one. §The dispatch template closes
- [x] `extract_phase_b.md` §Search — the searcher cuts and returns `done`; nothing is parsed from
      the message. §#2
- [x] `extract_phase_b.md` §Dedupe — reads each branch's list from `_returns/`; the candidate cut has
      already happened, and the two numbers go to `audit.md`. §#2
- [x] `extract_phase_b.md` §Read — receipts are read from `_returns/`, not the message. #3
- [x] `tests/validate.test.mjs` — the two new branch-searcher fields, and `pageNote`.

## Two gaps a real run flagged

- [x] `subagent_returns.json` — `source-raw-report`'s citation required `handle`, which its own field
      description says to omit on the open web. Dropped from `required`. §A citation's handle is source-dependent
- [x] `source_analyst_agent/index.md` — "every citation carries its handle" said the same thing; now
      says where the source has accounts, with the `no-handle`/`unvetted` consequence. §A citation's handle is source-dependent
- [x] `tests/validate.test.mjs` — pins both directions: a handle-less citation passes, a handled one
      still passes, `cachedPage` is still required.
- [x] `dispatch_structured_subagent.md` — the scratch-file rule joins the block every dispatch carries:
      inside the topic, name prefixed with the label. It lived only in `phases/index.md`, which no
      sub-agent is ever sent. §Every temp file carries the agent's label
- [x] `phases/index.md` — the directory rule gains the filename half, and points at the dispatch
      template for the wording agents actually receive. §Every temp file carries the agent's label

## The run stopped between phases — §The run does not stop between phases

- [x] `modes.md` §Manual mode — those two triggers are the only stops, both in Plan; the phases follow
      one another without a break; ending a turn hands control back whether or not you asked anything.
- [x] `phases/index.md` — an "End of …" section is a completion test, not a handoff.
- [x] `reporting.md` §Progress — no end-of-phase report; the next phase's marker is what says the last
      one is done.
- [x] `vet_phase_c.md` §Flow step 8 — "keep the user informed" is the marker and its running count,
      in `reporting.md`'s shape and nothing beyond it. It is the step the digest was printed under.
- [x] `modes.md` — the same paragraph, per step rather than per phase: nothing finishing is a place to
      hand back, not a sub-step and not a phase. §It stopped again
- [x] `reporting.md` §Progress — "no end-of-phase report" becomes "no end-of-step report", sub-steps
      included. §It stopped again
- [x] `reporting.md` §Progress — new bullet: a marker and its step go in the same turn. §It stopped again
- [x] `phases/index.md` — the "End of …" rule holds between sub-steps too. §It stopped again

## Verification gates — manual, once

- [x] `npm test` passes. 370 pass, 0 fail, 2 skipped by design — the 429-that-never-clears wants
      `DIGMORE_SLOW_TESTS=1`, and the 0600 mode check is POSIX-only.
- [ ] A manual full run reaches the four end-of-run sections without handing back after Plan.
- [ ] `node scripts/build.js && git diff --exit-code plugin/` is clean.
- [ ] One full run per command, fast and full, with an API key and without.
- [ ] `run_log.md` holds a start and a done line for every phase and every Audit sub-step.
- [ ] `cache/_progress/` holds one log per dispatched agent.
- [ ] Every paragraph of the summary that renders a claim carries its marker.
- [ ] `audit.md` names every claim deleted, refuted or dropped, and which step did it.
- [ ] A branch's fetch count on disk matches `extract.fetchesPerBranch`.
- [ ] Every `_returns/page-analyst-*.json` is an array of at most `extract.urlsPerDispatch` receipts,
      and every URL in one belongs to the same branch.
