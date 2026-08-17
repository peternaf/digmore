# What reaches the user

What the terminal shows while a run is going and when it finishes, and what never goes in a file. Read this once at the start of a run and once at the end — unlike `output.md`, which is re-read before every piece of text.

**Everything you print is either the research or where the run has got to.** Nothing else reaches the user: not what you are about to do, not why a step is slow, not what you are waiting on, not which tool you reached for, not how you decided. That is your working. A run is judged on what it found, and every line that is not a finding or a position is a line the user has to read past to reach one.

## Progress — one line per step

A run is long. Print one line to the terminal as each step begins, so the user can see where they are and how much is left:

```
[1/5] Scope
[2.1/5] Extract · Search
[2.2/5] Extract · Read
[2.3/5] Extract · Source notes
[3/5] Vet
[4/5] Synthesize
[5/5] Audit
```

- **The counter is always out of 5** — Scope, Extract, Vet, Synthesize, Audit. A phase with sub-steps numbers them after the point — `[2.1/5]` through `[2.3/5]` — so progress inside a phase that runs for an hour is visible without it becoming a sixth phase.
- **Print at the start of the step, not the end**, so the line names what is running now. The next marker is the previous step's completion; there is no "done" line.
- **A step working through a queue against an outside limit says how big the queue is, then counts it down.** Only that shape: a number of items, and a rate you do not control. `[3/5] Vet · 50 handles, ~12 min (Hacker News allows one request per 15s)`, then `[3/5] Vet · 18/50`. It goes on the marker, and it is the whole message.
- **On resume, say what is being skipped**: `[1/5] Scope — already complete, resuming from Vet`. The user needs to know the run did not start over.
- **A step that could not run says so on its own line** and the run continues: `[3/5] Vet — Reddit and Twitter unavailable, no API key`.

## Questions for the user — never in a file

No file a run produces carries a question — not the summary, not `audit.md`, not any section of either.

- **Manual mode** — ask it when it comes up, in chat, and wait. A question is only useful before the work that depends on it.
- **Auto mode** — answer it yourself on the best available evidence and carry on. That is the whole point of the mode: the user is not there, and a run that stops to write questions down has produced homework instead of research.

What survives is the **assumption**, not the question. When you answered something on the user's behalf, say so in the run's Issues below and record it in `audit.md` under assumptions made without the user — one line each, what you assumed and what it changed. A wrong assumption the user can see is a correction they can make on the next run; a question in a file is a run they have to repeat.

Run problems are not questions either. A failed fetch, a capped section, a source that was unavailable, a leak — those go to Issues and `audit.md` too, never into the summary as something to answer.

## The Run footer

Every summary ends with one italic line, whatever the command. It records: the number of WebSearch queries run, any caps hit, any source the run could not reach, and the mode tags (`quick mode`, `auto mode`) when either applies.

```
*4 WebSearch queries · no caps hit · Reddit and Twitter unavailable (no API key) · quick mode*
```

A command's reference file lists the footer as its last section and says nothing about its contents.

## End-of-run terminal output

When a research run finishes, print exactly four sections to the terminal — no preamble, no recap, no congratulations, no fluff:

1. **Answer:** 1–3 sentences answering what the user actually asked. **The Answer block is the answer only — no caveats, no questions, no hedging.** Caveats live in `<topic-slug>.md`; questions live in Follow-up research ideas.
2. **Issues:** bulleted list of run-time problems (failed fetches, capped sections, deferred items, lint violations, sources that were unavailable, items dropped after a failed output check) and of anything you decided on the user's behalf in auto mode. `Issues: none.` when clean.
3. **Skill + output:** one line. `<command-name> · output: digmore/<topic-slug>/`
4. **Follow-up research ideas:** numbered list (max 10) of one-sentence research questions pulled from the summary's complaints and adjacent-spaces sections.

The Answer block is the same shape for every command. For `ask` it is section 1 of `<topic-slug>.md` copied verbatim. For `landscape`, `competitor` and `gtm`, compose it at the end of the run against the same rule — answering the request the user actually made, drawn from what the summary already establishes, introducing nothing new.

Nothing else reaches the terminal beyond these four sections and the progress markers above. Detailed findings and audit verdicts live in files.

Everything here is still text, so `output.md`'s writing rules govern how it is written.
