# Dispatching a structured sub-agent

The prompt for a sub-agent that **returns structured output** — anything whose return has a shape in `schemas.md`. Assembled here so a dispatch is one read instead of four. `phases/index.md` says why the shape is what it is.

The phase file dispatching one points here; this file names none of them, so a new kind of structured sub-agent needs no edit to it.

**It does not apply to a sub-agent that returns no shape** — one writing prose to its own file, or editing the draft summary in place. There is no block to paste, nothing to write to `_returns/`, and nothing for `validate.mjs` to check. Those carry their instructions in the phase file that dispatches them.

## The template

Fill the three slots and send it. Nothing is optional, and nothing is paraphrased — the wording below is the wording that goes in.

```
<THE JOB — one kind of work over one item. See the phase file.>

Do the work inline with the tools you already have: one kind of work over one item, then
return what you found. Log a line before each step. Anything you cannot do yourself is a
finding to report back — never a script to write, an agent to dispatch, or something to
wait on.

Run from the directory you were started in. Never cd. Every script builds its own paths
from there as digmore/<slug>/..., so stepping into the topic directory first makes it
nest a second copy inside itself — the scripts now refuse rather than do it silently.

Before each step you take, append one line to
digmore/<slug>/cache/_progress/<your-label>.log: the time, and what you are about to do.

Read ${CLAUDE_PLUGIN_ROOT}/skills/digmore/brain/output.md before you write anything you
return. Its rules govern your output as much as the final report.

Return exactly this JSON, and write the same JSON to
digmore/<slug>/cache/_returns/<your-label>.json:

<THE SHAPE — the matching block from schemas.md, verbatim.>

<THE FORMAT SPEC — only where the job produces formatted output. The column rules, cell
format and worked example from the command's reference file, verbatim. A sub-agent
pointed at a file instead of given the spec defaults to the shortest plausible content.>
```

## The three slots

| Slot | Where it comes from |
|---|---|
| The job | The phase file dispatching it — one item, named. |
| The shape | `schemas.md`, the block matching what this agent returns. |
| The format spec | The command's reference file, and only for agents that produce formatted output — today the synthesizer. |

## Then check what comes back

The return is not usable until it passes `scripts/validate.mjs`. One repair attempt, then the item is dropped and recorded. `schemas.md` §"Checking what comes back" has the command line, the repair prompt and the drop rule.

## Count them

Every dispatch counts toward the run's total, recorded in `audit.md` (`phases/audit_phase_e.md` §5). A full run reaches into the hundreds — one per source × angle, one per URL read, one per claim verified, plus the review passes — and the number is only knowable after the fact if it is written down.
