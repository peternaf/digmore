# Modes

Two orthogonal axes set how a research run behaves.

- **Interaction axis** — `manual` (default) vs `--auto` (no prompts). Controls whether the run pauses for the user mid-run.
- **Depth axis** — full (the default, ~2 hour run) vs `--quick` (10–15 minute run). Controls how much work each phase does.

Both flags are token-matched anywhere in the command's free-form args. Any combination is valid: `--auto`, `--quick`, `--auto --quick`, neither.

# Interaction modes — manual and auto

The command takes free-form args. The literal token `--auto` anywhere in the args switches to auto mode. No flag → manual (the safer default).

## Manual mode (default)

You run all scripts via the Bash tool. When something needs the user's judgment, prompt them in chat and wait.

Three things trigger a prompt:

1. **Vetting batches that cross a per-tier confirmation threshold.** Twitter examples: more than 20 handles at Tier 1 or 2, more than 5 at Tier 3. Surface the handle count and which tier they would be vetted at, then wait for approval.
2. **Clarifying questions on an underspecified topic.** Ask 2–3 questions before slugging.
3. **Something detected that the user did not say** — a parent picked between candidates, a re-run or branch they did not ask for, a topic still underspecified. State the reading and wait. When the detection only repeats what they typed, say it and carry on without stopping. See `research_plan.md` step 3.

## Auto mode (`--auto`)

You run all scripts via the Bash tool but never prompt.

- Per-tier confirmation thresholds become **hard caps** — above the cap, stop, don't ask.
- Clarifying questions are not asked and not written down as questions. **Answer them yourself** on the best available evidence and carry on, then record what you assumed in the run's Issues and in `audit.md`. See `reporting.md` §"Questions for the user".
- Nothing detected is confirmed — state the reading, proceed on your best parse, and record it in the run's Issues.

## Mode scope

Mode applies to the whole research run (all sources), not one.

## Per-source caps in auto mode

Each source that costs depth defines its own request-count caps (count, not dollars). Twitter: Tier 1 max 20 handles/run, Tier 2 max 20, Tier 3 max 5. Cap hits surface in the Run footer of the summary.

## Failure handling in auto mode

If a main-source script fails for a reason that needs user intervention (a source temporarily unavailable, a rejected API key), the whole run halts at the source boundary. Record the failure in `audit.md` and name it in the run's Issues. The user resolves the underlying issue and re-runs; resume scans existing artifacts and picks up from where work stopped.

A source that is unavailable because no API key is configured is not a failure and does not halt the run — the run proceeds without it and says so. See `sources/reddit.md` and `sources/twitter.md`.

# Depth modes — full and quick

The literal token `--quick` anywhere in the args switches to quick mode. No flag → full (the default).

## Full mode (default)

Standard research run as described in the rest of the brain. Roughly 2 hours wall-clock. All phases run at their canonical parameters.

## Quick mode (`--quick`)

10–15 minute wall-clock budget. Same five-phase shape, every phase scaled down. The output is still a complete summary + `players.csv` + `experts.csv` + `audit.md` — just shallower.

Per-phase reductions vs full mode:

| Phase | Full | Quick |
|---|---|---|
| **Plan — angles** | 3–6 | 2 |
| **Search — URLs per branch** | `fetchesPerBranch`, 20 by default | 5, or `fetchesPerBranch` if that is lower |
| **Search — Twitter** | Tier 1/2/3 per the rules | Tier 1 only, max 5 handles. Tier 2/3 + LLM-judgment layer skipped. |
| **Source notes** | one per source | one per source (reads the smaller Search dataset, naturally faster) |
| **Vet — handle filter** | every handle | only handles seen ≥ 2 times across Search AND with above-floor reputation signal (karma > 50 / age > 1y) |
| **Vet — total handle cap** | `vetHandleCap`, 50 by default | 20 handles, or `vetHandleCap` if that is lower |
| **Synthesize — filter + expand** | filter + follow experts elsewhere | filter + follow experts elsewhere, capped at top-3 experts × 3 URLs each |
| **Synthesize — critic pass** | yes | yes |
| **Audit — claims verified** | top 50 | top 10 |
| **Audit — `manual-verify-required` cap** | 15 | 5 |

The summary includes a `quick mode` tag in the Run footer when this mode was used, so the user knows what depth produced it.

## Twitter in quick mode

Quick mode runs Twitter at the shallowest tier only:

- Tier 1 (profile only): max 5 handles per run.
- Tier 2 + Tier 3: skipped (they need tweet payloads, which take longer).
- LLM-judgment vetting layer: skipped (it needs Tier 2/3 tweet data).

## What quick mode is for

- First-pass triage of a topic to decide whether a full run is worth it.
- Interactive chained-follow-up loops: read one summary, pick a follow-up topic, get a 10-minute draft, iterate.
- Repeat runs on the same topic to check what changed (cheap re-execution).

## What quick mode is not for

- Final-deliverable competitor teardowns where confidence matters.
- Topics where Twitter is central — Tier 1 profile data alone is too shallow to drive a teardown.
- The first time you research a topic where you'll act on the result without re-reading.

## Quick mode in auto + manual

Quick mode is orthogonal to interaction. The same reduction table applies in both:

- `manual + quick`: prompts still fire (clarifying questions). Twitter confirmation gates don't trigger because Tier 1's 5-handle cap is below the >20 threshold.
- `auto + quick`: no prompts, hard caps. Anything that would have prompted is decided by you and recorded as an assumption.

## When a command changes these

Everything above is the default. A command may replace any of it in its own reference file, and two do today: `gtm` narrows which sources `--quick` runs, and `ask` sets its own angle counts. Read the command's file alongside this one before applying the reductions — what it does not mention, it takes from here unchanged.
