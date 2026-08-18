# Brain index

Entry point for every command. The command's reference file tells you to read this file first. From here, jump to the files that apply to what you're doing right now.

## How every run goes

The same for all four commands. A command's reference file names its deliverable — the sections its report carries, who counts as a player, its own angles, any extra output file. Everything below belongs to the brain, and a reference file does not repeat it. Where a command genuinely works differently, its file states the difference alone; depth and interaction settings are the one thing whose per-command differences live here too, in `modes.md`, so a run reads one table rather than four.

1. **Plan** — parse the intent, slug the topic, detect whether this is a fresh topic, a re-run, or one branched from a parent, write `research_plan.json`. `research_plan.md`.
2. **The five phases, in order** — Plan, Extract, Vet, Synthesize, Audit. `phases/index.md`. None of them is optional.
3. **Mode** — `--auto` and `--quick`, token-matched anywhere in the args. `modes.md` owns every interaction and depth setting, per-command exceptions included.
4. **Source scripts** — `--topic <slug>` is mandatory on every call and the scripts refuse to run without it. `fetch.mjs --output` must resolve under `digmore/<slug>/cache/<source>/`.
5. **Every sub-agent return is checked** before anything is built on it, with one repair attempt and then a recorded drop. `schemas.md`.
6. **End of run** — append the run to `research_plan.json.run_history`, then print the four terminal sections in `reporting.md`. Nothing else reaches the terminal.

Two files are read on a rhythm rather than at a step. **`output.md`** is the writing style — re-read it before every piece of user-facing text and before every sub-agent dispatch; it is short so that costs little. **`reporting.md`** is what reaches the terminal — the progress lines, where a question for the user goes, the Run footer, the four end-of-run sections; read it once at the start of a run and once at the end. Read `sources/<source>.md` before issuing a request through that source.

## What you're orienting on

- A command was just invoked (e.g. `/digmore landscape video API providers`). Read the command's reference file, then come back here for the substance.
- You're inside an existing run and need to look up a rule, schema, or source detail. Use the per-phase / per-topic map below.

## Phase-to-file map

| When | Read |
| --- | --- |
| Parsing the invocation, slugging the topic, deciding fresh / re-run / branched from a parent | `research_plan.md`, `modes.md` |
| Before any external request | `anonymity.md`, `recency.md`, `long-form.md` |
| Plan — the topic, the angles, and the branches they make | `phases/plan_phase_a.md`, `schemas.md` (Orientation schema) |
| Extract — one searcher per branch, one reader per URL, source notes | `phases/extract_phase_b.md`, `schemas.md` (Branch searcher + Source extractor), `sources/<source>.md` per source involved |
| Vet — the handles behind the sources | `phases/vet_phase_c.md`, `vetting.md`, `sources/<source>.md` for source-specific signals, `schemas.md` (vet_user schema) |
| Synthesize — filter, expand, synthesise, critic pass | `phases/synthesize_phase_d.md`, `schemas.md` (Synthesizer schema), `output.md` (writing style is non-negotiable) |
| Audit — verify the top claims against their sources | `phases/audit_phase_e.md`, `schemas.md` (Verifier schema) |
| Salvage paths, how Plan → Extract → Vet → Synthesize → Audit connect | `phases/index.md` |
| Dispatching a sub-agent that returns a schema — the prompt, its three slots, the check on what comes back | `dispatch_structured_subagent.md` |
| Writing ANY user-facing or sub-agent output (always) | `output.md` |
| Printing progress, the Run footer, the end-of-run sections; where a question for the user goes | `reporting.md` |

## Topic-state map

| When | Read |
| --- | --- |
| research_plan.json schema, fresh vs re-run vs branched, experts.csv inheritance | `research_plan.md` |
| Mode dispatch (manual vs auto), per-tier confirmation thresholds, failure halts | `modes.md` |

## Sources

One file per source. Read the file before issuing a request through that source.

- `sources/reddit.md` — `api.mjs reddit` against digmore's API (no account, no OAuth).
- `sources/hackernews.md` — `hackernews.mjs` (Algolia + HN user page, throttled).
- `sources/twitter.md` — `api.mjs twitter` against digmore's API, tiered by depth.
- `sources/websearch.md` — Claude Code's `WebSearch` tool.
- `sources/forums.md` — generic forum discovery via WebSearch + long-thread fetch via `fetch.mjs`.
- `sources/local.md` — documents and text the user hands over.

Reddit and Twitter need an API key. Without one they are skipped and the run says so — see `sources/reddit.md` and `sources/twitter.md`.
