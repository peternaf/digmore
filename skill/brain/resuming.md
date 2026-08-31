# Resuming a run

**A topic whose last run predates V0.1.2 is started over, not resumed.** Its per-source files carry
the old names, and the quotes it stored have no home in the current shapes — so a resume finds nothing
it can use and would fail obscurely part-way. Say so and start the topic again.

**Read this only when a run is not starting from nothing** — a retry, a re-run of a topic that
already has a directory, or a phase that errored and left the run standing. A clean first run never
opens it.

That is why it is its own file. It sits in `phases/index.md`'s place in every other respect, and it
was in that file until the file was carrying six unrelated jobs and this was a fifth of it, read at
the start of every run and used by almost none of them.

## Where the run stopped

If a phase errors, runs out of context, or the process is killed, the run still produces the
artifacts available at that point.

**Read `run_log.log` first, then the disk.** The log gives you the phase; the disk gives you what is
outstanding inside it.

| Last line for a phase | What you do |
|---|---|
| `done` | re-enter the **next** phase, without opening the completed one's artifacts |
| `start` with no `done` after it | re-enter **that** phase and run its salvage path below |

The saving is the five phases you no longer scan, not the one you still do: a run killed during
Extract · Read wrote `start` and nothing else, which names the phase and says nothing about which of
188 URLs were read.

Three rules keep it honest:

- **No log, unreadable, or a topic predating it → full scan.** An absent log is no information,
  never evidence that nothing ran.
- **Where the log and the disk disagree, the disk wins.** These lines are written as the run goes, so
  one can be missing because the process died between the work and the write. A file that exists
  exists.
- **Record the resume decision as its own line** — `runlog.mjs note` — naming the phase re-entered
  and whether it came from a `done` or an unfinished `start`. Otherwise a skipped four-second Extract
  and a broken one look identical.

## Which configurations a resumed run uses

**The interrupted run's own, from its `run_history` entry — not today's.** A resume finishes a run
rather than starting one, and the cache on disk was built to the numbers that applied when it
started. A branch that fetched 14 pages under a cap of 20 is mid-budget; read against a cap of 10 it
reads as a branch already over, and every tally that mixes the two means nothing. `plan_phase_a.md`
§`run_history` stores them for exactly this — *"the numbers that applied are otherwise gone the
moment the plan is rewritten."*

**A re-run is the opposite and takes today's**, because it starts a run of its own. So does a topic
whose history predates the field, where there is nothing recorded to honour.

**A resume appends no `run_history` entry.** It is finishing the run that entry already describes.
Appending one would put today's configurations at the end of the history, which is the record every
reader here takes as the run's own — and the fallback would then be indistinguishable from the
answer. Only a re-planned run appends, because only that one is a new run.

`extract_resume.mjs` applies this itself and says which source its cap came from. Everywhere else it
is yours to apply, and the entry is in `research_plan.json` where you already are.

## Then, inside that phase

- **Plan failure** → an empty or absent `scope` in `research_plan.json`, so nothing was fetched.
  Resume re-plans from scratch; it costs one sub-agent.
- **Extract failure** → **run `extract_resume.mjs worklist --topic <slug>` and dispatch what it hands
  back.** It reads every `branch-searcher-*` list and every `page-analyst-*` receipt in
  `cache/_returns/` and answers per branch: pages already fetched, URLs already read, what is left,
  and which of three states the branch is in — `outstanding` has budget and URLs both, and is the
  only one that is work; `capped` spent its budget; `exhausted` read everything its searcher found.
  Batch the `remaining` of each outstanding branch as an unbroken run would
  (`phases/extract_phase_b.md` §Read). It does not re-scope: new angles would not match the cache the
  half-finished run built.

  **A branch is not finished or unstarted, which is why this is a script.** It carries a page tally
  against `extract.fetchesPerBranch` and a set of URLs with receipts, and both are sums across every
  receipt on disk — arithmetic over files you must not pull into your context to do. Two sessions
  each wrote their own throwaway version of it into `cache/_misc/`, each with its own hardcoded cap;
  the second was wrong the moment the configured number changed. **Never write your own.**
- **Vet failure** → **re-run `handle_vetting.mjs prepare` for each source and dispatch what it hands
  back.** It excludes three kinds of handle by itself: the ones already carrying a verdict, the ones
  auto-promoted from `experts.csv`, and the ones that already have a file in
  `cache/<source>/handles/`. That third exclusion is what makes a resume cheap — **the file existing
  is the record that the handle was vetted**, written the moment each one finished rather than when
  its batch did, so a run killed at handle four of five keeps the three before it.

  Do not re-dispatch a vetted handle on the theory that the script's cache makes the repeat cheap.
  That holds on Reddit, Hacker News and Twitter, where the source script returns a cached verdict
  without a request, and not on forums, where there is no script and the whole judgement is redone.

  Then aggregate and build `experts.csv` as an unbroken run would (`phases/vet_phase_c.md`).
- **Enrichment failure** → `player_candidates.json` records who qualified and `players.csv` the rows
  already chosen. Resume reads both, dispatches only the rows whose fetched cells are still empty,
  and does not re-choose: the selection is a decision this run already made and recorded.
- **Synthesize failure** → the per-source reports are settled and nothing in this phase touches
  them. **Either `claim_index.json` or a declared section CSV missing means the pass did not
  finish**, so resume rebuilds from those reports — cheap, because the expensive reading happened in
  the phase before. A manifest on disk with no index beside it is the same state: re-running
  `synthesis.mjs index` is seconds, but the pass that produced the manifest is what has to be trusted,
  so re-dispatch the writer rather than expanding a manifest whose own dispatch never finished.
- **Audit failure** → re-enter at the sub-step the log names, not at the top of the phase. It holds
  up to six dispatch groups and rewrites the deliverable three times, so re-running it whole is no
  longer cheap. The fact check resumes per paragraph rather than per dispatch: each agent writes
  `cache/audit/paragraph-factcheck-<nnn>.json` the moment that paragraph is finished, a resumed run re-runs
  `factcheck.mjs prepare` on the same summary and gets the same numbering, and only the numbers with
  no file are dispatched again. Nothing needs undoing: `audit.md` is appended a line at a time as findings happen, so a re-entered sub-step adds to it rather than rewriting it, and a finding recorded twice is a duplicate line rather than a lost one.

## When the cache is gone

A cleared `cache/` leaves the topic root intact — `research_plan.json`, the summary,
`claim_index.json`, the CSVs — so a run reaches a phase, finds nothing to work from, and still looks
complete.

**Stop at the first phase that finds it missing, say so, and offer to restart the research from
scratch.** Manual mode offers the restart and waits; `--auto` stops, says why, and records it in
Issues. It applies wherever the cache is read after Extract: Enrichment's expert step, the Source
Analyst's Enrichment pass, and the fact check.

**Never reported as a source that came back empty.** Nothing was queried and nothing failed — the
material was fetched and later removed, which is a different sentence and a different fix.

## When the harness runs out of web searches

Claude Code caps web searches per session. If the run exhausts that quota mid-way, tell the user to
start a new session and re-run the same command: the cache and partial outputs are the state, so
resume picks up where the run stopped rather than starting over. The README explains how to raise the
ceiling; the plugin never edits the user's settings to do it for them.
