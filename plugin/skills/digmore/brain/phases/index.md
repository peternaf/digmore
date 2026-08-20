# Phases — overview

All five phases run in one command invocation, sequentially. Phase boundaries are resumable from on-disk artifacts.

**No phase is optional, and that includes Audit.** A topic is not complete until `audit.md` exists for this run with verdicts on the top-ranked claims (`audit_phase_e.md`). No deferral, no skip, whichever command is running — the audit is what separates a digmore report from a page of confident prose.

Each step announces itself with one line — `[3/5] Vet` — so the user can see how far along the run is. Format and rules in `../reporting.md`.

Re-read `../output.md` before any sub-agent dispatch or before writing any user-facing text. The writing-style rules apply *at output time*, not only in final deliverables.

## Phase files

- `plan_phase_a.md` — **Plan**: the topic, its angles, the branches they make with each available source, written to `research_plan.json`.
- `extract_phase_b.md` — **Extract**: one searcher per branch, one reader per URL, then per-source notes.
- `vet_phase_c.md` — **Vet**: the handles Extract surfaced, ranked and capped.
- `synthesize_phase_d.md` — **Synthesize**: expert-guided filter, expansion, synthesis. Critic pass at the end.
- `audit_phase_e.md` — **Audit**: deep verification of the top-ranked claims + per-claim verdict log.

Plan and Extract are separate because they differ in kind and in scale — Plan is one orchestrator pass plus a single sub-agent producing a plan, Extract is hundreds doing bulk work — and because the boundary between them is where a resumed run picks up: `research_plan.json` is the only record of which branches this topic is meant to have.

## Where a run writes (cross-phase)

Every file written *during* a run lives under `digmore/<topic-slug>/`, resolved against the directory the user is working in. Nothing a run produces lands outside that subtree, and nothing is ever written inside the installed plugin.

```
digmore/<topic-slug>/
  <topic-slug>-executive-summary.md   # the user-facing summary
  research_plan.json             # the topic: identity, run history, and this run's plan
  experts.csv                    # curated experts (legit verdict only)
  raw_research_outcomes.md       # LLM-facing structured claims index
  players.csv                    # competitor / subject matrix
  <section-name>.csv             # one per invented enumerable section — ../sections.md
  audit.md                       # Audit verdict log
  source_notes/<source>.md       # free-flow notes per source
  cache/<source>/<file>          # raw fetched content, per-source
  cache/_progress/<label>.log    # one heartbeat line per sub-agent step
  cache/_returns/<label>.json    # what a sub-agent handed back, before it was checked
  cache/_misc/<file>             # scratch that belongs to no source
```

Everywhere these files refer to "the summary", they mean `<topic-slug>-executive-summary.md`. The slug is in the name so it stays findable once it has been moved or shared out of its folder.

**One writer per file.** Nothing here is written by two things at once, and that is what keeps it safe: only `experts.csv` has a lock, because only Vet fans out writers to a shared file.

| File | Written by |
|---|---|
| `research_plan.json` | the orchestrator — identity at Plan, `scope` when the plan is settled, a `run_history` entry at the end of the run |
| `experts.csv` | Vet, through `experts.mjs` — the one locked writer |
| `players.csv`, `promoter_network.csv`, any `<section-name>.csv`, `raw_research_outcomes.md`, the summary | Synthesize's single synthesizer |
| `audit.md` | the orchestrator, in Audit |
| `source_notes/<source>.md` | one sub-agent per source, each to its own file |
| `cache/**` | whichever sub-agent fetched or produced it, each to its own filename |

**Any temp file a run generates goes under `cache/<source>/`, or `cache/_misc/` if it belongs to no source.** Intermediate JSON dumps, scratch markdown, sub-agent partial outputs, debug traces — all inside the topic's cache subtree. Nothing the run produces, even briefly, lands outside `digmore/<topic-slug>/`.

`_misc` is only for what belongs to no source. **Anything a source produced goes under that source**, at the filename that source's own file gives it. That is where resume looks for it, so a vetting verdict parked in `_misc` is a verdict the next run will pay to fetch again.

## What a sub-agent is (cross-phase)

**One verb, one item, inline, with the tools it already has — then it returns what it found.** That is the whole shape. Fan-out, waiting and deciding belong to the orchestrator.

When what comes back has a shape in `../../scripts/subagent_returns.json`, the prompt that carries it — the whole thing, ready to send — is in `../subagents/dispatch_structured_subagent.md`. Read that before dispatching one. A sub-agent that returns no shape, writing prose to its own file or editing the draft in place, takes its instructions from the phase file dispatching it.

Why the shape is this tight:

- **Inline, because the tools are the job.** digmore is a plugin, and its own files live in an install directory replaced on every update — anything a sub-agent writes there is invisible to the user and gone on the next upgrade. A run uses what it has and records what it could not reach.
- **One item, because a batch invites a fan-out.** "Fetch these 12 URLs and extract from all 12" is a compound job over independent items, and it reads as an invitation to parallelise.
- **Nothing to wait on, because there is nothing to wait with.** A sub-agent receives no completion notification for anything it starts, so whatever it starts it waits on forever.

A missing capability is a finding, not a task. Note the gap in `audit.md` as a known-gap and say so in the run's closing message. The user decides what to do about it.

### Heartbeat — how a sub-agent stays visible

A sub-agent's findings arrive only when it finishes, so the heartbeat is what makes it readable while it runs. That is why the prompt in `../subagents/dispatch_structured_subagent.md` asks for a line before each step, appended to `digmore/<slug>/cache/_progress/<your-label>.log`.

The line goes in on the way into each step, naming what that step is waiting on: `fetching <url>`, or `HN 429, backing off 45s (attempt 2 of 3)`. That makes the line diagnostic on its own — the orchestrator reads elapsed time off the file's modification time, so the line only has to say what, never how long.

Caveat: on the way into the step, never on a schedule. Reporting every N seconds means sleeping in a loop.

### When a sub-agent goes quiet

Every sub-agent notifies on completion, so the signal is a notification that never arrives. Do not poll on a timer.

1. **Wait 5 minutes** from dispatch with no notification before suspecting anything. The longest honest silence is one request chain: `hackernews.mjs` throttles HN to one request per 15s and backs off 5s + 15s + 45s on top of a 30s timeout, so roughly two minutes. Five is the margin.
2. **Read every heartbeat at once**, not one agent at a time:
   `tail -n 1 digmore/<slug>/cache/_progress/*.log`
   The last line says what each agent is waiting on; the file's mtime says for how long.
3. **Decide from the line, not the clock alone.** A fetch or a documented backoff is work — leave it. A line that has not changed while its subject should have completed, or a heartbeat that stopped mid-step, is stuck.
4. **Confirm liveness** with `TaskOutput(task_id, block: false)`, which returns `running` / `success` / `killed` and nothing else. It reports that an agent is alive, never that it is progressing — the heartbeat is the only progress signal there is.
5. **Stop it** with `TaskStop(task_id)` if it is still `running` at 10 minutes. Record the dropped item in `audit.md` under "dropped-for-budget" with the reason, and carry on.

**Killing a working agent is an acceptable cost.** With one verb over one item, a wrong kill loses one URL rather than a batch, anything already fetched is on disk, and the drop is recorded rather than silent. That is cheaper than trying to detect stuckness from a signal that does not exist.

## Salvage paths on phase failure (cross-phase)

If a phase errors, runs out of context, or the process is killed, the run still produces the artifacts available at that point. Resume re-enters from the last completed phase boundary by scanning on-disk artifacts.

- **Plan failure** → an empty or absent `scope` in `research_plan.json`, so nothing was fetched. Resume re-plans from scratch; it costs one sub-agent.
- **Extract failure** → `research_plan.json` holds the branch list; the cache holds whatever was fetched. Resume compares the two and runs only the branches with nothing on disk. It does not re-scope: new angles would not match the cache the half-finished run built.
- **Vet failure** → handles seen so far are in `cache/`. Already-promoted experts are in `experts.csv`. Resume re-runs `vet_user` only on un-vetted handles.
- **Synthesize failure** → `raw_research_outcomes.md` written from what was collected; partial summary with a `<!-- SYNTHESIZE-INCOMPLETE -->` header. Resume re-runs synthesis on the full claim set.
- **Audit failure** → the summary exists without verification annotations; `audit.md` notes `audit-incomplete`. Resume re-runs Audit from scratch, which is cheap next to the phases before it.

Resume infers progress from on-disk state. `research_plan.json` is the one checkpoint, and it is a plan rather than a progress marker — everything else is inferred by comparing that plan against the cache and the partial outputs.

## When the harness runs out of web searches

Claude Code caps web searches per session. If the run exhausts that quota mid-way, tell the user to start a new session and re-run the same command: the cache and partial outputs are the state, so resume picks up where the run stopped rather than starting over. The README explains how to raise the ceiling; the plugin never edits the user's settings to do it for them.
