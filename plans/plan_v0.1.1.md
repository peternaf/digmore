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

- [x] `vet.handlesPerDispatch` raised to **10**, with **`twitter.handlesPerDispatch: 5`** overriding it
      on that source — a deep vet reads `postsPerDeepVet` posts, so the same count carries far more
      material there. `config.mjs`, `modes.md`, `vet_phase_c.md`, `handle_vetter_agent/index.md`,
      `phases/index.md`, `plan_phase_a.md`, `sample_research_plan.json`, both tests. **`plugin/` is
      behind** — 6 files, needs the build.

**Done, and partly revisited below.** One source per batch stands. What the vetting package changes:
the dispatch carries a range rather than the handles, the two filters move into `handle_vetting.mjs`,
and **step 6 goes entirely** — the aggregation validates as it reads, so there is no post-write check
on `<source>-handles.json` left to keep per-handle.

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

## `gtm` in `--fast` — §`gtm` in `--fast`

- [x] `gtm-teardown.md` §"What `--fast` runs here" — the source set becomes every source except
      forums; Twitter's post text comes from the Page Analyst's `tweet` fetch, not from the deep vet;
      the open web is what finds a brand's forum mentions, with no handle behind them; the keyless
      case is Hacker News and the open web rather than Hacker News alone.

## Making the profiling step faster — §Making the profiling step faster

- [x] `enrich_phase_d.md` §`[4.5/6]` — dispatch the next row as one returns; the concurrency stays
      filled rather than being refilled in groups. The failed-row prompt and the marker's count both
      describe groups today and have to be re-said in rows.
- [x] `enrich_phase_d.md` and `player_profiler_agent.md` — concurrency is `min(20, harness limit)`,
      replacing the hard 5, with the reason the 5 existed kept beside it.
- [x] `player_profiler_agent.md` — a traffic cell that came back empty carries its reason, so a
      SimilarWeb captcha is visible instead of reading as a company with no traffic.
- [x] `player_profiler_agent.md`, `enrich_phase_d.md` — one profiler's fetches are capped at
      `extract.fetchesPerBranch`; the *Settings that control it* row says `none` today.
- [x] `modes.md` — the one configuration spent outside its own phase, named where the rule is stated.
- [x] `player_profiler_agent.md` — the sentiment and funding searches are written to `cache/players/`
      and read back before re-searching on a re-dispatch.
- [x] `reporting.md` — `[4.5/6]` counts rows profiled, not waves.

## Every heartbeat line carries its timestamp — §Every heartbeat line carries its own timestamp

- [x] `runlog.mjs` — `beat` writes `<stamp>  <text>`, as `note` already does, and the comment saying
      the line is deliberately unstamped goes with it.
- [x] `tests/runlog.test.mjs` — nothing covered `beat`; two tests added, for the stamp and for two
      stamped lines appending in order.
- [x] `dispatch_structured_subagent.md` — "do not stamp it with a time" becomes "do not stamp it
      yourself"; the script does.
- [x] `phases/index.md` §Heartbeat — the line carries a stamp; the stuck-agent trigger is still the
      file's modification time, and the stamps are what let the check say which step was slow.

## What a dispatch costs your context — §What a dispatch costs your context

- [x] `dispatch_structured_subagent.md` §"When a dispatch produces a shape" — the dispatch names the
      shape and tells the agent to run `validate.mjs --shape <name>` itself; the orchestrator stops
      pasting the entry. The slot table's *"Print it, do not open the file… Paste the whole entry"*
      is the line that changes.
- [x] `dispatch_structured_subagent.md` — the format spec stays pasted, and says why beside it: an
      agent pointed at a file defaults to the shortest plausible content, and nothing catches that.
- [x] `dispatch_structured_subagent.md` — new rule: a dispatch never restates what the agent's own
      file says. The job slot is the work, the item and the per-dispatch values. A rule that has to
      reach the agent goes in the agent's file, not in the prompt.
- [x] `dispatch_structured_subagent.md` — name the three exceptions that stay pasted: the standing
      block, the format spec, and configuration numbers.
- [x] `final_report_copy_editor_agent.md` — its *Input text* row carries the only statement of the
      no-restatement rule today; it becomes an instance of the shared rule rather than the source.
- [x] `dispatch_structured_subagent.md` §"The repair pass" — the repair keeps pasting the shape; say
      why beside it. The ordinary dispatch never carries it.
- [x] `dispatch_structured_subagent.md` — new line: every dispatch sends the agent its own
      `<agent>.md`, and its `<source>.md` where it has one.
- [x] `vet_phase_c.md` step 4 — the only phase that never says to send the agent its files; its two
      mentions are passive. Point at the rule above.
- [x] `extract_phase_b.md`, `synthesize_phase_e.md`, `enrich_phase_d.md`, `audit_phase_f.md` — their
      own statements of it become instances of the shared rule.

## Vetting — the handles never reach the orchestrator · §Vet's context is the input, not the return

**Build first of the remaining packages.** It rewrites `vet_phase_c.md` steps 1–6 whole, so anything
else touching that file lands on top of a rewrite. Assumes the Handle Vetter batching above is
already done — `vet.handlesPerDispatch` and one source per batch stay as they are.

**Move the salvage block out of `phases/index.md` while doing this.** The Vet salvage path has to be
rewritten here anyway, and `phases/index.md` is carrying six unrelated jobs; the block is 39 lines of
189 and about to grow with the work-list and per-handle files. One new brain file, referenced from
the phase-to-file map. Not worth a pass of its own — worth doing in this one.

**DONE.** The new file is `brain/resuming.md` — it took the salvage paths, the cache-is-gone rule
and the out-of-web-searches rule, since all three are read on a resumed run and on no other.
`phases/index.md` keeps a four-line pointer, `brain/index.md`'s map gains a row, and
`audit_phase_f.md` and `enrich_phase_d.md`'s two pointers into the old section now name it.

**Three files the vetting package touched that no line above named**, each a consequence rather
than a new decision:

- [x] `phases/index.md` — the `experts.csv` who-writes-what row, which is the third file of the
      `experts.csv` fix. `vetting.md` and `sections.md` are the other two and are not this package's.
- [x] `synthesize_phase_e.md`, `raw_report_writer_agent.md` ×2, `gtm-teardown.md`,
      `handle_vetter_agent/forums.md` — `statedIdentifiers` becomes the labelled fields wherever the
      identity join is described. **`vetting.md` §"Identity is stated, never inferred" is the one
      remaining mention and belongs to whoever holds that file.**
- [x] `source_analyst_agent/` — the four handle-bearing per-source files each get a `handles/` row in
      their on-disk table, beside the `index.md` rule.

**The Handle Vetter**

- [x] `handle_vetter_agent/index.md` — the dispatch carries a **range**, the source and the research
      question. No handle names, no rows. *Input text*, *Input data files*.
- [x] It calls `handle_vetting.mjs` for its own handles, each arriving with its `--posts`.
- [x] It writes one file per handle to `cache/<source>/handles/<handle>.json` as each finishes.
- [x] Identifiers are **labelled** — `realName`, `github`, `website`, the platform handles,
      `otherIdentifiers` — not a bag of strings. **`statedIdentifiers` is deleted, not renamed.**
      §What the labelled identifiers change
- [x] Every field in the file is camelCase, matching `source-handles`. **The vetting scripts keep
      snake_case** and are untouched; the agent translates, and its own file says so.
- [x] `lastActive` is a **move, not a rename** — `hackernews.mjs` writes it as `signals.last_active`,
      and it becomes a top-level field.
- [x] It writes `vettingSignals`. Field names match `<source>-handles.json`'s, so the merge is a copy.
- [x] It validates its own file, repairs once, revalidates, and returns a failure on a second failure.
- [x] It returns `done`. Summary table: *Returns* → `done`, shape → *Writes to disk*, the "No shape,
      deliberately" justification out of the table.
- [x] *Settings that control it* gains `subagents.repairAttempts` — **this agent enforces it now**.

**`handle_vetting.mjs` — new**

- [x] **Prepare** (once per source): read the ranked file, take the cap, match `experts.csv` by
      platform column, write the matches in as `legit`, drop the auto-promoted / already-verdicted /
      already-filed, decide Twitter depth, freeze the remainder to
      `cache/<source>/vetting-worklist.json`, return the count.
- [x] **Serve a range** (once per vetter): the handles at those positions, with everything a vetter
      needs.
- [x] **Aggregate** (once per source, after its vetters have all *stopped*): validate each handle
      file, discard the malformed, merge the rest into `<source>-handles.json` by `handle`, never
      rebuild it, report the gap.
- [x] It imports `experts.mjs`'s matching rather than re-implementing it.

**`utils.mjs` — new**

- [x] Extract the sanitisation inside `filenameOnlyFromUrl` into `safeFilename()`.
- [x] `filenameOnlyFromUrl` calls it; new `handleFilename()` calls it on the **lowercased** handle.
- [x] Do **not** move `assertWorkspaceRoot` or `parseArgs` — separate cleanup.

**`experts.mjs`**

- [x] New verb, run **once after every source is vetted**: read the merged handles files, take the
      `legit`-and-on-topic rows, fold each through the existing `merge`.
- [x] One bad row is recorded and skipped, never aborting the rest.

**Schemas**

- [x] New `handle-vetting` shape, every field typed.
- [x] `source-handles`: `signals` → `pageSignals`; add `vettingSignals`; add `lastActive`.
- [x] `statedIdentifiers` becomes the labelled fields plus `otherIdentifiers`; #7's
      `promoter_network.csv` join moves with it.

**Phase and brain files**

- [x] `vet_phase_c.md` steps 1–6 rewritten around the script; the orchestrator writes neither file;
      the separate validation step goes.
- [x] `vet_phase_c.md` step 2 — drop "or written earlier in this run"; only the inherited case remains.
- [x] Vet's end condition becomes "every source aggregated".
- [x] `phases/index.md` — `cache/<source>/handles/` and the work-list file join the layout tree;
      `<source>-handles.json`'s Vet writer becomes the script, **at two moments**.
- [x] `source_analyst_agent/` per-source files — ignore the `handles/` subdirectory.
- [x] `dispatch_structured_subagent.md` — the Handle Vetter stops being the stdin exception; it now
      writes a file like everyone else, so the paragraph naming it as the one deliberate exception goes.

**Tests**

- [x] The new shape · the three renames · `safeFilename` and `handleFilename` · ranges over a frozen
      list · aggregation · malformed-file discard · gap reporting · auto-promotion from `experts.csv`.

## `validate.mjs` — `uniqueBy` · §`uniqueBy`

- [x] New `uniqueBy` keyword in the array branch, comparing normalised values, naming both offending
      indexes.
- [x] Applied to `claim-index` (`claimId`), `source-handles` (`handle`), `source-players` (name),
      `page-analyst` (`url`). **Not `handle-vetting`** — one handle per file, no array to check.

**Independent of the other packages.** Nothing here waits on them and nothing here blocks them.

## Enrichment — `expert_selection.mjs` · §`expert_selection.mjs`

**After vetting.** It imports the handles-file reader from `handle_vetting.mjs`, which that package
creates.

- [x] **Select**: filter to `legit` and on-topic, keep each file's order, round-robin, stop at
      `enrich.expertsFollowed`. Returns the handles and their cache paths.
- [x] **Dedupe**: drop URLs Extract already read; keep one copy of a URL two experts found, tie broken
      by round-robin order.
- [x] Imports the handles reader from `handle_vetting.mjs` and the URL→filename rules from
      `fetch.mjs`, `api.mjs`, `hackernews.mjs`.
- [x] `enrich_phase_d.md` — both steps become script calls.

## The orchestrator's own writes — §The orchestrator's own writes have no rules

- [x] `synthesize_phase_e.md` and `audit_phase_f.md` — the temp-file rule where the orchestrator
      actually writes scratch: inside the topic, `cache/_misc/`, name prefixed with the step. It is
      in `phases/index.md` alone today, which is read at the start of a run and 30 hours behind by
      Audit.
- [x] `audit_phase_f.md` §Record — the orchestrator changes an existing file with the edit tool; a
      heredoc always quotes its delimiter; never `node -e` with the document inline.
- [x] Say the whole-file rewrite is the expensive option, not the safe one — the harness reads before
      it overwrites, and the summary is 145 KB.
- [x] The `.tmp`-then-rename rule is unchanged; only the document's text stops passing through the
      shell.

## `audit.md` is appended as the run goes · §`audit.md` is appended as the run goes

**Build last.** It rewrites every *"record it in `audit.md`"* across four phase files, and three of
those files are rewritten by the packages above — do it first and the rewrites drop the calls.
Assumes `runlog.mjs`'s stamped heartbeats are already in.

- [x] `runlog.mjs` — new `finding <category> "<text>" --topic <slug>` verb, appending one tagged line
      to `audit.md`. The category list lives in this script and nowhere else.
- [x] `runlog.mjs header` truncates `audit.md` at the start of a run — the run-start hook already
      fires there, and it is what "replace it entirely" becomes.
- [x] `audit_phase_f.md` — the fifteen headed sections go; `[6.8/6]` appends **Unanswered** only, which
      is the one thing that cannot be known before the report is finished.
- [x] `audit_phase_f.md` — the fact check appends each deleted statement and its reason at the moment
      of deletion, not at the end.
- [x] Every *"record it in `audit.md`"* across the phases becomes a `runlog.mjs finding` call:
      `extract_phase_b.md` (dropped-for-budget, URL duplicates, budget overrun, dropped receipts,
      blocked and WebFetch pages), `vet_phase_c.md` (per-source handle counts, the aggregation's gap
      report), `enrich_phase_d.md` (excluded players), `phases/index.md` (the stuck-agent kill).
- [x] `phases/index.md` — the who-writes-what row for `audit.md` says appended through `runlog.mjs`,
      truncated at run start, no longer written once in Audit.
- [x] Tests — the append, the category tags, truncation at `header`, and that a run stopped mid-way
      leaves a readable file.

## `run_log.md` becomes `run_log.log` — §The run log

- [x] `runlog.mjs` — the path it builds, and its docstring.
- [x] The `##` run heading becomes a plain separator — `=== run <ts> — <kind> · <mode> · run_history[n] ===`.
- [x] `phases/index.md` — the layout tree, the who-writes-what row, and the salvage path that opens it
      by name. That last one is the only load-bearing reference; the rest are the model's map.
- [x] `audit_phase_f.md` ×2, `reporting.md` ×1 — passing mentions.
- [x] `tests/runlog.test.mjs`.
- [x] Nothing to do for existing topics — a resumed run reads the missing file as no log and does a
      full scan, which `phases/index.md` already covers.

## Whoever writes a JSON validates it — §Whoever writes a JSON validates it

**Blocks nothing, blocked by nothing.**

**The dispatch template**

- [ ] `dispatch_structured_subagent.md` §"When a dispatch produces a shape" — the block gains the
      check, the one repair, the revalidation and the failure report.
- [ ] §"Then check what comes back" — the orchestrator's call goes; what is left is what it does with
      a reported failure: record the drop, name it in Issues.
- [ ] §"The repair pass" — becomes the agent's, carrying both instructions verbatim.
- [ ] §"Count them" — the counts reach `audit.md` through the agent's own `runlog.mjs finding`.
- [ ] The paragraph justifying the printed shape — *"omitting it is the one thing that gets caught"* —
      is false once the checker moves. Rewrite it.
- [ ] The array rule — one entry dropped, not the dispatch — is the agent's, and it revalidates after.

**The Source Analyst — no shape, so no template**

- [ ] `extract_phase_b.md` §"Check the files it wrote" — the three orchestrator calls go.
- [ ] `source_analyst_agent/index.md` — a check section, and four summary rows: *Runs* (no longer
      `no scripts, no network`), *Returns* (*"The orchestrator checks them itself"*),
      *Settings that control it* (`subagents.repairAttempts`), *How it reports failure*.

**`research_plan.json` — the orchestrator's own**

- [ ] `subagent_returns.json` — new `research-plan` shape. Identity, `run_history`, `scope`.
- [ ] `plan_phase_a.md` — a call after the identity write and after `scope`; one repair, then report.
- [ ] `audit_phase_f.md` §`[6.8/6]` — a call after `phases_completed`.
- [ ] `tests/validate.test.mjs` — the new shape, and that a missing `run_history` entry is caught.

**Eight agent files gain two rows** — *Runs* gains `validate.mjs <shape>`, *Settings that control it*
gains `subagents.repairAttempts` as enforced by that agent:

- [ ] `scoping_agent.md` · `branch_searcher_agent/index.md` · `page_analyst_agent/index.md` ·
      `player_profiler_agent.md` · `final_report_writer_agent.md` ·
      `final_report_reviewer_agent.md` · `final_report_copy_editor_agent.md` ·
      `claim_fact_checker_agent.md`.
- [ ] `handle_vetter_agent/index.md` and `raw_report_writer_agent.md` already say it — make the
      wording the shared rule rather than their own exception.

**Passing mentions**

- [ ] `brain/index.md` item 5 — *"Every sub-agent return is checked"* keeps the guarantee, changes the actor.
- [ ] `synthesize_phase_e.md` ×2, `audit_phase_f.md` ×1 — *"Check what comes back"* becomes reading the receipt.
- [ ] `validate.mjs` docstring — *"the orchestrator gets ONE repair attempt"* names the writer, and the
      `phases/index.md` pointer moves to the dispatch template.
- [ ] `phases/index.md:133` — the bulk-material table still gives `<source>-handles.json` three writers
      including the orchestrator. Line 71 has it right: Source Analyst, `prepare`, `aggregate`, Source
      Analyst, then `experts.mjs build`. Stale independently of this package; it is the last place
      anything claims the orchestrator writes a JSON other than the plan.

## A script writes `claim_index.json` — §A script writes `claim_index.json`, not the agent

**After the validation package** — it removes `validate.mjs claim-index` from the agent, which that
package touches.

**Schemas**

- [x] New `merge-manifest` shape: per merged claim, the source claim references it groups, the merged
      `claim` text, `refutedBy` and `refutedReason`. No quotes, no URLs.
- [x] `claim-index` is unchanged — the file's shape is the same, only its writer moves. Its
      `description` says the Raw report writer writes it; that becomes `synthesis.mjs index`.

**`synthesis.mjs` — new `index` verb**

- [x] Reads the manifest and the six `<source>-joined.json`; writes `claim_index.json`.
- [x] Resolves each reference, copies its citations verbatim, takes the highest `importance` and the
      canonical citation's `pageQuality`, numbers the result `claim-001` upward.
- [x] **Fails on a reference that does not resolve**, naming it — the check a shape could never make.
- [x] On the repair pass it appends, continuing from the highest id already there.

**The agent**

- [x] `raw_report_writer_agent.md` §5 — it writes the raw report and the manifest, then calls
      `synthesis.mjs index`. Summary rows: *Runs*, *Returns*, *Writes to disk*.
- [x] Its `validate.mjs claim-index` call goes; the manifest is what it validates.
- [x] §5's "written together from one merge" clause — the guarantee holds, the index is now expanded
      from the manifest by a script rather than typed out.
- [x] **Beat per batch on any multi-call write**, so a long write is never mistaken for a hung agent.
      This is the fix that stops the stuck-agent check killing it at 10 minutes, and it stands whether
      or not the rest of this package lands.

**Phase and brain files**

- [x] `synthesize_phase_e.md` §`[5.1/6]` — the writer's outputs, and the new script call.
- [x] `phases/index.md` §"Where a run writes" — `claim_index.json`'s writer becomes the script.
- [x] `resuming.md` — "either `<topic-slug>-raw-report.md` or `claim_index.json` missing means the
      pass did not finish" still holds; check the wording still names the right actor.

**Tests**

- [x] The new shape · reference resolution · an unresolvable reference · the two maxima · id numbering
      · append-on-repair continuing the counter.

## The fact check is batched — §The fact check is batched, and a script builds its paragraphs

**Blocks nothing.** Assumes Audit's seven sub-steps, so `[6.4]` is Markers and `[6.5]` is Fact check.

**`factcheck.mjs` — new script**

- [ ] `prepare` — split the summary on blank lines, then split any piece carrying more than one marker
      at every line break. Write `cache/_misc/factcheck-worklist.json` and
      `cache/_misc/factcheck-unmarked.md`. Return `paragraphs`, `unmarked`, `staleIds` and both paths.
- [ ] The unmarked file locates each paragraph — its section and opening line — so the writer can find
      it rather than search for it.
- [ ] `serve --from <n> --to <n>` — those paragraphs, each with its number and its quotes grouped one
      entry per `cachedPage`. Resolves the ids from `claim_index.json` at call time.
- [ ] A short last range is not an error, as `handle_vetting.mjs serve` already has it.
- [ ] A stale id — a marker naming a claim the index does not have — is counted and skipped, never an
      error: the copy editor can drop a rendering without saying so.

**Configuration**

- [ ] `config.mjs` — `audit.paragraphsPerDispatch: 5` in `CONFIGURATION_DEFAULTS` and
      `CONFIGURATION_NOTES`. Nothing in `FAST_REDUCTIONS`.
- [ ] `modes.md` — the group table gains an `audit` row, and *"Synthesize and Audit have no group at
      all"* is reworded: a batch size is not a depth setting, and there is still no checked subset.
- [ ] `plan_phase_a.md`'s two `run_history` examples and `plans/sample_research_plan.json`.
- [ ] `tests/config.test.mjs` and `tests/preflight.test.mjs` — the defaults tree and the printed keys.

**Shapes**

- [ ] New `factcheck-paragraph` shape for what `serve` hands back, so the agent is given one.
- [ ] `claim-fact-checker` is unchanged — same return, same one file per paragraph.

**`audit_phase_f.md`**

- [ ] `[6.4]` — `prepare`, dispatch the writer with the unmarked file's path, then `prepare` again.
      Drop *"Read the finished summary in full first"*: `prepare` lists the unmarked paragraphs now.
- [ ] `[6.5]` — split the count into ranges and dispatch one checker per range. Remove the three-step
      "how the dispatches are built" block and the "paragraph number is yours to stamp on" rule.
- [ ] `[6.7]` — read the summary here instead, for the Answer block and the follow-up ideas.
- [ ] Everything after a flag is untouched: the two categories, the deletions, the redraft, the
      never-copy-edited note, the cache-is-gone stop.

**`claim_fact_checker_agent.md`**

- [ ] Summary rows: *Input text* (a range, not a paragraph), *Runs* (`serve`, then per paragraph),
      *One dispatch per*, *Run instances*, *Concurrency*, *Settings that control it*.
- [ ] The sequential instruction, as the Page Analyst and Handle Vetter carry it: one paragraph
      finished and written before the next is started, never two sets of evidence held at once.

**Tests**

- [ ] The bullet-list split · a normal paragraph split · numbering stable across two `prepare` runs ·
      citations grouped per `cachedPage` · a stale id counted not thrown · a short last range · the
      unmarked file carrying its locations.

## Verification gates — manual, once

- [x] `npm test` passes. 372 pass, 0 fail, 2 skipped by design — the 429-that-never-clears wants
      `DIGMORE_SLOW_TESTS=1`, and the 0600 mode check is POSIX-only.
- [ ] A manual full run reaches the four end-of-run sections without handing back after Plan.
- [ ] `node scripts/build.js && git diff --exit-code plugin/` is clean.
- [ ] One full run per command, fast and full, with an API key and without.
- [ ] `run_log.log` holds a start and a done line for every phase and every Audit sub-step.
- [ ] `cache/_progress/` holds one log per dispatched agent.
- [ ] Every paragraph of the summary that renders a claim carries its marker.
- [ ] `audit.md` carries a tagged line for every claim deleted, refuted or dropped, naming the step —
      **and a run stopped mid-way still leaves the lines it had earned.**
- [ ] A branch's fetch count on disk matches `extract.fetchesPerBranch`.
- [ ] Every `_returns/page-analyst-*.json` is an array of at most `extract.urlsPerDispatch` receipts,
      and every URL in one belongs to the same branch.

---

# V0.1.2 — quotes, the Source aggregator, and observations

Todo list only. Every reason is in `V0.1.1-subagents.md` under **V0.1.2**; each line names the section
that settles it. One line is one edit. Nothing here is waiting on an answer.

**Build order: all scripts first, then the skill files.** `plugin/` rebuild and `npm test` are
Peter's, at the end.

## A. Scripts — shapes (`skill/scripts/subagent_returns.json`)

- [ ] 1. `page-claims`: new **required** `citeId` on every claim — `<source>_<random hex>`. §The quote loses its page
- [ ] 1a. **No cross-file `citeId` check anywhere** — page-local uniqueness is all that is required once the marker and the manifest stop searching by id. `validate.mjs uniqueBy` on the returned array is exactly right. §The quote loses its page
- [ ] 1b. **No fixed worked example of a `citeId` in any skill file** — a concrete id in the Page Analyst's own file is what a sonnet-tier agent copies verbatim across hundreds of dispatches. §The quote loses its page
- [ ] 2. `source-raw-report`: **drop `quote`** from the claim; citations gain `citeId` and `representative` (boolean, exactly one true per claim). §The fix — citeId
- [ ] 3. `source-raw-report.claim`: new description, verbatim from the design. §Two causes in the spec
- [ ] 4. `source-raw-report.observations`: becomes an **array of strings** — no citations, no quotes, no `kind`. §The new shape
- [ ] 5. `claim-index`: citations gain `citeId` and `representative`, **drop `quote`**. **`cachedPage` stays.** §Resolving a quote
- [ ] 6. `merge-manifest`: new **`representativeFrom`** — **the `from` reference itself**, `"reddit[41]"`, copied from what `read_source_claims` printed. **Not a position**: `from`'s entries are stable identifiers, unlike what `refutedByIndex` points at, and this pass exists to stop agents counting positions. §representative — which quote gets rendered
- [ ] 7. `merge-manifest.claim`: drop the words *"one-line"*. §Two causes in the spec
- [ ] 8. `page-claims.claim`: **unchanged** — verify nothing edits it. §Two causes in the spec
- [ ] 9. Shape **rename**: `source-raw-report` → `source-preliminary-results`. §Renames
- [ ] 9a. Shape **rename**: `raw-report-writer` → `source-aggregator` (`subagent_returns.json:1019`), and its description at `:1108`. **Item 73 is in section J, which runs after the scripts** — this one belongs here or the shape key stays mismatched through all of phase one. §Renames
- [ ] 9b. `source-aggregator.claimIndexError`'s description — under the new write order `index` runs **fourth**, so the failure now means `observations.md` and the CSVs were never written. *"A malformed index is not a bad section"* described the old order. §The new write order
- [ ] 10. `validate.mjs`: **`uniqueBy: "citeId"` on `page-claims.claims`** — an array of *claims*, one `citeId` each, and one return is one page. **This is the whole uniqueness guarantee** now the `join` check is gone: page-local is all that is required, and this is the only array where it is load-bearing. Not the citation arrays in `source-preliminary-results` or `claim-index`.

## B. Scripts — `synthesis.mjs`

- [ ] 11. `join`: carry `citeId` and `representative` through. §representative
- [ ] 12. `join`: **re-elect the highest-`pageQuality` survivor** when the verdict filter drops the flagged citation. §representative
- [ ] 13. `join`: read `<source>-preliminary-results.json`, write `<source>-final-results.json`. §Renames
- [ ] 14. `index`: stop copying quote text (`synthesis.mjs:282`). §The fix — citeId
- [ ] 15. `index`: resolve `representativeFrom` — the named source claim → its `representative` citation — set it on the merged claim and clear the rest. **Validate the value is a member of that entry's own `from`.** Default to the highest-`pageQuality` citation's representative when omitted. §representative
- [ ] 16. `index`: **remove `--append`** and every path that reads an existing index. **Two callers, not one** — `raw_report_writer_agent.md:220` (Audit repair) and `:188-189` (a manifest-repair re-run inside Synthesize, already broken). §Audit rework
- [ ] 17. `read_source_claims`: resolve the `Q:` line from each source claim's representative `citeId` → `cachedPage` stem → `<stem>-claims.json`. §Resolving a quote
- [ ] 18. **New `read_claims_for_report`** — plain text, per merged claim: `claimId`, claim, `importance`, `pageQuality`, the representative quote with its `citeId`, every citation's `url` and `status`, `refutedBy`/`refutedReason`. **Omits `cachedPage` and non-representative quotes.** §read_claims_for_report
- [ ] 19. `read_claims_for_report --match <terms…>` — several terms ORed, one call, no fallback. §read_claims_for_report
- [ ] 20. **New `read_observations`** — mirrors `read_source_claims`: `--source` optional, every source the default, plain text, per-source headings. **It reads `<source>-preliminary-results.json`.** §read_observations
- [ ] 20a. **`join` stops copying `observations`** (`synthesis.mjs:176`). Nothing joins an observation — there is no citation to stamp a verdict on — and the copy existed only to reach an agent that read the joined files. Removes 68KB of measured copy, and lets `read_observations` work before `join` has run. §read_observations
- [ ] 21. Docstrings and the usage header for all of the above.
- [ ] 21a. `MANIFEST_PATH` (`synthesis.mjs:211`) → `cache/_returns/source-aggregator-manifest.json`, and every skill-file mention: the layout tree in `phases/index.md` and the salvage path in `resuming.md`. §Renames

## C. Scripts — `factcheck.mjs`

- [ ] 22. `serve`: resolve quotes by `citeId` instead of reading `quote` from `claim_index.json` (`:200`). **Return shape unchanged.** §Resolving a quote
- [ ] 23. Marker parser (`:44-52`): **strip a trailing `*`** and keep the flag. No `:` splitting — the marker carries no `citeId`. §Everything that follows the writer
- [ ] 24. `:80` comment — drop the Jargon-section mention. §Cleanups

## D. Scripts — `config.mjs`

- [ ] 25. **`extract.observationsPerDispatch: 6`** in `CONFIGURATION_DEFAULTS` and `CONFIGURATION_NOTES`. **Nothing in `FAST_REDUCTIONS`.** **Not `perSource`** — item 43a settles that the Extract pass writes up to six and the Enrichment pass adds up to six of its own, so a source can finish with twelve and the old name asserted six. `PerDispatch` is also the idiom already in use (`extract.urlsPerDispatch`, `vet.handlesPerDispatch`). §The cap

## E. Scripts — tests

- [ ] 26. `citeId` minted, required, and carried through join → index → serve.
- [ ] 27. **A claim whose representative is dropped by the verdict filter gets a new one** — the silent case.
- [ ] 28. `representativeFrom` resolved through the `from` array; the omitted-field default; exactly one `representative` survives per merged claim.
- [ ] 29. `read_claims_for_report` output shape, and that it omits `cachedPage` and the non-representative quotes.
- [ ] 30. `--match` with several terms; an empty result is an empty result, not an error.
- [ ] 31. `read_observations` — one source, all sources, a source with none, and that it reads the preliminary results. Plus: `join` no longer emits `observations`.
- [ ] 32. `serve` resolves a quote by `citeId` and returns the unchanged shape.
- [ ] 33. The marker parser on `001`, `claim-001`, `001*` and `claim-001*` — the flag survives both spellings.
- [ ] 34. `index` has no `--append`; the flag is refused.
- [ ] 35. Update every test that asserts the old filenames or the removed `quote` field.
- [ ] 35a. `tests/validate.test.mjs:77, 562, 577` — three `check('raw-report-writer', …)` calls take the new shape name. Item 35 covers filenames and `quote`, not shape keys.

## F. Skill — the Source aggregator

- [ ] 36. **New `brain/subagents/source_aggregator_agent.md`**, from `raw_report_writer_agent.md`. Summary table per `AGENTS.md`. §The Source aggregator
- [ ] 37. It **stops writing `<slug>-raw-report.md`**.
- [ ] 37a. **Sweep every reference to the artifact** — grep `raw-report.md`. The plain textual ones: `sections.md:68`, `plan_phase_a.md:96`, `audit_phase_f.md:53/61/102`, `competitor.md:81`, `general-inquiry.md:75`, `landscape.md:108`. §Deleting the raw report is not only a rename
- [ ] 37b. **`output.md:42` and `:3`** — the summary becomes the record and **has no length limit**; shape is still required. Deleting the escape valve while leaving the brevity rule leaves depth nowhere to go. §Deleting the raw report is not only a rename
- [ ] 37c. **`modes.md:125`** — the Repair row says *"the raw report is rebuilt around it"*, which item 58 makes false.
- [ ] 38. New write order: manifest → `validate.mjs` → `synthesis.mjs index` → **`read_observations`** → `observations.md` → the CSVs. §The new write order
- [ ] 38a. Its ***Runs* row names `synthesis.mjs read_observations`.** Telling the agent to merge and building the verb are two of three parts; without the call this reproduces the exact bug the pass exists to fix. §The new write order
- [ ] 39. Dispatch gains the full scope — research question, angles, all sections, deliverables. §The dispatch gains the full scope
- [ ] 40. **Scope informs merging and selection, never contradiction-settling** — one sentence in §3.
- [ ] 41. It does **not** tag claims by section.
- [ ] 42. It writes `observations.md`: merges the per-source observations **and adds its own cross-source ones**, mixed in and collapsed. Plus the guard: *if it can be read off the claim list, it is not an observation.* §The Source aggregator writes observations.md
- [ ] 42a. **Provenance goes in the sentence** — two of its four observation kinds are claims about which source said what, and the flat set carries no provenance field. §The Source aggregator writes observations.md
- [ ] 43. Its own additions capped at **6**; the merged output uncapped.
- [ ] 43a. Source Analyst Enrichment pass: **it adds up to six of its own and touches nothing already in the file.** Six is the Extract pass's cap, not a total — that pass reads only the new claims files and cannot judge what Extract wrote. The merged output is uncapped anyway. §The cap
- [ ] 44. ***Input data files* differs by dispatch** — Synthesize: the full listing. Repair: `read_claims_for_report --match` plus the CSVs it wrote. §Audit rework
- [ ] 45. Delete `raw_report_writer_agent.md`. **`reporting.md:22``s `[5.1/6] Synthesize · Raw report` is RENAMED to `Synthesize · Source aggregate`, not removed** — the step still writes the manifest, the index, `observations.md` and the CSVs, and deleting the label would leave Synthesize printing only `[5.2/6]` and break the sequence the user reads the run by.
- [ ] 45a. Its heartbeat log becomes `cache/_progress/source-aggregator.log` — the label the stuck-agent check keys on.

## G. Skill — the Final report writer and the copy editor

- [ ] 46. Final report writer *Input data files*: the printed listing · the CSVs · **`observations.md`**. **The raw report and `claim_index.json` both leave.** Without `observations.md` in the list, item 48 asks it to copy a file it was never handed — and that file would have no reader at all. §Everything that follows the writer
- [ ] 47. It marks paragraphs `claimId`, with a trailing **`*`** where it renders that claim's quote. No `citeId` — the writer only ever sees the representative's.
- [ ] 48. It **copies the observation section verbatim** from `observations.md`; it does not rewrite it. §The report section
- [ ] 49. At `[6.2/6]` and `[6.4/6]` it drafts the `--match` terms itself — **every plausible wording in the one call**. §Who drafts the match terms
- [ ] 50. Copy editor **stage 2** reads the printed listing instead of the raw report. **Stage 1 untouched.**
- [ ] 50a. **Reword its stage guard** — *"not to be opened until the flag file is written"* names a file; it becomes a command. The mechanism that keeps stage 1 cold stops applying otherwise. §The copy editor's stage guard
- [ ] 50b. Its ***Logs* row** — `reading the raw report` becomes the listing call. Record that stage 2 now pulls ~296KB on `sonnet`.
- [ ] 50c. **`final_report_reviewer_agent.md:83, 87, 100`** — its gap taxonomy rests on *"the evidence may be in a per-source report and not in the aggregate"*, and that taxonomy feeds `[6.2/6]`'s table. It still reads the draft summary and nothing else; what changes is how a gap is worded. §Deleting the raw report is not only a rename
- [ ] 50d. **Delete §"Record what you did not use"** — the drop list. Its justification names the raw report and the shape has no field for it. §The writer's drop list goes
- [ ] 50f. **New `factcheck.mjs unused_claims`** — claims in `claim_index.json` that no summary marker points at. It already holds both halves (`claimIdsIn`, and the index). Appended to `audit.md` via `runlog.mjs finding` at `[6.7/6]`. Without it the discard record ceases to exist, which reverses why the section was written. §The writer's drop list goes
- [ ] 50e. **`final-report-writer.sectionsWithNoVettedVoice`** — its description states the observation section is excluded, per 65b. §The writer's drop list goes

## H. Skill — the Source Analyst and the Page Analyst

- [ ] 51. `page_analyst_agent/index.md`: mint the `citeId`. §The fix — citeId
- [ ] 52. `source_analyst_agent/index.md`: still reads quotes, **stops writing them**; flags one citation `representative: true` per merged claim, highest `pageQuality`. §representative
- [ ] 53. Its dispatch gains the scope — research question, deliverables, sections, angles. §The Source Analyst receives the scope
- [ ] 54. Rewrite §"four things to look for" around the new observation shape, the cap, and the claim/observation test. Drop `coverage-gap`. §Claim or observation
- [ ] 55. **Claims per source ≤ 2× pages analysed — a ceiling, not a target**, stated as such. §The ceiling
- [ ] 55a. Define **"pages analysed" = distinct `cachedPage` values**, i.e. documents, not pages — `extract.maxPagesPerDocument` is 5, so the word means two things. §The ceiling
- [ ] 55b. The ceiling is applied **in the Extract pass**, and again on the Enrichment append's own documents. **Not once after Enrichment** — no Enrichment Source Analyst runs in `--fast` (`enrich.expertsFollowed: 0`) or for a source that gained no expert material, so the ceiling would not exist in two of the four run kinds. State all four. §The ceiling
- [ ] 56. Its ***`--fast`* row**: observations are *"the same in both modes"*.

## I. Skill — phases, sections and resume

- [ ] 57. `synthesize_phase_e.md` — rewritten around the new order and actors.
- [ ] 58. `audit_phase_f.md` `[6.2/6]` — the three-way table: in the index → the writer redrafts · not in it → **dropped, one `runlog.mjs finding` line, nothing in the report** · a CSV row → the aggregator, CSV work only. §Audit rework
- [ ] 58a. `[6.2/6]` — **state the failure mode.** *"Not in the index"* is one search returning nothing, not a lookup that cannot be wrong. A miss erases a gap the reviewer found; the `audit.md` line names the terms searched, so the drop is reconstructable. §Audit rework
- [ ] 59. `audit_phase_f.md` `[6.4/6]` — match on the unmarked paragraphs' own distinctive words, one call for the batch.
- [ ] 60. `audit_phase_f.md` — close the old repair's three unstated gaps: contradictions re-settled? CSV rewritten or appended? steps 1-3 re-run?
- [ ] 61. `audit_phase_f.md` — the redraft count is unchanged; record why `[6.2/6]` and `[6.4/6]` cannot merge.
- [ ] 62. `sections.md` — the observation section is **the last section and is not in `scope.deliverables`**. **No shared category with the footer**: the footer is not a section, the writer is told not to add it (`final_report_writer_agent.md:166-168`), and it **does** add the observation section. §The report section
- [ ] 63. `sections.md` — the **"LLM free-flow observations"** section: **the last section**, all four commands. Not "second to last" — the footer follows it but is not a section (item 62).
- [ ] 64. `plan_phase_a.md` — must not plan the observation section.
- [ ] 65. **`factcheck.mjs prepare` excludes the observation section by name** — `splitUnits` (`:92-93`) already tracks the heading, so the observation section never reaches `unmarked.md`. `prepare` runs twice in Audit; a prose rule would need the writer to decline twice. §The report section
- [ ] 65d. **`factcheck.mjs` owns the section's name; `sections.md` points at it** — as `runlog.mjs` owns the `finding` categories. Two copies means a reword in `sections.md` that misses the script silently returns the section to `unmarked.md`, where `[6.4/6]` cuts it. §The report section
- [ ] 65a. **`output.md` and `SKILL.md`** — cite-or-drop names its exception: the observation section carries no citations by design. Stating it only as an audit exemption leaves every agent reading `output.md` told two things. §The report section
- [ ] 65b. **`final_report_writer_agent.md:109`** — the vetted-voice check skips the observation section. Otherwise the observation section, which has zero citations by design, opens with *"Nobody behind this section could be vetted"* on **every run**. §The report section
- [ ] 65c. **`final_report_copy_editor_agent.md:77-80`** — its restore-a-link rule skips the observation section. §The report section
- [ ] 66. `extract_phase_b.md:181` — *"the last read of the claims files"* becomes *no agent reads them after Extract; scripts reopen them to resolve quotes.* §Resolving a quote
- [ ] 67. `resuming.md:93` — completion test becomes `claim_index.json` + the CSVs.
- [ ] 67a. `resuming.md` — **a topic whose last run predates V0.1.2 is started over, not resumed.** The per-source renames and the dropped `quote` field already make its files unreadable; say so rather than letting a resume fail obscurely. §Renames
- [ ] 68. `phases/index.md` — layout tree and who-writes-what: `observations.md` in, `<slug>-raw-report.md` out, the renamed per-source files, the new write order.
- [ ] 69. `modes.md` — the `extract` row of the group table gains `observationsPerDispatch`.
- [ ] 70. `README.md` — the file table: `<slug>-raw-report.md` out, `observations.md` in.

## J. Renames across the skill

- [ ] 71. `<source>-raw-report.json` → `<source>-preliminary-results.json`, everywhere.
- [ ] 72. `<source>-joined.json` → `<source>-final-results.json`, everywhere.
- [ ] 73. Raw report writer → **Source aggregator**, everywhere.

## K. Cleanups

- [ ] 74. `landscape.md` §9 — the **Jargon** section removed. §Cleanups
- [ ] 75. **Stop counting the sources.** **No count is given — grep `six` across `skill/**.md` and `subagent_returns.json`** and keep the ones meaning the sources. An earlier draft said "12 places", which was wrong and was itself the mistake the rule forbids. `brain/index.md:87` is the definition and stays; *"six phases"* stays, including in the four `reference/*.md` files. §Cleanups
- [x] 76. `source_analyst_agent/hackernews.md:44` — the dead `num_comments` comparison. **DONE.**

## Verification gates — manual

- [ ] `npm test` passes.
- [ ] `node scripts/build.js && git diff --exit-code plugin/` is clean.
- [ ] One full run: every citation in `claim_index.json` has a `citeId` that resolves to a quote in the page's claims file.
- [ ] **The quote a citation resolves to is present in the page it names** — the defect this pass exists to fix. Sample the merged claims.
- [ ] Exactly one `representative: true` per claim, in both the final-results files and the index.
- [ ] `observations.md` exists, and its content appears in the summary's observation section.
- [ ] The summary's markers carry a trailing `*` where a quote is rendered, and every id resolves.
- [ ] No source's claim count exceeds 2× its pages analysed.
- [ ] **The report still has content.** Two changes push `unsupported` up at once — quotes stop being mis-paired, so the fact check judges against correct evidence for the first time, and broader claims pass only if the whole statement is supported. Compare the fact check's deleted-statement count against the measured run before shipping.
- [ ] One full run: **`players.csv` is complete and no cell text appears in the orchestrator's transcript** — section M's whole point.
- [ ] A run killed mid-profiling, then resumed, fills every row: the merge recovers what returned before the kill.
- [ ] A failed row still reaches the retry-or-ask path it had before.
- [ ] `<slug>-raw-report.md` is not written.

## L. A malformed manifest entry never stops the run

- [ ] 77. `synthesis.mjs buildIndex` — **collect every problem rather than throwing at the first**. A failed entry leaves a stand-in so later positions keep their ids and `refutedByIndex` stays accurate. §A malformed manifest entry never stops the run
- [ ] 78. `PROBLEMS_LISTED = 20` — spell out that many, then "and N more of the same kinds".
- [ ] 79. **10 or fewer malformed on the first run: drop, record, carry on — no repair pass.** More than 10: the Source aggregator spends its one repair attempt on the list.
- [ ] 80. **After the repair re-run, whatever is still malformed is dropped and the run carries on.** Never a second repair, never a stop.
- [ ] 81. `indexAll` returns `dropped` — the count and the problem lines — and writes the index without the stand-ins.
- [ ] 82. **Still fatal**: no manifest file · a manifest with no `claims` array · no final-results files at all. Those mean the step before did not run, and an empty index would look like a run that found nothing.
- [ ] 83. `runlog.mjs` — new `claim-malformed` finding category, beside `claim-unsourced` and `claim-unused`.
- [ ] 84. `source_aggregator_agent.md` — the repair pass covers a malformed-entry list, and `claimIndexError` is no longer reached by one; it stays for the structural failures in 82.
- [ ] 85. `synthesize_phase_e.md` — the orchestrator records the drops with `runlog.mjs finding claim-malformed` and names them in Issues.
- [ ] 86. `reporting.md:97` — name dropped claims among the Issues examples.
- [ ] 87. Tests — several problems reported at once · the cap and the "and N more" line · 10 or fewer never triggers a repair · the stand-in keeps `refutedByIndex` accurate · the three structural failures still throw · `dropped` on the return.


## M. The profiling step leaves the orchestrator's context

**Build order within this section: the script first, then the skill files.** §The profiling step
leaves the orchestrator's context

- [ ] 88. **New `players.mjs profiles --topic <slug>`** — reads every `cache/players/profiles/<player>.json`, validates each, writes its cells into the row already in `players.csv`. Prints rows filled, rows still empty, rows failed. §The fix
- [ ] 88a. **Every column is written verbatim, matched on name — no mapping.** `COLUMN_FROM_FIELD` and `asUrl` were built against the old one-column design and are **deleted**. **`name` is the only column the merge never writes.** §And with two columns
- [ ] 88b. **The header decides the columns.** A returned field with no column in the header is not written and not added — which optional columns a run carries is recorded nowhere but the header. §Three things tell the profiler its columns
- [ ] 88c. **The summary reports fields it did not write**, per player, so agent drift is visible rather than absorbed. §Three things tell the profiler its columns
- [ ] 89. **It discards a malformed file rather than writing it**, naming the player — the second of the two checks, as `handle_vetting.mjs aggregate` does. §The fix
- [ ] 90. **The merge is idempotent** — running it twice fills the same rows and does not duplicate or blank one. Resume runs it before dispatching anything. §Resume gets better
- [ ] 91. `players.mjs` usage header and docstrings for the new verb.
- [ ] 91a. **`experts.mjs` — split the record reader out as `parseCsvRecords`**, header included and no column coerced; `parseCsv` calls it. Its current form narrows every row to `experts.csv`'s own COLUMNS, so it silently returns nothing for `players.csv`. **DONE** — needed to build 88.
- [ ] 91b. `enrich_phase_d.md` — **the orchestrator records `failed`, `malformed` and `orphans` with `runlog.mjs finding`** as it reads the summary. The summary is stdout and nothing else; every other discard in the run is written to `audit.md`. §The summary is read

- [ ] 92. `subagent_returns.json` — `player-profile`'s description becomes **"validated as a file rather than as a return"**, with the two-checks note, matching `handle-vetting`. The fields do not change. §The fix

- [ ] 93. `player_profiler_agent.md` ***Returns to main context*** — **the word `done`, or `fetch_failed` naming the player.** Not the sixteen fields. §The failure path is unchanged
- [ ] 93a. **`player_profiler_agent.md:7, 13` and the `player-profile` shape description** — delete *"`url` came in with the dispatch and does not come back."* It does come back. `player_candidates.json` has no `url` field, so nothing reliably supplies one; **`name` alone arrives with the dispatch.** §`url` is `marketing_domain`
- [ ] 93c. **`player-profile`: rename `marketing_domain` → `url`**, holding the URL rather than the domain. The field was named for the concept only because one column could not say which link it held. §And with two columns
- [ ] 93d. **`player-profile`: new optional `repo_url`**, the code host, returned as a full URL. §They are two facts
- [ ] 93e. **`player_profiler_agent.md` §3** — *"look at the front page before defaulting to 'code host only'"* becomes **find both where both exist**. The Frigate example already carries it: repo on GitHub, site `frigate.video`. Keep "marketing domain" as prose describing the step; it is no longer a field name. §And with two columns
- [ ] 93b. **§"What you return" — the dispatch wins.** A column your dispatch does not name is not returned, whatever the reference file or the shape lists. Two of 21 profilers returned `notable_customers` because `landscape.md` names it and the dispatch did not. §Three things tell the profiler its columns
- [ ] 94. Its ***Writes to disk*** — **`cache/players/profiles/<player>.json`**, not `cache/_returns/player-profiler-<player>.json`. A `_returns/` file for an agent that returns one word is what the Handle Vetter's file already forbids. §The file moves
- [ ] 95. Its ***Runs*** row gains `validate.mjs player-profile` on its own file, one repair and one re-check. §The fix
- [ ] 96. It still returns `fetch_failed` **with no cells** — unchanged, and it now writes no file either, so nothing is merged for that row.

- [ ] 97. `enrich_phase_d.md` §"Fill the cells" → **§"Merge the cells"**: one `players.mjs profiles` call after the last row returns, replacing the write-per-return. §The fix
- [ ] 97a. `enrich_phase_d.md:249` — **the dispatch stops claiming to carry a url.** It carries the name, the topic, the columns and the path to `player_candidates.json`. §`url` is `marketing_domain`
- [ ] 98. Its completion test — the `ls` becomes `cache/players/profiles/`. **The rule is unchanged** — read the count off disk, never keep a tally. §The file moves
- [ ] 99. **Say what does not change**, in one line: concurrency and continuous refill, the `[4.5/6]` marker and its count, the retry-and-ask failure path, and that a bare `UNAVAILABLE` is still never acceptable. §What does not change
- [ ] 100. §"Incremental persistence" — the cells are no longer written as each row returns; the profile files are the durable artifact and the merge is what fills the CSV. §Resume gets better
- [ ] 101. `[4.4/6]`'s selection **stays in the orchestrator's context** — state why, so the next pass does not try to move it too. §Why the selection cannot follow it

- [ ] 102. `phases/index.md` writer table — `players.csv` moves from *the orchestrator* to **`players.mjs profiles`, once, at the end of Enrichment**, carrying the same sentence `experts.csv` has about being built from disk rather than from a context. §The fix
- [ ] 103. `phases/index.md` layout tree — `cache/players/profiles/<player>.json` in; the `_returns/` entry for this agent out.
- [ ] 104. `resuming.md` Enrichment entry — **run the merge first, then dispatch only the rows still empty.** §Resume gets better
- [ ] 105. Grep `player-profiler-` and `_returns/player-profiler` across `skill/` — the progress log keeps its label, the returns file is gone.

- [ ] 104a. **`landscape.md` §2** — `repo_url` joins the **optional** columns, with one line: add it when the topic has open-source players. Required would leave a dead column on a vendor-only topic. §They are two facts
- [ ] 105a. **`general-inquiry.md` and `gtm-teardown.md`** — both reference `players.csv` and neither says what is in it. One sentence each pointing at `landscape.md` §2, as `competitor.md` already does. §Three things tell the profiler its columns
- [ ] 106. The merge fills rows from profile files.
- [ ] 107. A malformed profile file is discarded and named; the row stays empty.
- [ ] 108. A row with no profile file stays empty and is counted.
- [ ] 109. The merge is idempotent.
- [ ] 110. Update anything asserting the old `_returns/` path.
- [ ] 110a. A player with both links fills `url` and `repo_url`; one with only a marketing site leaves `repo_url` empty. **The old mapping test goes** — there is no transform left to prove.
- [ ] 110b. A returned field with no column is not written, and is named in the summary.
- [ ] 110c. `parseCsvRecords` returns the header and coerces no column.

**Settled, not deferred:** `marketing_domain` stops being a field. Two columns remove the ambiguity
that named it, so the field is `url` and there is no transform to keep. See §And with two columns.

## N. What the first full V0.1.2 run found

Measured on `digmore-test/digmore/coding-harness-plugin-evals`. **Section M is not implicated** — the
profile merge did not exist in that run. §What the first full V0.1.2 run found

- [ ] 111. **`page_analyst_agent/index.md` — validate every claims file**, `validate.mjs page-claims`, per document, one repair, one re-check. Its only `validate.mjs` call today is on the receipt batch, which is why 23 files reached disk as a bare JSON array.
- [ ] 112. **State the claims filename exactly** — the page's filename **including its extension**, plus `-claims.json`. *"Two files per document, sharing one name"* let two agents each invent a form.
- [ ] 113. **`synthesis.mjs claimsFileFor` accepts both forms** — full filename first, then stem. Caches on disk carry both.
- [ ] 114. **`factcheck.mjs serve` returns `null`, not `''`, for an unresolved quote.** An empty string reads as a quote that says nothing, and the checker judges the quotes first.
- [ ] 115. **`synthesis.mjs index` resolves every citation after building the index** and reports the count. **No new script** — `quoteResolver` is already in that file, and this surfaces at the write rather than in Audit.
- [ ] 116. **`factcheck.mjs` — strip a leading `<digits>.` before the `UNCHECKED_SECTIONS` compare.** Every heading is `## 10. LLM free-flow observations`, so the guard has never fired.
- [ ] 117. **Rename `factcheck-paragraph` → `factcheck-paragraph-workorder`** — it is the work order `serve` hands out, not a result; 15 dispatches validated returns against it. `claim-fact-checker` stays. Touches `subagent_returns.json`, `factcheck.mjs`, `claim_fact_checker_agent.md`, `audit_phase_f.md`, tests.
- [ ] 118. Tests — a bare-array claims file is refused · both filename forms resolve · an unresolved quote is `null` · `index` reports the unresolved count · a numbered heading is excluded · the renamed shape.

## O. Links and the confidence tag in the summary

Four sections of the measured run carry no links at all — 35 paragraphs whose evidence is in an
invisible HTML comment. §Four sections of the report carry no links

- [ ] 119. **Inline `output.md`'s citation rule into the Final report writer's dispatch**, beside the per-section specs. `synthesize_phase_e.md:119-122` already says why a pointed-at file loses to inlined text. §Why the universal rule lost
- [ ] 120. **`landscape.md` §2 preamble states it once, for every section**, with the render format: the representative's URL, then the next-highest `pageQuality`, then `+N more` for the remainder; omit the suffix where there is none. **A section's own spec adds to this, never replaces it.** §How many URLs a claim renders
- [ ] 121. **Delete the URL clause from `landscape.md` §6 and §8** — §6 keeps "handle + verdict", §8 keeps "kill reason". Two sections restating a universal rule made the other four sections' silence read as permission.
- [ ] 122. **The same preamble line in `competitor.md`, `general-inquiry.md`, `gtm-teardown.md`**, or a pointer to it, so the gap cannot reopen per command.
- [ ] 123. **Spell the confidence tag out — `` `confidence: high` ``**, wherever it renders. `vetting.md` defines it; nothing in the report explains it. §The confidence tag is unexplained jargon
- [ ] 124. **`factcheck.mjs prepare` flags a paragraph carrying a claim marker and no `](http`.** A script check: the reviewer's rule is already right and its agent accepted the marker as a citation anyway. §Why the universal rule lost
- [ ] 125. Tests — the two-link-plus-remainder format · the suffix omitted at one and two citations · a marked paragraph with no link is flagged.

## P. Repairing the existing run

- [ ] 126. **Add the missing links with a script, not a writer pass.** Ids are in the markers, `claim_index.json` holds every URL and `pageQuality`, so the transform is mechanical. An agent rewriting 35 paragraphs re-words some, and a wording change reopens the fact check. §Repairing this run

## Q. The deleted sentences stop passing through the orchestrator

The checker already returns `done` and writes its verdicts to disk; `[6.6/6]` then reads them back to
name the sentences, so they reach the orchestrator anyway — at the end of the run, when its context is
fullest. §The deleted sentences stop passing through the orchestrator

- [ ] 127. **`audit_phase_f.md` `[6.6/6]` — the dispatch carries the path to `cache/audit/`, not the sentences.** The writer opens the `paragraph-factcheck-<nnn>.json` files itself and re-composes each section around the gaps it finds. Same pattern as `factcheck.mjs serve`: the agent fetches its own work.
- [ ] 128. **The orchestrator reads those files for the section names only** — it needs to know which sections the dispatch covers, and nothing else. One field per file, never the `unsupported` text.
- [ ] 129. **`final_report_writer_agent.md`** — its *Input data files* row gains `cache/audit/paragraph-factcheck-<nnn>.json` on the `[6.6/6]` dispatch, and its *Runs* row says it reads them. The row already differs by dispatch, per item 44's precedent.
- [ ] 130. **Nothing else changes**: the writer re-composes rather than cuts, one writer still owns the summary, and this redraft is still not copy edited.
- [ ] 131. Tests — the orchestrator's read returns section names and no sentence text.

## R. A vetting cache is one document

11 of 932 citations in `plugin-skill-eval-tooling` resolve to nothing, all into one vetting cache: the
Page Analyst split it per comment and pointed `cachedPage` at the container. §A vetting cache is one
document

- [ ] 132. **`page_analyst_agent/index.md` §Enrichment mode — say what a document is here.** The vetting cache is **one document**: one claims file, `<source>-vet-<handle>-claims.json`, beside it, and `cachedPage` is the cache. Never one file per comment. §The rule
- [ ] 133. **State why**, in one line: `cachedPage` has to name a file that exists and whose stem yields the claims file, and there is no per-comment page to name. Every quote lookup in the run rests on that.
- [ ] 134. **Say what is not lost** — the per-comment permalink is already each citation's `url`, so only the grouping changes.
- [ ] 135. **All three vetting caches, not just Reddit** — `hackernews-vet-<name>.json` and `twitter-vet-<handle>.json` follow the same rule.
- [ ] 136. Tests — a claims file written beside a vetting cache resolves; a per-comment name does not silently pass.
