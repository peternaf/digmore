# Modes

Two orthogonal axes set how a research run behaves.

- **Interaction axis** — `manual` (default) vs `--auto` (no prompts). Controls whether the run pauses for the user mid-run.
- **Depth axis** — full (the default, ~2 hour run) vs `--fast` (10–15 minute run). Controls how much work each phase does.

Both flags are token-matched anywhere in the command's free-form args. Any combination is valid: `--auto`, `--fast`, `--auto --fast`, neither.

# Interaction modes — manual and auto

The command takes free-form args. The literal token `--auto` anywhere in the args switches to auto mode. No flag → manual (the safer default).

## Manual mode (default)

You run all scripts via the Bash tool. When something needs the user's judgment, prompt them in chat and wait.

Two things trigger a prompt, and both are about **intent** rather than cost:

1. **Clarifying questions on an underspecified topic.** Ask 2–3 questions before slugging.
2. **Something detected that the user did not say** — a parent picked between candidates, a re-run or branch they did not ask for, a topic still underspecified. State the reading and wait. When the detection only repeats what they typed, say it and carry on without stopping. See `phases/plan_phase_a.md` §1.

**A run never stops to ask permission to spend.** Every ceiling is a number the user already set, printed by `preflight.mjs` at the start of the run — asking again mid-run is asking them to re-approve their own settings, which teaches them to say yes without reading.

## Auto mode (`--auto`)

You run all scripts via the Bash tool but never prompt.

- Clarifying questions are not asked and not written down as questions. **Answer them yourself** on the best available evidence and carry on, then record what you assumed in the run's Issues and in `audit.md`. See `reporting.md` §"Questions for the user".
- Nothing detected is confirmed — state the reading, proceed on your best parse, and record it in the run's Issues.

## Mode scope

Mode applies to the whole research run (all sources), not one.

## Per-source caps

Every ceiling is a hard cap in both modes — the mode decides whether the run asks the user questions, never how much work it is allowed to do. `vet.handleCapPerSource` bounds each source's vetting on its own, and Twitter adds `twitter.handlesDeepVetted` for the handles whose posts are read too. Cap hits surface in the Run footer of the summary.

## Failure handling in auto mode

If a main-source script fails for a reason that needs user intervention (a source temporarily unavailable, a rejected API key), the whole run halts at the source boundary. Record the failure in `audit.md` and name it in the run's Issues. The user resolves the underlying issue and re-runs; resume scans existing artifacts and picks up from where work stopped.

A source that is unavailable because no API key is configured is not a failure and does not halt the run — the run proceeds without it and says so. See `subagents/branch_searcher_agent/reddit.md` and `subagents/branch_searcher_agent/twitter.md`.

# Depth modes — full and fast

The literal token `--fast` anywhere in the args switches to fast mode. No flag → full (the default).

## Full mode (default)

Standard research run as described in the rest of the brain. Roughly 2 hours wall-clock. All phases run at their canonical parameters.

## Fast mode (`--fast`)

10–15 minute wall-clock budget. Same five-phase shape, every phase scaled down. The output is still a complete summary + `players.csv` + `experts.csv` + `audit.md` — just shallower.

**Every number is in `~/.digmore/settings.json`, and `preflight.mjs` prints them at the start of the run.** Read them off that report; do not carry a number from here, and never substitute one of your own. Where preflight shows `20 → 5`, the second value is this mode's. A `0` means that step is skipped entirely.

The ceilings it prints, and what each bounds:

| Group | Ceilings |
|---|---|
| `plan` | `minAngles`, `maxAngles`, `scopingSearches` |
| `extract` | `fetchesPerBranch`, `maxPagesPerDocument` |
| `vet` | `handleCapPerSource` |
| `synthesize` | `expertsFollowed`, `urlsPerExpert`, `claimsFactChecked`, `manualVerifyFlagCap` |
| `twitter` | `handlesDeepVetted`, `postsPerDeepVet` |
| `hackernews` | `commentDepth`, `recentCommentsSampled` |
| `subagents` | `repairAttempts` |

**A user's own ceiling is never loosened by asking for a shallower run.** Fast takes the lower of the two, so someone who set `vet.handleCapPerSource` to 10 gets 10 in both modes. The exception is a fast value of `0`, which is a deliberate skip and wins.

What fast changes that is not a number:

| Phase | Full | Fast |
|---|---|---|
| **Vet — Twitter** | profile pass, then the deep pass over `twitter.handlesDeepVetted` handles | profile pass only, because `handlesDeepVetted` is `0`. The voice judgment goes with it — it needs posts a profile call never fetches |
| **Source notes** | one per source | one per source (reads the smaller Search dataset, naturally faster) |
| **Synthesize — critic pass** | yes | yes |

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

## Fast mode in auto + manual

Fast mode is orthogonal to interaction. The same reduction table applies in both:

- `manual + fast`: prompts still fire (clarifying questions). The Twitter confirmation gates do not trigger, because fast lowers the same `twitter.*` ceilings the gates are measured against.
- `auto + fast`: no prompts, hard caps. Anything that would have prompted is decided by you and recorded as an assumption.

## When a command changes these

Everything above is the default. A command may replace any of it in its own reference file, and two do today: `gtm` narrows which sources `--fast` runs, and `ask` sets its own angle counts. Read the command's file alongside this one before applying the reductions — what it does not mention, it takes from here unchanged.
