---
name: digmore
description: Business and market research with a vetted source behind every claim. Use when the user asks to research a market, a landscape, or a category; to look into a specific company, competitor or product; to find out what people say about something online; to work out how something is being marketed or promoted; or asks any business question that needs evidence from Reddit, Hacker News, Twitter, forums, the web, or their own documents. Also use for "who is winning in X", "what do people complain about in X", "is X any good", "who are the players in X", "how is X being promoted", "what is X's go-to-market", or a request to dig into a topic properly rather than answer from memory. Free-form request after the command; the literal token `--auto` runs without prompting, `--quick` runs a shallower pass.
user-invocable: true
argument-hint: "[landscape|competitor|ask|gtm] [topic] [--auto] [--quick]"
---

# Digmore

Five-phase business research: scope, extract, vet, synthesize, audit. Every substantive claim carries the source it came from, and a run states what it could not reach.

## Step 1 — always, before anything else

Run the configuration check. It is the first thing on every path, including the no-command path, and before any reference file is loaded:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/preflight.mjs"
```

Its stdout tells you which of six states the run is in and what to do about it. Follow it. Nothing else in the plugin checks configuration, so skipping this means a run that discovers halfway through that a source was never available.

**If it reports `NO_KEY`, or ends with `Could not confirm these are raised`, read `reference/first-run.md` and follow it before anything else** — before Step 2, before any command file, before any research. Those are first-run gates that stop and wait for an answer; the file holds them so this one does not carry setup text every user has already answered.

Read it too if the user supplies or declines a key at any later point. It owns every write to the settings file. Never write that file any other way, and never touch the user's own Claude Code settings.

## Step 2 — pick the command

The first word of the request may be a command. If it is, load that reference file and follow it.

| Command | Reference file | For |
|---|---|---|
| `landscape [topic]` | `reference/landscape.md` | Map a market: who exists, what they ship, what users say. No verdict |
| `competitor [name]` | `reference/competitor.md` | One company in depth: product, gaps, what customers complain about |
| `ask [question]` | `reference/general-inquiry.md` | Any business question that is not one of the others. The catch-all |
| `gtm [name]` | `reference/gtm-teardown.md` | Go-to-market teardown: how something is being promoted, by whom, and how well |

Load exactly one, and load it only after Step 1. The reference file is the command's full spec — its phases, its output sections, its player-inclusion test. Read it before doing any work.

### No command given

Two cases, and they are different:

**Bare `/digmore`, nothing else.** Explain briefly what digmore does, then point at the three commands most likely to be relevant. Judge which three from what you can see: any topics already under `digmore/` in the working directory, and what the user has been doing in this session. There is no scoring rule to apply — say why you picked them, and let the user choose. **Do not start a research run.** Nothing runs until the user picks.

**A request with no command word** — "who is winning in AI note taking and why". Pick the closest command yourself, then **confirm it before anything runs**. Say which you picked and why in one line, and name the alternatives so switching costs a word rather than a re-typed request:

> Reading this as `landscape` — mapping the market rather than one company. Say `competitor`, `ask` or `gtm` to switch, or go ahead.

Wait for the answer. If they pick a different command, load that reference file instead; nothing about the request needs restating.

One question, not an interrogation. Do not also ask about the topic, the depth or the sources in the same breath — those belong to the reference file, and `brain/topic.md` already has its own confirmation before Scope.

**In `--auto`, do not prompt.** State the command you picked and why, and run. `brain/modes.md` already has auto mode skip confirmation of detected intent and proceed on the best parse; this is the same rule. Name the pick in the run's Issues, so a wrong guess is visible in the output instead of silent.

If the user picks the catch-all when a specific command was offered, that is worth noting in the run's closing message: either the command set has a gap, or the commands were presented badly. Both are useful to know.

## Step 3 — the brain

Every command's reference file tells you to read `brain/index.md` first. That file is the entry point to everything else: writing style, the five phases, vetting, schemas, modes, topic mechanics, anonymity, recency, long-form handling, and the per-source operating notes.

**Re-read `brain/output.md` before writing any user-facing text or dispatching any sub-agent.** The writing-style rules are not optional, and they apply to sub-agent output as much as to the final report.

## Modes

Two flags, token-matched anywhere in the free-form args. All four combinations are valid.

- `--auto` — run end to end without prompting. Questions get logged to the summary instead of asked.
- `--quick` — a shallower, faster pass. Fewer angles, fewer sources, shallower vetting.

Full rules in `brain/modes.md`.

## Where the output goes

`digmore/<topic-slug>/` in the user's working directory, with the summary at `digmore/<topic-slug>/<topic-slug>-executive-summary.md`. Never write anywhere else, and never write inside the plugin's own directory — it is an install cache that a plugin update replaces.

## What a run must never do

- **Never present a claim without its source.** Cite-or-drop is absolute.
- **Never rewrite what a source said.** Shorten with `…` where it runs long; the words stay the source's.
- **Never let a source fail silently.** A source that was skipped, capped, or unavailable is named in the report and in the terminal output. A source that was never queried is not a source that came back empty.
- **Never edit its own files.** digmore is fixed for the user. A missing capability is a finding to record, not a change to make.
