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

## Verification gates — manual, once

- [ ] `npm test` passes.
- [ ] `node scripts/build.js && git diff --exit-code plugin/` is clean.
- [ ] One full run per command, fast and full, with an API key and without.
- [ ] `run_log.md` holds a start and a done line for every phase and every Audit sub-step.
- [ ] `cache/_progress/` holds one log per dispatched agent.
- [ ] Every paragraph of the summary that renders a claim carries its marker.
- [ ] `audit.md` names every claim deleted, refuted or dropped, and which step did it.
- [ ] A branch's fetch count on disk matches `extract.fetchesPerBranch`.
