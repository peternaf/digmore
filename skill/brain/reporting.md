# What reaches the user

What the terminal shows while a run is going and when it finishes, and what never goes in a file. Read this once at the start of a run and once at the end — unlike `output.md`, which is re-read before every piece of text.

**Everything you print is either the research or where the run has got to.** Nothing else reaches the user: not what you are about to do, not why a step is slow, not what you are waiting on, not which tool you reached for, not how you decided. That is your working. A run is judged on what it found, and every line that is not a finding or a position is a line the user has to read past to reach one.

## Progress — one line per step

A run is long. Print one line to the terminal as each step begins, so the user can see where they are and how much is left:

```
[1/6] Plan
[2.1/6] Extract · Search
[2.2/6] Extract · Read
[2.3/6] Extract · Source reports
[3/6] Vet
[4.1/6] Enrichment · Expert search
[4.2/6] Enrichment · Expert read
[4.3/6] Enrichment · Source append
[4.4/6] Enrichment · Candidates
[4.5/6] Enrichment · Profile
[5.1/6] Synthesize · Raw report
[5.2/6] Synthesize · Draft
[6.1/6] Audit · Review
[6.2/6] Audit · Repair
[6.3/6] Audit · Re-review
[6.4/6] Audit · Copy edit
[6.5/6] Audit · Markers
[6.6/6] Audit · Fact check
[6.7/6] Audit · Redraft
[6.8/6] Audit · Record
```

- **The counter is always out of 6** — Plan, Extract, Vet, Enrichment, Synthesize, Audit. A phase with sub-steps numbers them after the point, so progress inside a phase that runs for an hour is visible without it becoming a seventh phase. The phases that dispatch most of the run's agents all have them; Plan and Vet are each one step and do not.
- **Print at the start of the step, not the end**, so the line names what is running now. The next marker is the previous step's completion; there is no "done" line in the terminal.
- **No end-of-step report.** A step finishing prints nothing at all, and that covers a sub-step as much as a whole phase: the next marker is what says the last step is done, and a digest of what the step found is a "done" line with a table on it. Everything such a digest would carry is already owed somewhere permanent — the counts to `audit.md`, the reading to the report, the run's own problems to Issues — and a terminal that scrolls past is the one place none of it should live. It is also how a run stops: a block that closes on what comes next is a sign-off, and a sign-off ends the turn. `../modes.md` §Manual mode owns that rule.
- **A marker and its step go in the same turn.** The line says the step is running, so run it. `[4.5/6] Enrichment · Profile · 47 players` printed with no profiling after it is the run announcing work and then handing back, which is the same stop as a report at a step boundary and costs the user the same restart.
- **A conditional step that did not run prints nothing at all.** Four of Audit's eight are conditional — the repair, the re-review and both redrafts run only when something needs them — so `[6.1/6]` followed by `[6.4/6]` is a normal run rather than a missing step. They get a marker when they do run because they are the longest silence in the phase: rebuilding the raw report and rewriting the summary, with nothing printed, reads as a run that has hung.
- **A step working through a queue says how big the queue is, then counts it down.** Only that shape: a number of items, and a pace you do not set. `[3/6] Vet · 50 handles on Hacker News`, then `[3/6] Vet · 18/50`. It goes on the marker, and it is the whole message. `[4.5/6]` counts the players it is profiling down the same way, a row at a time as each returns.

- **On resume, say what is being skipped**: `[1/6] Plan — already complete, resuming from Vet`. The user needs to know the run did not start over.
- **A step that could not run says so on its own line** and the run continues: `[3/6] Vet — Reddit and Twitter unavailable, no API key`.

## Every marker also goes to the run log

The terminal shows where the run is now; `run_log.md` records where it has been, and it is the only record of where a run spent its time. So each marker you print is written there too, as a pair:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/runlog.mjs" start "[2.1/6] Extract · Search" --topic <slug>
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/runlog.mjs" done  "[2.1/6] Extract · Search" --topic <slug> --note "25 branch searchers, 302 URLs"
```

- **The `start` goes in before the work**, not held back until the step finishes: a run that dies in Vet has to leave a log showing it reached Vet.
- **The `done` line's note says what the step did** — agents dispatched, and the one count that explains the duration. An hour is only debuggable beside the number of things it was doing.
- **A failed or skipped step says so on its `done` line** rather than writing nothing. A missing pair reads as a crash, and a skipped phase is not one. A conditional step that never ran writes no pair, exactly as it prints no marker.
- **The script stamps the time and works out the elapsed figure.** Never compose either yourself: you have no clock, and a wrong stamp makes every elapsed figure after it wrong, silently.
- **`runlog.mjs header` opens the run**, once, before the first marker. It takes its own flags —
  `--note` is the `done` line's, and passing it here names nothing:

  ```
  node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/runlog.mjs" header --topic <slug> --kind fresh --mode "manual, full"
  ```

  `--kind` is `fresh`, `re-run` or `branch`; `--mode` is the two axes as you would say them. The file
  is appended across runs, never replaced — the second run is when the first run's timings become
  useful. **`runlog.mjs --help` lists every verb and its flags**, which is quicker than guessing at one.

Nothing reads this file during the run. The stuck-agent check reads `cache/_progress/*.log`: different question, different time, different file.

## Questions for the user — never in a file

No file a run produces carries a question — not the summary, not `audit.md`, not any section of either.

- **Manual mode** — ask it when it comes up, in chat, and wait. A question is only useful before the work that depends on it.
- **Auto mode** — answer it yourself on the best available evidence and carry on. That is the whole point of the mode: the user is not there, and a run that stops to write questions down has produced homework instead of research.

What survives is the **assumption**, not the question. When you answered something on the user's behalf, say so in the run's Issues below and record it in `audit.md` under assumptions made without the user — one line each, what you assumed and what it changed. A wrong assumption the user can see is a correction they can make on the next run; a question in a file is a run they have to repeat.

Run problems are not questions either. A failed fetch, a capped section, a source that was unavailable, a leak — those go to Issues and `audit.md` too, never into the summary as something to answer.

## The Run footer

Every summary ends with one italic line, whatever the command. It records: the number of WebSearch queries run, any caps hit, any source the run could not reach, and the mode tags (`fast mode`, `auto mode`) when either applies.

```
*4 WebSearch queries · no caps hit · Reddit and Twitter unavailable (no API key) · fast mode*
```

A command's reference file lists the footer as its last section and says nothing about its contents.

## End-of-run terminal output

When a research run finishes, print exactly four sections to the terminal — no preamble, no recap, no congratulations, no fluff:

1. **Answer:** 1–3 sentences answering what the user actually asked. **The Answer block is the answer only — no caveats, no questions, no hedging.** Caveats live in the summary; questions live in Follow-up research ideas.
2. **Issues:** bulleted list of run-time problems (failed fetches, capped sections, deferred items, lint violations, sources that were unavailable, items dropped after a failed output check) and of anything you decided on the user's behalf in auto mode. `Issues: none.` when clean.
3. **Skill + output:** one line. `<command-name> · output: digmore/<topic-slug>/`
4. **Follow-up research ideas:** numbered list (max 10) of one-sentence research questions pulled from the summary's complaints and adjacent-spaces sections.

The Answer block is the same shape for every command. For `ask` it is section 1 of the summary copied verbatim. For `landscape`, `competitor` and `gtm`, compose it at the end of the run against the same rule — answering the request the user actually made, drawn from what the summary already establishes, introducing nothing new.

Nothing else reaches the terminal beyond these four sections and the progress markers above. Detailed findings and audit verdicts live in files.

Everything here is still text, so `output.md`'s writing rules govern how it is written.
