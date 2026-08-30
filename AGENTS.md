# Agent Rules — Digmore Plugin

## General working rules

- Be extremely brief and to the point. Avoid fluff, repetitions, and unnecessary words.
- Parallelize independent work.
- **Propose before editing `skill/`.** Say what changes, where, and why. Wait for approval.
- **Full variable names, never single characters or aliases.** Name a variable for what it holds or
  what it is for — `response`, `timeWindow`, `sandbox`, `index` — not `r`, `t`, `s`, `i`. Applies
  everywhere: loop counters, callback parameters, catch bindings, import aliases, destructured
  names, and shell scripts. No exceptions.
- **One place defines a data piece; everywhere else points at it.** Allowed values, schema fields,
  configurations, exit codes, filename patterns — and counts of any of them. Never restate, re-list or
  count from outside; the copy that drifts is the one nobody notices. Name the thing rather than
  number it: "the sources that carry handles" survives a seventh source, "the four sources" does not.
  A sub-agent is the exception — it is sent its own files and cannot follow a pointer, so give it the
  value.
- **Anything new that writes a shared file needs a single writer.** A step that fans out writers to
  one file loses rows silently — no error, no trace. **Every file a run writes now has exactly one
  writer, and no file has a lock**: where agents fan out, they hand back and the orchestrator writes.
  The current file-to-writer map is in `skill/brain/phases/index.md` §"Where a run writes", and a new
  agent or step that writes an existing file has to appear in it. A fan-out writer is a design to
  change, not a design to add a lock to.
- **New network code must not identify the user.** Any script or API endpoint we add that makes
  an outbound request sets its `User-Agent` from `BROWSER_USER_AGENTS` in
  `skill/scripts/fetch.mjs`, and sends nothing that identifies the user — no company or product
  name in a query string, payload, `Referer` or custom header. The harness's own WebSearch and
  WebFetch are outside this; we do not build those requests.

## Brain vs command files

- **The brain (`skill/brain/`) owns how a run executes** — the phases and their order, mode
  settings and depth reductions, vetting, schemas, writing style, per-source operating notes, topic
  and output paths. It is the single source for all of it, and `skill/brain/phases/index.md` is where
  the phases themselves are listed.
- **A command file (`skill/reference/*.md`) owns what is specific to that one command** — for
  example its report's sections and their order, who counts as a player, its own angles, how it
  chains from a parent topic, and any extra output file it produces.
- **A command file never repeats a brain rule.** If the brain already says it, the command file is
  silent on it.
- **A command file may change a brain rule.** Write only the part that is different, and say what
  it replaces. The brain holds the defaults; a command that genuinely works differently says so in
  its own file, and the brain's file points out that commands may change it.
- **Anything new has to work in all four kinds of run.** A run either asks the user things or does
  not (`--auto`), and is either full or shallow (`--fast`) — four combinations. When you add a
  source, a phase step, a script or a sub-agent task, write down how it behaves in each one.
  If it cannot work in some of them — say it needs an answer from the user, so `--auto` is out —
  write down what happens instead: decide it yourself and note what you assumed, stop the run and
  say why, or skip it and say it was skipped.

## Writing a sub-agent file

Every agent's own file under `skill/brain/subagents/` — the flat `<agent>.md`, or the `index.md`
where an agent has a directory — **opens with a summary table before any prose.** One field per row,
in this order, so two agents can be compared without reading either in full.

| Field | What goes in it |
|---|---|
| Phase | which of the six, with its marker — `Extract [2.2/6]`. More than one where the agent runs twice |
| Purpose | the one job it exists to do, in a sentence |
| Input text | what the orchestrator writes into the prompt. The part that differs per dispatch |
| Input rule files | paths it opens for instructions |
| Input data files | paths it opens for material |
| Runs | one line: what it does and what it runs, in the order it does them — each step with the script or network call it makes, `api.mjs reddit thread`, `fetch.mjs`, WebSearch, WebFetch. **Reading and writing files is not a tool**, so an agent that only opens what is already on disk says `no scripts, no network` and names what it reads and writes instead — never a bare `none`, which reads as an agent that does nothing |
| Settings that control it | every `~/.digmore/settings.json` configuration that bounds it, each saying whether **this agent** enforces it or the orchestrator counts it from outside |
| Held in its context | what it reads that never leaves the dispatch |
| Returns to main context | what comes back, and the shape name from `subagent_returns.json` — or `none`, which decides whether it gets the dispatch template at all |
| Writes to disk | every file, by directory and filename pattern |
| Logs | the exact heartbeat lines, or `none` |
| How it reports failure | its own half only — `fetch_failed`, `blocked`, "the check was not made". What the orchestrator does next belongs in the phase file |
| One dispatch per | the unit of work: one URL, one handle, one player's row, the whole run |
| Run instances | how many of that unit a full run dispatches |
| `--fast` | **name the configuration, never the number** — `preflight.mjs` prints what this run applies, and a number written here is one the user may have changed. A default beside the name is illustration only. Say where a `0` skips the step entirely, and say `the same in both modes` where nothing reduces |
| Concurrency | how many at once, **and why that number** — the harness limit, or a scraping limit against one host |
| Model tier | a pointer to the roster in `brain/index.md` §Sub-agents, never the value. The orchestrator is the only one that can act on a tier, and it reads that table already — putting the value here would make it open eleven agent files for eleven words. How to pick one is below |

Three rules hold it together:

- **The table is the definition; the prose never restates it.** The body explains *how* and *why*,
  and says each thing once — see the one-place rule above. A summary duplicated in a paragraph is a
  summary that starts lying at the first edit.
- **A field that does not apply says `n/a`, and is never dropped.** An absent row reads as forgotten
  rather than considered, which is the same reason a shadowban sample of zero means "not tested"
  rather than "clean".
- **Motivation goes beside the thing it motivates.** Why an output must keep its shape belongs in
  *Writes to disk*, next to the requirement — not in a separate paragraph about who reads it later.

**Picking the model tier — speed against judgement.** A faster model finishes sooner and is worth
less of an answer; a slower one is the reverse. Move an agent down a tier when its judgement is
mechanical — following a schema, extracting what a page says, sorting a list — or when something
downstream checks its work, and keep the slower tier where the agent's judgement *is* the product
and nothing after it would catch a worse call.

**Ask what the agent spends its time on before expecting the swap to be faster.** An agent that
reads a lot and writes a lot with no network in between finishes visibly sooner on a faster tier.
One whose wall-clock sits inside a fetch or an API call barely moves, because the model was never
what it was waiting for — there the cheaper tier buys cost, not speed, and the row should say so
rather than promise a speedup the run will not show.

## Plans & Specs

- Design docs hold all substance — content, copy, formulas, decisions. Plan docs are todo lists only, with manual verification gates that reference the design for details.
- Content changes go in the design; the plan stays a short, stable checklist. Both live in `/plans/`.
- The digmore API **Endpoints, parameters and response shapes: read `../digmore-api/plans/openapi*.json`** — timestamped, newest wins. It is generated from the running API, so it cannot drift.

<!-- digmore-knowledge start -->
## digmore knowledge

@../digmore-knowledge/wiki/index.md

- Pages about digmore are in `../digmore-knowledge/wiki/`. Read them before answering anything
  about digmore's plugin structure or requirements.
- The list above says what exists. Read it, then open what it points at.
- Name the pages you used. Say what they do not cover. Do not guess.
- Learned something worth keeping? Say so. It gets added in the knowledge repo.
<!-- digmore-knowledge end -->
