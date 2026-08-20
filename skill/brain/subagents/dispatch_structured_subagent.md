# Dispatching a structured sub-agent

The prompt for a sub-agent that **returns structured output** — anything whose return has a shape in `scripts/subagent_returns.json`. Assembled here so a dispatch is one read instead of four. `phases/index.md` says why the shape is what it is.

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

<THE SHAPE — the matching entry from scripts/subagent_returns.json, verbatim.>

<THE FORMAT SPEC — only where the job produces formatted output. The column rules, cell
format and worked example from the command's reference file, verbatim. A sub-agent
pointed at a file instead of given the spec defaults to the shortest plausible content.>
```

## The three slots

| Slot | Where it comes from |
|---|---|
| The job | The phase file dispatching it — one item, named. |
| The shape | `scripts/subagent_returns.json`, the entry matching what this agent returns. Its `description` says what the shape is for; paste the whole entry. |
| The format spec | The command's reference file, and only for agents that produce formatted output — today the synthesizer. |

## Then check what comes back

Every payload gets checked before anything is built on it. Write the sub-agent's returned JSON to
`digmore/<slug>/cache/_returns/<label>.json`, then:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/validate.mjs" <shape> digmore/<slug>/cache/_returns/<label>.json
```

`<shape>` is the key in `scripts/subagent_returns.json`: `scope`, `branch-searcher`,
`page-analyst`, `vet-judgment`, `synthesizer`, `verifier`.

Two shapes are checked as **files rather than returns**, because they never enter the orchestrator's
context: `page-claims`, which every Page Analyst writes beside its stripped page, and
`handle-roster`, which each Source Analyst writes for Vet to work from. Same command, pointed at the
file the agent wrote rather than at `_returns/`.

Exit 0 means use it. Exit 1 prints the problems, one line each, already worded to be pasted at the
sub-agent. Exit 2 means the payload was not JSON at all, or the call was wrong — there is no
document to repair, so treat it as a failed return.

**What it checks:** the keys that must be there, the JSON type of each one, allowed enum values,
array and number bounds, and the one conditional rule in the page-claims shape. **What it
does not check:** whether a quote is real, whether a URL resolves, whether a price is a price.
Those are the audit phase and, later, typed fields. A payload that passes is well-formed, not true.

### The repair pass — one attempt, then drop

On exit 1, re-prompt **the same sub-agent** once. The repair prompt carries three things and
nothing else:

1. the checker's exact errors,
2. the shape it should have matched,
3. its own previous output.

And it carries these two instructions, in these words:

> Fix the structure of what you already returned. Do not search, fetch, or research again — this is
> a formatting correction, not another pass at the work.

> If a required field has no value in the source you read, say so and leave the item out. Do not
> fill it to make the check pass.

That second one is the point. Repair pressure is how a missing quote becomes an invented quote, and
an invented quote passes every check there is.

Re-check the repaired payload. Still failing → **drop that item**, name it in the run's Issues, and
record it in `audit.md`. Never a second repair: a fix-and-recheck loop that can run twice can run
forever, and `subagents.repairAttempts` in `~/.digmore/settings.json` is 1 so the limit is a fact rather than a judgement
call.

Count the repairs and the drops per run in `audit.md` (`phases/audit_phase_e.md` §5). A shape that
needs repairing on most returns is a broken dispatch prompt, and that is only visible if the number
is written down.

## Count them

Every dispatch counts toward the run's total, recorded in `audit.md` (`phases/audit_phase_e.md` §5). A full run reaches into the hundreds — one per source × angle, one per URL read, one per claim verified, plus the review passes — and the number is only knowable after the fact if it is written down.
