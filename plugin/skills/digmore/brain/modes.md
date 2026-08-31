# Modes

Two orthogonal axes set how a research run behaves.

- **Interaction axis** — `manual` (default) vs `--auto` (no prompts). Controls whether the run pauses for the user mid-run.
- **Depth axis** — full (the default, ~2 hour run) vs `--fast` (10–15 minute run). Controls how much work each phase does.

Both flags are matched anywhere in the command's free-form args, as whole words. Any combination is valid: `--auto`, `--fast`, `--auto --fast`, neither.

# Interaction modes — manual and auto

The command takes free-form args. The literal flag `--auto` anywhere in the args switches to auto mode. No flag → manual (the safer default).

## Manual mode (default)

You run all scripts via the Bash tool. When something needs the user's judgment, prompt them in chat and wait.

Three things trigger a prompt, and all are about **intent** rather than cost:

1. **Clarifying questions on an underspecified topic.** Ask 2–3 questions before slugging.
2. **Something detected that the user did not say** — a parent picked between candidates, a re-run or branch they did not ask for, a topic still underspecified. State the reading and wait. When the detection only repeats what they typed, say it and carry on without stopping. See `phases/plan_phase_a.md` §1.
3. **The plan, before any of it runs** — the angles, the sources and the sections, as one `AskUserQuestion` call with everything pre-selected. `phases/plan_phase_a.md` §3.1 owns its shape. This one always fires in manual mode; the first two fire only when their condition holds.

**Those three are the only places a run stops on its own, and all are in Plan** — the draft gate below is the fourth and belongs to one mode combination. Once the plan is agreed the run goes to the end on its own: every step follows the last without a break, and you do not end your turn between them. Nothing finishing is a place to hand back — not a sub-step, not a phase — and the only thing that ends a run is the four end-of-run sections in `reporting.md`. **Ending a turn hands control back whether or not you asked anything**, so a status report between two steps stops the run as surely as a question would.

**A message from the user mid-run is an instruction, not a stop.** Carry it out and keep going in the same turn. What changed goes in one line before the next marker — never a block that sets out the consequences and closes on what comes next, which is the sign-off `reporting.md` forbids and costs the user the same restart as a question would. **Answering someone is not handing back to them**, and this is the case the rule above does not cover: it is written about the run's own boundaries, and nothing finishing is what prompts this one. A real run dropped a source on request, recorded it correctly, then wrote three paragraphs on what the loss cost and ended the turn — the last line of which promised not to stop again.

**A run never stops to ask permission to spend.** Every configuration is a number the user already set, printed by `preflight.mjs` at the start of the run — asking again mid-run is asking them to re-approve their own settings, which teaches them to say yes without reading.

## Auto mode (`--auto`)

You run all scripts via the Bash tool but never prompt.

- Clarifying questions are not asked and not written down as questions. **Answer them yourself** on the best available evidence and carry on, then record what you assumed in the run's Issues and in `audit.md`. See `reporting.md` §"Questions for the user".
- Nothing detected is confirmed — state the reading, proceed on your best parse, and record it in the run's Issues.

## Mode scope

Mode applies to the whole research run (all sources), not one.

## Per-source caps

Every configuration is a hard cap in both modes — the mode decides whether the run asks the user questions, never how much work it is allowed to do. `vet.handleCapPerSource` bounds each source's vetting on its own, and Twitter adds `twitter.handlesDeepVetted` for the handles whose posts are read too. Cap hits surface in the Run footer of the summary.

## Failure handling in auto mode

If a main-source script fails for a reason that needs user intervention (a source temporarily unavailable, a rejected API key), the whole run halts at the source boundary. Record the failure in `audit.md` and name it in the run's Issues. The user resolves the underlying issue and re-runs; resume scans existing artifacts and picks up from where work stopped.

A source that is unavailable because no API key is configured is not a failure and does not halt the run — the run proceeds without it and says so. See `subagents/branch_searcher_agent/reddit.md` and `subagents/branch_searcher_agent/twitter.md`.

# Depth modes — full and fast

The literal token `--fast` anywhere in the args switches to fast mode. No flag → full (the default).

## Full mode (default)

Standard research run as described in the rest of the brain. Roughly 2 hours wall-clock. All phases run at their canonical parameters.

## Fast mode (`--fast`)

10–15 minute wall-clock budget. Same six-phase shape, every phase scaled down. The output is still a complete summary + `players.csv` + `experts.csv` + `audit.md` — just shallower.

**Every number is in `~/.digmore/settings.json`, and `preflight.mjs` prints them at the start of the run.** Read them off that report; do not carry a number from here, and never substitute one of your own. Where preflight shows `20 → 5`, the second value is this mode's. A `0` means that step is skipped entirely.

The configurations it prints, and what each bounds:

| Group | Configurations |
|---|---|
| `plan` | `minAngles`, `maxAngles`, `scopingSearches` |
| `extract` | `fetchesPerBranch`, `maxPagesPerDocument`, `urlsPerDispatch`, `observationsPerDispatch` |
| `vet` | `handleCapPerSource`, `handlesPerDispatch` |
| `enrich` | `expertsFollowed`, `urlsPerExpert`, `minPlayerDocuments` |
| `twitter` | `handlesDeepVetted`, `postsPerDeepVet`, `handlesPerDispatch` |
| `hackernews` | `commentDepth`, `recentCommentsSampled`, `deadSampleSize`, `urlsPerDispatch` |
| `forums` | `urlsPerDispatch` |
| `audit` | `paragraphsPerDispatch` |
| `subagents` | `repairAttempts` |

**A configuration is named for the phase that spends it**, which is why the expert step's sit under `enrich`. **A per-source group is the exception, and holds only what that source does differently**: `twitter.handlesPerDispatch` replaces `vet.handlesPerDispatch`, and `hackernews.urlsPerDispatch` and `forums.urlsPerDispatch` replace `extract.urlsPerDispatch` — those two sources carry the heaviest documents, so their batches are smaller. **One is spent in two phases: `extract.fetchesPerBranch` also caps the pages one Player Profiler may open in Enrichment.** Same quantity — how many pages an agent opens before it works with what it has — and a second key holding the same value is one that drifts out of step. **Synthesize has no group at all, and Audit's one is a batch size rather than a depth**: every rendered claim is fact-checked, so there is no checked subset to size and nothing is flagged for the user to chase. `audit.paragraphsPerDispatch` decides how many paragraphs one Claim Fact Checker works through, never how many are checked.

**The `*PerDispatch` configurations are batch sizes, and none of them reduces in fast mode.** They set how many items one Page Analyst, Handle Vetter or Claim Fact Checker works through in sequence, so a run spends fewer sub-agent dispatches without reading anything less. Fast mode already cuts how many items there are; cutting the batch as well would put the dispatch count back up, which is the opposite of what the mode is for. None of them is a concurrency limit — that is the harness's, and it is how many agents run at once.

**`twitter.handlesPerDispatch` overrides `vet.handlesPerDispatch` on that source alone**, and it is the only per-source override of a batch size. A Twitter deep vet reads `postsPerDeepVet` posts, so the same handle count carries several times the material a Reddit or forums batch does. It keeps its lower value in fast mode too, where `handlesDeepVetted` is `0` and no posts are read at all.

**A user's own configuration is never loosened by asking for a shallower run.** Fast takes the lower of the two, so someone who set `vet.handleCapPerSource` to 10 gets 10 in both modes. The exception is a fast value of `0`, which is a deliberate skip and wins.

What fast changes that is not a number:

| Phase | Full | Fast |
|---|---|---|
| **Vet — Twitter** | one dispatch per handle, at a depth decided before it goes out: the top `twitter.handlesDeepVetted` by rank get `--posts <twitter.postsPerDeepVet>`, everyone else `--posts 0` | one dispatch per handle at `--posts 0`, because `handlesDeepVetted` is `0`. The voice judgment goes with it — it needs posts a profile call never fetches |
| **Enrichment — the expert step** | `enrich.expertsFollowed` experts, `enrich.urlsPerExpert` pages each | the same shape at the lower numbers. Twitter contributes nothing, since no handle's posts were cached |
| **Source notes** | one per source | one per source (reads the smaller Search dataset, naturally faster) |
| **Audit — the fact check** | every rendered claim | every rendered claim. It reads local files, so being shallow buys nothing worth the guarantee |

**Fast mode does not pre-filter handles.** The smaller `handleCapPerSource` is the whole reduction, and the ranking in `phases/vet_phase_c.md` decides who fills it. A filter that cut handles before ranking would be a bound applied before the sort, which is the thing that section exists to prevent.

The summary includes a `fast mode` tag in the Run footer when this mode was used, so the user knows what depth produced it.

## What fast mode is for

- First-pass triage of a topic to decide whether a full run is worth it.
- Interactive chained-follow-up loops: read one summary, pick a follow-up topic, get a 10-minute draft, iterate.
- Repeat runs on the same topic to check what changed (cheap re-execution).

## What fast mode is not for

- Final-deliverable competitor teardowns where confidence matters.
- Topics where Twitter is central — a profile alone, with nobody's posts read, is too shallow to drive a teardown.
- The first time you research a topic where you'll act on the result without re-reading.

## The draft gate — `manual + fast` only

**When the first summary draft is finished, stop and ask.** This is the one stop outside Plan, and it
exists only where fast and manual meet: fast mode's whole purpose is triage — *"a 10-minute draft,
iterate"* — and a user deciding whether the topic is worth a full run wants the draft in their hands
at the moment it exists, not after the phase that takes longest.

Print, after `[5.2/6]` finishes and before any `[6.x/6]` marker:

- that the summary is written, and its path;
- **what Audit does**, one line each, in order:

  | | |
  |---|---|
  | Review | the draft against the plan — every declared section present, nothing answering a question nobody asked |
  | Repair | where the review found a gap the evidence can close, the aggregator rebuilds the section rows it names |
  | Copy edit | duplicate ideas removed, sentences tightened, every removal reported by `claimId` |
  | Fact check | every claim the report renders, held against the quotes and pages the run stored; unsupported statements are deleted |

- the question — continue into Audit, or read the summary first.

**Then wait.** Continue and the run goes to the end without stopping again. Stop and the topic is left
mid-run: `../phases/index.md` says no phase is optional and Audit least of all, and that still holds —
this defers Audit, it does not skip it. Say so in the same breath, and say that resuming re-enters at
Audit rather than starting over (`../resuming.md`).

**Neither `--auto` nor a full run has this gate.** `--auto` has no prompts at all, and a full run is
the one the user already decided was worth the time — offering an exit from its most valuable phase
would be asking them to re-make a decision they made when they chose the mode.

## Fast mode in auto + manual

Fast mode is orthogonal to interaction. The same reduction table applies in both:

- `manual + fast`: prompts still fire (clarifying questions), **and the draft gate above is this combination's alone**. The Twitter confirmation gates do not trigger, because fast lowers the same `twitter.*` configurations the gates are measured against.
- `auto + fast`: no prompts, hard caps. Anything that would have prompted is decided by you and recorded as an assumption.

## When a command changes these

Everything above is the default. A command may replace any of it in its own reference file, and two do today: `gtm` narrows which sources `--fast` runs, and `ask` sets its own angle counts. Read the command's file alongside this one before applying the reductions — what it does not mention, it takes from here unchanged.
