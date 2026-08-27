# Brain index

Entry point for every command. The command's reference file tells you to read this file first. From here, jump to the files that apply to what you're doing right now.

## How every run goes

The same for every command. A command's reference file names its deliverable — the sections its report carries, who counts as a player, its own angles, any extra output file. Everything below belongs to the brain, and a reference file does not repeat it. Where a command genuinely works differently, its file states the difference alone; depth and interaction settings are the one thing whose per-command differences live here too, in `modes.md`, so a run reads one table rather than four.

1. **Plan** — parse the intent, slug the topic, detect whether this is a fresh topic, a re-run, or one branched from a parent, then scope it and write `research_plan.json`. `phases/plan_phase_a.md`.
2. **The six phases, in order** — Plan, Extract, Vet, Enrichment, Synthesize, Audit. `phases/index.md`. None of them is optional.
3. **Mode** — `--auto` and `--fast`, token-matched anywhere in the args. `modes.md` owns every interaction and depth setting, per-command exceptions included.
4. **Source scripts** — `--topic <slug>` is mandatory on every call and the scripts refuse to run without it. `fetch.mjs --output-dir` must resolve under `digmore/<slug>/cache/`, and the script names the file itself.

   **Never `cd`, and never `mkdir`.** You are already in the directory the user is working in, and every script builds its paths from there as `digmore/<slug>/...` and creates what it needs on the way. A `cd` into the topic would nest a second copy under the first — which is why the scripts refuse to run from inside one. A `cd` in the same command as a write also asks the user to approve something that did not need doing, and a run that opens by asking permission for its own scaffolding reads as a run that does not know where it is.
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
| Extract — one searcher per branch, one reader per batch of URLs, source notes | `phases/extract_phase_b.md`, `subagents/branch_searcher_agent/`, `subagents/page_analyst_agent/`, `subagents/source_analyst_agent/` |
| Vet — the handles behind the sources | `phases/vet_phase_c.md`, `vetting.md`, `page_quality.md`, `subagents/handle_vetter_agent/` |
| Enrichment — who the research is about: the player candidates, the selection, the profiling | `phases/enrich_phase_d.md`, `subagents/player_profiler_agent.md` |
| Synthesize — the evidence becomes documents: the enumerable sections and the raw report, then the summary drafted from them | `phases/synthesize_phase_e.md`, `subagents/raw_report_writer_agent.md`, `subagents/final_report_writer_agent.md`, `sections.md`, `output.md` (writing style is non-negotiable) |
| Audit — the report is checked and fixed: reviewed, repaired, copy edited, every rendered claim checked against the text the run stored | `phases/audit_phase_f.md`, `subagents/final_report_reviewer_agent.md`, `subagents/final_report_copy_editor_agent.md`, `subagents/claim_fact_checker_agent.md` |
| Where a run writes, one writer per file, why claims and source notes stay on disk, how the six phases connect | `phases/index.md` |
| Resuming — where the run stopped, each phase's salvage path, a cache that is gone, a session out of web searches | `resuming.md`. **Read on a resumed run and on no other**, which is why it is not in the file above |
| Dispatching a sub-agent that returns a schema — the prompt, its three slots, the check on what comes back | `subagents/dispatch_structured_subagent.md` |
| Deciding the summary's sections, or filling and rendering one | `sections.md` |
| Writing ANY user-facing or sub-agent output (always) | `output.md` |
| Printing progress, the Run footer, the end-of-run sections; where a question for the user goes | `reporting.md` |

| Mode dispatch (manual vs auto), the run configurations and what each bounds, failure halts | `modes.md` |

## Sub-agents

One entry per agent, under `subagents/`. An agent whose work differs by source has a directory —
its own instructions in `index.md`, and one file per source. An agent whose work does not is a single
file. **An agent is sent its own file and, where it has one, the file for the source it was given,
and nothing else** — the files are self-contained on purpose, so no agent reads a rule written for a
different one.

**Every one of them opens with a summary table**, defined in `AGENTS.md` §"Writing a sub-agent file":
one field per row, in a fixed order, so two agents can be compared without reading either in full.

| Agent | Phase | Directory |
|---|---|---|
| Scoping agent | Plan | `subagents/scoping_agent.md` |
| Branch Searcher | Extract · Search | `subagents/branch_searcher_agent/` — one file per source |
| Page Analyst | Extract · Read | `subagents/page_analyst_agent/` — one file per source |
| Source Analyst | Extract · Source notes | `subagents/source_analyst_agent/` — one file per source |
| Handle Vetter | Vet | `subagents/handle_vetter_agent/` — reddit, hackernews, twitter, forums |
| Player Profiler | Enrichment | `subagents/player_profiler_agent.md` |
| Raw report writer | Synthesize · Audit | `subagents/raw_report_writer_agent.md` |
| Final report writer | Synthesize · Audit | `subagents/final_report_writer_agent.md` |
| Final report reviewer | Audit | `subagents/final_report_reviewer_agent.md` |
| Final report copy editor | Audit | `subagents/final_report_copy_editor_agent.md` |
| Claim Fact Checker | Audit | `subagents/claim_fact_checker_agent.md` |

**The first six have a directory and one file per source; the last five are a single file each**,
because nothing about what they do differs by source — they work from what the run has already
gathered rather than from any one place it came from.

**Both agents that fetch a page are also sent `fetching.md`** — the Page Analyst and the Player
Profiler, and those two are all of them. It owns the `fetch.mjs` command and the bot-wall fallback,
so no agent carries its own copy of either. The Claim Fact Checker is deliberately sent neither: it
checks claims against pages already on disk, and a file explaining how to get a page would invite it
to go and get one.

The six sources are Reddit, Hacker News, Twitter, the open web, specialty forums, and the user's
own documents. **The Handle Vetter does not cover all of them**, because a web page and a handed-over document have
authors rather than accounts, and there is nothing to vet.

**Reddit and Twitter need an API key.** Without one, Plan builds no branches on them, the run
proceeds on the rest and says which sources it could not reach.

## The scripts behind them

- `api.mjs reddit` and `api.mjs twitter` — through digmore's API. No account, no OAuth.
- `hackernews.mjs` — Algolia for threads and per-author searches, the official Firebase HN API for
  profiles and the `dead` flag. Neither is throttled.
- `fetch.mjs` — the open web and forums. Derives its own filenames, returns a cached page without
  re-fetching, and reports the filename it would have used when a bot wall stops it.
