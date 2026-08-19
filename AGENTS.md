# Agent Rules — Digmore Plugin

## General working rules

- Be extremely brief and to the point. Avoid fluff, repetitions, and unnecessary words.
- Parallelize independent work.
- **Propose before editing `skill/`.** Say what changes, where, and why. Wait for approval.
- **Full variable names, never single characters or aliases.** Name a variable for what it holds or
  what it is for — `response`, `timeWindow`, `sandbox`, `index` — not `r`, `t`, `s`, `i`. Applies
  everywhere: loop counters, callback parameters, catch bindings, import aliases, destructured
  names, and shell scripts. No exceptions.
- **Anything new that writes a shared file needs a lock or a single writer.** A step that fans out
  writers to one file loses rows silently — no error, no trace. Today only `experts.csv` is written
  by a fan-out, and `experts.mjs` takes a lock for it; every other file has one writer. The current
  file-to-writer map is in `skill/brain/phases/index.md` §"Where a run writes", and a new agent or
  step that writes an existing file has to appear in it.
- **New network code must not identify the user.** Any script or API endpoint we add that makes
  an outbound request sets its `User-Agent` from `BROWSER_USER_AGENTS` in
  `skill/scripts/fetch.mjs`, and sends nothing that identifies the user — no company or product
  name in a query string, payload, `Referer` or custom header. The harness's own WebSearch and
  WebFetch are outside this; we do not build those requests.

## Brain vs command files

- **The brain (`skill/brain/`) owns how a run executes** — the four phases and their order, mode
  settings and depth reductions, vetting, schemas, writing style, per-source operating notes, topic
  and output paths. It is the single source for all of it.
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
