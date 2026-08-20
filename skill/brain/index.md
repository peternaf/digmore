# Brain index

Entry point for every command. The command's reference file tells you to read this file first. From here, jump to the files that apply to what you're doing right now.

## How every run goes

The same for every command. A command's reference file names its deliverable — the sections its report carries, who counts as a player, its own angles, any extra output file. Everything below belongs to the brain, and a reference file does not repeat it. Where a command genuinely works differently, its file states the difference alone; depth and interaction settings are the one thing whose per-command differences live here too, in `modes.md`, so a run reads one table rather than four.

1. **Plan** — parse the intent, slug the topic, detect whether this is a fresh topic, a re-run, or one branched from a parent, then scope it and write `research_plan.json`. `phases/plan_phase_a.md`.
2. **The six phases, in order** — Plan, Extract, Vet, Enrichment, Synthesize, Audit. `phases/index.md`. None of them is optional.
3. **Mode** — `--auto` and `--fast`, token-matched anywhere in the args. `modes.md` owns every interaction and depth setting, per-command exceptions included.
4. **Source scripts** — `--topic <slug>` is mandatory on every call and the scripts refuse to run without it. `fetch.mjs --output` must resolve under `digmore/<slug>/cache/<source>/`.
5. **Every sub-agent return is checked** before anything is built on it, with one repair attempt and then a recorded drop. `scripts/subagent_returns.json`.
6. **End of run** — append the run to `research_plan.json.run_history`, then print the four terminal sections in `reporting.md`. Nothing else reaches the terminal.

Two files are read on a rhythm rather than at a step. **`output.md`** is the writing style — re-read it before every piece of user-facing text and before every sub-agent dispatch; it is short so that costs little. **`reporting.md`** is what reaches the terminal — the progress lines, where a question for the user goes, the Run footer, the four end-of-run sections; read it once at the start of a run and once at the end. Before dispatching a sub-agent, send it its own file from `subagents/` — see below.

## What you're orienting on

- A command was just invoked (e.g. `/digmore landscape video API providers`). Read the command's reference file, then come back here for the substance.
- You're inside an existing run and need to look up a rule, schema, or source detail. Use the per-phase / per-topic map below.

## Phase-to-file map

| When | Read |
| --- | --- |
| Before any external request | `recency.md` |
| Fetching a web page — the command, the cache hit, the bot-wall fallback | `fetching.md` |
| Plan — slugging the topic, deciding fresh / re-run / branched, the angles, the sections, the branches, and `research_plan.json` itself | `phases/plan_phase_a.md`, `modes.md`, `sections.md`, `scripts/subagent_returns.json` (`scope` shape) |
| Extract — one searcher per branch, one reader per URL, source notes | `phases/extract_phase_b.md`, `subagents/branch_searcher_agent/`, `subagents/page_analyst_agent/`, `subagents/source_analyst_agent/` |
| Vet — the handles behind the sources | `phases/vet_phase_c.md`, `vetting.md`, `page_quality.md`, `subagents/handle_vetter_agent/` |
| Enrichment — who the research is about: the player candidates, the selection, the profiling | `phases/enrich_phase_d.md`, `subagents/player_profiler_agent.md` |
| Synthesize — filter, expand, synthesise, critic pass | `phases/synthesize_phase_e.md`, `scripts/subagent_returns.json` (Synthesizer schema), `output.md` (writing style is non-negotiable) |
| Audit — verify the top claims against their sources | `phases/audit_phase_f.md`, `scripts/subagent_returns.json` (Verifier schema) |
| Salvage paths, where a run writes, one writer per file, why claims and source notes stay on disk, how the six phases connect | `phases/index.md` |
| Dispatching a sub-agent that returns a schema — the prompt, its three slots, the check on what comes back | `subagents/dispatch_structured_subagent.md` |
| Deciding the summary's sections, or filling and rendering one | `sections.md` |
| Writing ANY user-facing or sub-agent output (always) | `output.md` |
| Printing progress, the Run footer, the end-of-run sections; where a question for the user goes | `reporting.md` |

| Mode dispatch (manual vs auto), the run ceilings and what each bounds, failure halts | `modes.md` |

## Sub-agents

One directory per agent, under `subagents/`. Each holds that agent's own instructions in
`index.md`, and one file per source it works with. **An agent is sent its `index.md` and the file
for the source it was given, and nothing else** — the files are self-contained on purpose, so no
agent reads a rule written for a different one.

| Agent | Phase | Directory |
|---|---|---|
| Scoping agent | Plan | `subagents/scoping_agent.md` |
| Branch Searcher | Extract · Search | `subagents/branch_searcher_agent/` — one file per source |
| Page Analyst | Extract · Read | `subagents/page_analyst_agent/` — one file per source |
| Source Analyst | Extract · Source notes | `subagents/source_analyst_agent/` — one file per source |
| Handle Vetter | Vet | `subagents/handle_vetter_agent/` — reddit, hackernews, twitter, forums |
| Player Profiler | Enrichment | `subagents/player_profiler_agent.md` |

**Every agent that fetches a page is also sent `fetching.md`** — the Page Analyst, the Expert
Document Analyst, the Player Profiler and the Claim Fact Checker. It owns the `fetch.mjs` command
and the bot-wall fallback, so no agent carries its own copy of either.

The six sources are Reddit, Hacker News, Twitter, the open web, specialty forums, and the user's
own documents. **The Handle Vetter does not cover all of them**, because a web page and a handed-over document have
authors rather than accounts, and there is nothing to vet.

**Reddit and Twitter need an API key.** Without one, Plan builds no branches on them, the run
proceeds on the rest and says which sources it could not reach.

## The scripts behind them

- `api.mjs reddit` and `api.mjs twitter` — through digmore's API. No account, no OAuth.
- `hackernews.mjs` — Algolia plus the HN user page, throttled hard at one request per 15s.
- `fetch.mjs` — the open web and forums. Derives its own filenames, returns a cached page without
  re-fetching, and reports the filename it would have used when a bot wall stops it.
