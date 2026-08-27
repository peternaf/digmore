# Resuming a run

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

## Then, inside that phase

- **Plan failure** → an empty or absent `scope` in `research_plan.json`, so nothing was fetched.
  Resume re-plans from scratch; it costs one sub-agent.
- **Extract failure** → `research_plan.json` holds the branch list; the cache holds whatever was
  fetched. Resume compares the two and runs only the branches with nothing on disk. It does not
  re-scope: new angles would not match the cache the half-finished run built.
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
- **Synthesize failure** → the six per-source reports are settled and nothing in this phase touches
  them. **Either `<topic-slug>-raw-report.md` or `claim_index.json` missing means the pass did not
  finish**, so resume rebuilds from those reports — cheap, because the expensive reading happened in
  the phase before.
- **Audit failure** → re-enter at the sub-step the log names, not at the top of the phase. It holds
  up to six dispatch groups and rewrites the deliverable three times, so re-running it whole is no
  longer cheap. The fact check resumes per paragraph: it writes
  `cache/_returns/claim-fact-checker-<n>.json` as each one returns, a resumed run re-reads the same
  summary so the numbering is identical, and only the paragraphs with no return file are
  re-dispatched. Nothing needs undoing: `audit.md` is appended a line at a time as findings happen, so a re-entered sub-step adds to it rather than rewriting it, and a finding recorded twice is a duplicate line rather than a lost one.

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
