# Phases — overview

All six phases run in one command invocation, sequentially. Phase boundaries are resumable from on-disk artifacts.

**Each phase file's "End of …" section is a completion test, not a handoff.** Pass it and start the next phase's first step, in the same turn. **The same holds between the sub-steps inside a phase**, which is where a run is most likely to stop: Enrichment's five and Audit's eight each finish on a decision worth reporting, and reporting it is what ends the turn. Plan's agreement gate is the only stop between the command and the four end-of-run sections — `../modes.md` §Manual mode owns that rule.

**No phase is optional, and that includes Audit.** A topic is not complete until `audit.md` exists for this run and every claim the summary renders has been checked against the text the run stored (`audit_phase_f.md`). No deferral, no skip, whichever command is running — the audit is what separates a digmore report from a page of confident prose.

Each step announces itself with one line — `[3/6] Vet` — so the user can see how far along the run is. Format and rules in `../reporting.md`.

Re-read `../output.md` before any sub-agent dispatch or before writing any user-facing text. The writing-style rules apply *at output time*, not only in final deliverables.

## Phase files

- `plan_phase_a.md` — **Plan**: the topic, its angles, the branches they make with each available source, written to `research_plan.json`.
- `extract_phase_b.md` — **Extract**: one searcher per branch, one reader per batch of URLs, then one report per source.
- `vet_phase_c.md` — **Vet**: the handles Extract surfaced, ranked and capped, one Handle Vetter each.
- `enrich_phase_d.md` — **Enrichment**: who the research is about — the expert step, the player candidates, the selection, and one profiler per row.
- `synthesize_phase_e.md` — **Synthesize**: evidence becomes documents. The Raw report writer builds the enumerable sections and the aggregate raw report; the Final report writer drafts the summary from them.
- `audit_phase_f.md` — **Audit**: the report is checked and fixed — reviewed, repaired, copy edited, fact checked against the cache, and recorded.

Plan and Extract are separate because they differ in kind and in scale — Plan is one orchestrator pass plus a single sub-agent producing a plan, Extract is hundreds doing bulk work — and because the boundary between them is where a resumed run picks up: `research_plan.json` is the only record of which branches this topic is meant to have.

## Where a run writes (cross-phase)

Every file written *during* a run lives under `digmore/<topic-slug>/`, resolved against the directory the user is working in. Nothing a run produces lands outside that subtree, and nothing is ever written inside the installed plugin.

```
digmore/<topic-slug>/
  <topic-slug>-executive-summary.md   # the user-facing summary
  <topic-slug>-raw-report.md     # the aggregate evidence record, unsummarised
  claim_index.json               # the same claims, structured, one entry per claimId
  research_plan.json             # the topic: identity, run history, and this run's plan
  run_log.md                     # where the run spent its time, appended across runs
  experts.csv                    # curated experts (legit verdict only)
  players.csv                    # competitor / subject matrix
  player_candidates.json         # who qualified as a player, and their claim references
  <section-name>.csv             # one per invented enumerable section — ../sections.md
  audit.md                       # the run's own record, across all six phases
  full_source_analysis/<source>-raw-report.json # one source's claims and observations
  full_source_analysis/<source>-joined.json     # the same, with a verdict on every citation
  full_source_analysis/<source>-handles.json    # every handle that source produced, ranked
  full_source_analysis/<source>-players.json    # every entity that source named, and who said what
  cache/<source>/<file>          # the stored pages and their claims, per source
  cache/players/<file>           # pages the Player Profiler fetched, kept out of the source piles
  cache/_progress/<label>.log    # one heartbeat line per sub-agent step
  cache/_returns/<label>.json    # what a sub-agent handed back, before it was checked
  cache/_misc/<file>             # scratch that belongs to no source
```

Everywhere these files refer to "the summary", they mean `<topic-slug>-executive-summary.md`. The slug is in the name so it stays findable once it has been moved or shared out of its folder, and so the summary and the raw report read as the pair they are in a folder listing.

**Every pass that writes the summary writes a temp file and renames it over the original.** `<topic-slug>-executive-summary.md.tmp`, renamed when the pass finishes. Three passes rewrite that file in Audit, and a run killed mid-write would otherwise leave a half-written document that looks finished and that resume reads as complete. The file on disk is then always a whole version, the old one or the new one, never half of either; a `.tmp` left behind is a pass that died, and the summary beside it is the last complete version. The same rule covers the Run footer, which is the last write of all.

**One writer per file, and no file has a lock.** Where sub-agents fan out they hand back and the orchestrator writes — a file written by a fan-out loses rows silently, with no error and no trace, and the fix for that is to remove the fan-out rather than to add a lock.

| File | Written by |
|---|---|
| `research_plan.json` | the orchestrator — identity at Plan, `scope` when the plan is settled, a `run_history` entry at the end of the run |
| `run_log.md` | the orchestrator, through `scripts/runlog.mjs`, two lines per step as they happen. Appended across runs, never replaced |
| `experts.csv` | the orchestrator, in Vet, through `experts.mjs` |
| `player_candidates.json` | `players.mjs candidates`, once, in Enrichment |
| `players.csv` | the orchestrator, in Enrichment — the rows before profiling, the returned cells after. Everyone else only reads it |
| `<topic-slug>-raw-report.md`, `claim_index.json`, `promoter_network.csv`, any `<section-name>.csv` | the Raw report writer, in Synthesize, and again if the reviewer finds a closable gap |
| the summary | the Final report writer in Synthesize, then the copy editor and two redrafts in Audit — one at a time, each renaming a complete file over the last |
| `audit.md` | the orchestrator, in Audit |
| `full_source_analysis/<source>-raw-report.json`, `<source>-players.json` | one Source Analyst per source, each to its own files, created in Extract and appended once in Enrichment |
| `full_source_analysis/<source>-joined.json` | `synthesis.mjs join`, once, at the start of Synthesize |
| `full_source_analysis/<source>-handles.json` | three writers at three different times, never at once: the Source Analyst creates it in Extract, the orchestrator adds the verdicts in batches during Vet, and the Source Analyst appends handles first seen in expert material during Enrichment |
| `cache/**` | whichever sub-agent fetched or produced it, each to its own filename |

**Any temp file a run generates goes under `cache/<source>/`, or `cache/_misc/` if it belongs to no source, and its name begins with the label of whoever wrote it.** Intermediate JSON dumps, scratch markdown, sub-agent partial outputs, debug traces — all inside the topic's cache subtree. Nothing the run produces, even briefly, lands outside `digmore/<topic-slug>/`. The summary's `.tmp` is the one exception, and it sits beside the file it replaces because that is what makes the rename atomic.

**The label is not decoration — naming only the directory is what caused this.** Agents run concurrently, identical prompts invent identical names, and two agents that both reach for `observations.md` write one file where the second silently overwrites the first. It has happened twice, on Page Analysts and on Source Analysts, and it is invisible both times: a scratch file has no reader to complain, so what surfaces is one source's material appearing inside another source's report. `<label>-<what>.md`, the same label its `_returns/` and `_progress/` files carry. One writer per file is the rule above, and a shared scratch file breaks it as surely as a shared output would.

**Sub-agents are told this in their dispatch, not here.** They are sent their own files and nothing else, so a rule that lives only in this file reaches the orchestrator and no one else — which is why every agent that wrote scratch was inventing the path and the name unguided. The wording they get is in `../subagents/dispatch_structured_subagent.md` §"Every dispatch carries this".

`_misc` is only for what belongs to no source. **Anything a source produced goes under that source**, at the filename that source's own file gives it. That is where resume looks for it, so a vetting verdict parked in `_misc` is a verdict the next run will pay to fetch again.

## The bulk material never enters your context (cross-phase)

**Claims and source reports live on disk. You hold neither.** Whatever step needs them opens the files itself.

Your context has to survive all six phases; a sub-agent's dies when it returns. So the material that is large and read once — several hundred claim sets, six per-source reports — goes to a file, and the agent that needs it is given the path. What comes back to you is small: a receipt saying what happened and where the file is.

| What | Written by | Read by |
|---|---|---|
| `cache/<source>/<name>-claims.json` | each Page Analyst, one per document | the Source Analyst, which reads every one its source produced; the Player Profiler, which follows the references `player_candidates.json` gives it. Nothing after Extract opens the directory |
| `full_source_analysis/<source>-raw-report.json` | each Source Analyst | `synthesis.mjs join`, which stamps a verdict on every citation and writes the joined copy beside it |
| `full_source_analysis/<source>-joined.json` | `synthesis.mjs join` | the Raw report writer, which is the only actor that ever holds all six |
| `full_source_analysis/<source>-handles.json` | the Source Analyst, then the orchestrator, then the Source Analyst again | Vet, to know who to vet and in what order; the Raw report writer on `gtm`, for the promoter network's identity join; every later run, as the record of who was rejected and why |
| `full_source_analysis/<source>-players.json` | each Source Analyst | `players.mjs candidates` alone. Nobody reads the six files directly — the script merges them, joins the verdicts and hands back candidates |
| `claim_index.json` | the Raw report writer | a script, to assemble the fact check's dispatches. Never a sub-agent, and never you, whole |

What you keep across the run: the receipts, the plan, the verdicts, and the run's own record. Never the bodies.

**So a step that needs the material says which files, not what is in them.** A dispatch that pastes several hundred claims into a prompt has moved the problem rather than solved it — and it can only paste what you are holding, which is the thing this rule exists to prevent.

## What a sub-agent is (cross-phase)

**One verb, one item, inline, with the tools it already has — then it returns what it found.** That is the whole shape. Fan-out, waiting and deciding belong to the orchestrator.

When what comes back has a shape in `../../scripts/subagent_returns.json`, the prompt that carries it — the whole thing, ready to send — is in `../subagents/dispatch_structured_subagent.md`. Read that before dispatching one. A sub-agent that returns no shape, writing prose to its own file or editing the draft in place, takes its instructions from the phase file dispatching it.

Why the shape is this tight:

- **Inline, because the tools are the job.** digmore is a plugin, and its own files live in an install directory replaced on every update — anything a sub-agent writes there is invisible to the user and gone on the next upgrade. A run uses what it has and records what it could not reach.
- **One item, because a batch invites a fan-out.** "Fetch these 12 URLs and extract from all 12" is a compound job over independent items, and it reads as an invitation to parallelise.

  **Two agents carve out of this, and both pay for it in words.** The Page Analyst takes a batch of URLs and the Handle Vetter a batch of handles, because those two are dispatched hundreds of times in one run and the harness scaffolding around a dispatch costs the same whatever the agent returns — which made the dispatch count itself the largest remaining draw on your context. Their dispatches carry an explicit sequential instruction in place of the protection the one-item shape gave for free: `extract_phase_b.md` §"The batch is sequential" and `vet_phase_c.md` §Flow. **A batch is one kind of work over several items of it, never a compound job**; anything else still goes one item at a time.
- **Nothing to wait on, because there is nothing to wait with.** A sub-agent receives no completion notification for anything it starts, so whatever it starts it waits on forever.

A missing capability is a finding, not a task. Note the gap in `audit.md` as a known-gap and say so in the run's closing message. The user decides what to do about it.

### Heartbeat — how a sub-agent stays visible

A sub-agent's findings arrive only when it finishes, so the heartbeat is what makes it readable while it runs. Every dispatch asks for a line before each step, appended to `digmore/<slug>/cache/_progress/<your-label>.log` — every dispatch, whatever comes back, because an agent that returns prose or edits a file in place needs it just as much.

The line goes in on the way into each step, naming what that step is waiting on: `fetching <url>`, or `HN 429, backing off 45s (attempt 2 of 3)`. The agent says only what the step is; **`runlog.mjs beat` stamps each line with the time**, because an agent has no clock and a composed stamp is wrong silently.

**Two clocks, two questions.** The file's modification time says how long an agent has been quiet, which is what the check below triggers on. The stamps inside say when each step began, which is the only way to see afterwards which step spent the time — a profiler that took eleven minutes over six steps is a different problem depending on which one took nine of them, and mtime cannot tell them apart.

Caveat: on the way into the step, never on a schedule. Reporting every N seconds means sleeping in a loop.

### When a sub-agent goes quiet

Every sub-agent notifies on completion, so the signal is a notification that never arrives. Do not poll on a timer.

1. **Read every heartbeat at once**, not one agent at a time:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/runlog.mjs" beats --topic <slug>
   ```

   One entry per dispatch — what it last said, how many steps it has taken, and how many
   seconds since it moved — **stalest first**, which is the order this check reads in. The two
   halves live in different places, the line in the file and the elapsed time in its
   modification time, and this is what puts them together.
2. **Two minutes without that mtime moving is the trigger — not two minutes since dispatch.** Time since dispatch says nothing: an agent twenty minutes into a long branch whose heartbeat moved ten seconds ago is working, and one that fell over thirty seconds in is not. Two minutes is the default because the open web is the slow case — the sources with their own scripts all answer in about a second. **A source whose every call is fast sets a tighter threshold in its own `subagents/<agent>/<source>.md`**; where one does, that value wins for its sub-agents and this one applies to the rest.
3. **Decide from the line, not the clock alone.** The trigger is when to look, never a reason on its own to act. A fetch in flight or a documented backoff is work — a request that times out and retries its way through the 5s + 15s + 45s schedule can hold one line for three minutes and be perfectly healthy, and that is the open web, not Reddit, Hacker News or Twitter. Leave it. A line that has not changed while its subject should have completed, or a heartbeat that stopped mid-step, is stuck.
4. **Confirm liveness** with `TaskOutput(task_id, block: false)`, which returns `running` / `success` / `killed` and nothing else. It reports that an agent is alive, never that it is progressing — the heartbeat is the only progress signal there is.
5. **Stop it** with `TaskStop(task_id)` if it is still `running` and its heartbeat has not moved for 10 minutes. Same instrument as above, a longer patience — a live agent is never killed for being slow, only for having stopped. Record the dropped item in `audit.md` under "dropped-for-budget" with the reason, and carry on.

**Killing a working agent is an acceptable cost**, because the alternative is detecting stuckness from a signal that does not exist. What a wrong kill costs depends on the agent:

- **Most agents hold one item**, so a wrong kill loses that one.
- **The Page Analyst and the Handle Vetter hold a batch** — up to `extract.urlsPerDispatch` URLs, or `vet.handlesPerDispatch` handles. A wrong kill loses the item in flight and the ones not yet reached, never the ones behind it: both agents finish each item completely, writing it to disk, before starting the next.

**Whatever is lost is recorded item by item**, in `audit.md` under "dropped-for-budget" — by URL or by handle, never as one line naming the dispatch. A batch recorded as a batch is a report that cannot say which pages the run never read. **The heartbeat is what makes that possible**: both agents log a line naming which item of the batch they are starting, and it is the only record of how far the agent got.

## Salvage paths on phase failure (cross-phase)

If a phase errors, runs out of context, or the process is killed, the run still produces the artifacts available at that point.

**Read `run_log.md` first, then the disk.** The log gives you the phase; the disk gives you what is outstanding inside it.

| Last line for a phase | What you do |
|---|---|
| `done` | re-enter the **next** phase, without opening the completed one's artifacts |
| `start` with no `done` after it | re-enter **that** phase and run its salvage path below |

The saving is the five phases you no longer scan, not the one you still do: a run killed during Extract · Read wrote `start` and nothing else, which names the phase and says nothing about which of 188 URLs were read.

Three rules keep it honest:

- **No log, unreadable, or a topic predating it → full scan.** An absent log is no information, never evidence that nothing ran.
- **Where the log and the disk disagree, the disk wins.** These lines are written as the run goes, so one can be missing because the process died between the work and the write. A file that exists exists.
- **Record the resume decision as its own line** — `runlog.mjs note` — naming the phase re-entered and whether it came from a `done` or an unfinished `start`. Otherwise a skipped four-second Extract and a broken one look identical.

Then, inside that phase:

- **Plan failure** → an empty or absent `scope` in `research_plan.json`, so nothing was fetched. Resume re-plans from scratch; it costs one sub-agent.
- **Extract failure** → `research_plan.json` holds the branch list; the cache holds whatever was fetched. Resume compares the two and runs only the branches with nothing on disk. It does not re-scope: new angles would not match the cache the half-finished run built.
- **Vet failure** → skip any handle whose `<source>-handles.json` row already carries a `verdict`, and dispatch the rest. Do not re-dispatch and rely on the script's cache to make the repeat cheap: that works on Reddit, Hacker News and Twitter, where the script returns the cached verdict without a request, and not on forums, where there is no script and the whole judgement is redone.
- **Enrichment failure** → `player_candidates.json` records who qualified and `players.csv` the rows already chosen. Resume reads both, dispatches only the rows whose fetched cells are still empty, and does not re-choose: the selection is a decision this run already made and recorded.
- **Synthesize failure** → the six per-source reports are settled and nothing in this phase touches them. **Either `<topic-slug>-raw-report.md` or `claim_index.json` missing means the pass did not finish**, so resume rebuilds from those reports — cheap, because the expensive reading happened in the phase before.
- **Audit failure** → re-enter at the sub-step the log names, not at the top of the phase. It holds up to six dispatch groups and rewrites the deliverable three times, so re-running it whole is no longer cheap. The fact check resumes per paragraph: it writes `cache/_returns/claim-fact-checker-<n>.json` as each one returns, a resumed run re-reads the same summary so the numbering is identical, and only the paragraphs with no return file are re-dispatched. Nothing needs undoing — `audit.md` is replaced whole rather than appended.

## When the cache is gone

A cleared `cache/` leaves the topic root intact — `research_plan.json`, the summary, `claim_index.json`, the CSVs — so a run reaches a phase, finds nothing to work from, and still looks complete.

**Stop at the first phase that finds it missing, say so, and offer to restart the research from scratch.** Manual mode offers the restart and waits; `--auto` stops, says why, and records it in Issues. It applies wherever the cache is read after Extract: Enrichment's expert step, the Source Analyst's Enrichment pass, and the fact check.

**Never reported as a source that came back empty.** Nothing was queried and nothing failed — the material was fetched and later removed, which is a different sentence and a different fix.

## When the harness runs out of web searches

Claude Code caps web searches per session. If the run exhausts that quota mid-way, tell the user to start a new session and re-run the same command: the cache and partial outputs are the state, so resume picks up where the run stopped rather than starting over. The README explains how to raise the ceiling; the plugin never edits the user's settings to do it for them.
