# Dispatching a sub-agent

Two parts. **The first goes in every dispatch, whatever comes back.** The second is the extra block
for a sub-agent whose return has a shape in `scripts/subagent_returns.json`.

The phase file dispatching one points here; this file names none of them, so a new kind of sub-agent
needs no edit to it. `phases/index.md` says why the shape of a sub-agent is what it is.

## Every dispatch carries this

Nothing here is optional, and nothing is paraphrased — the wording below is the wording that goes in.

```
<THE JOB — one kind of work over one item. See the phase file.>

Do the work inline with the tools you already have: one kind of work over one item, then
return what you found and nothing else. Anything you cannot do yourself is a finding to
report back — never a script to write, an agent to dispatch, or something to wait on.

Your message back carries no prose. No greeting, no summary of what you did, no account
of what you decided or what went wrong. Whatever you were asked to return is the entire
message. Anything you want to say beyond it belongs in the file you write, where the
agent that acts on it will actually read it — a message is read once, by one reader, and
then it is carried for the rest of the run.

Run every command in the foreground and wait for it to finish. Never background one, never
start something and poll it, never spawn a child and wait on it. You receive no completion
notification for anything you start, so whatever you start you wait on forever.

Run each script once. A script that failed has already retried — the 429 backoff is inside
it, three waits and four attempts, and it exits only once those are spent. A non-zero exit
is the answer, not a reason to try again: exit 3 means the source is unavailable right now
and calling it a ninth time changes nothing except how long the run takes. Report what the
command said on stderr and move on.

Run from the directory you were started in. Never cd. Every script builds its own paths
from there as digmore/<slug>/..., so stepping into the topic directory first makes it
nest a second copy inside itself — the scripts now refuse rather than do it silently.

Before each step you take, say what you are about to do:

  node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/runlog.mjs" beat "<what>" \
    --topic <slug> --label <your-label>

That is the whole of it. The script stamps the line with the time — do not stamp it
yourself, do not read the file back, and do not write to it any other way.

Read ${CLAUDE_PLUGIN_ROOT}/skills/digmore/brain/output.md before you write anything you
return. Its rules govern your output as much as the final report.

Scratch files go inside the topic, and their names carry your label. Notes, drafts,
intermediate dumps, anything you write that is not one of your named outputs:

  digmore/<slug>/cache/<source>/<your-label>-<what>.md
  digmore/<slug>/cache/_misc/<your-label>-<what>.md   if it belongs to no source

Never outside digmore/<slug>/, and never a bare name like notes.md or
observations.md. You are one of several agents running at this moment, and an
unlabelled name is one another agent picks too — two agents then write one file and
the second silently overwrites the first. Nothing reads a scratch file, so nothing
reports that.
```

## Name every dispatch after the work, not after a counter

The harness shows a running agent by the name you give it, and that name is the only thing you see
while it works — the URL it is on lives in its heartbeat line, not in the tree. So name it for the
thing a reader would act on:

```
<source> <n> · <the unit of work>
```

| Agent | Name | The unit |
|---|---|---|
| Branch Searcher | `hn 003 · pricing-tiers` | the angle |
| Page Analyst | `hn 016 · pricing-tiers` | the angle its batch of URLs came from |
| Handle Vetter | `reddit 004 · 5 handles` | the batch, on its source |
| Player Profiler | `player 003 · Mux` | the player |
| Claim Fact Checker | `audit 007 · Players ¶2` | the paragraph |

**The angle is what makes it worth reading.** A hundred Page Analysts all say `hn`, and the host
barely varies within a source — but *which angle is expensive* is a decision you can act on, by
dropping it or narrowing it. It arrives in the dispatch already: the Page Analyst is given its
branch label for exactly this reason.

**Where an agent takes a batch, the name says what the batch is, never lists it.** Five URLs do not
fit and would not help; the branch's angle is the thing to act on. Which items a batch actually held
is in its heartbeat, which names them one at a time as it starts them.

**`<n>` counts across the run, never within a wave.** It is what matches a live agent in the tree to
its `_progress` file and its `_returns` copy, so restarting it per batch makes three agents answer to
one number and the match stops working.

**The last two lines used to live in the block below**, which only agents returning a shape ever
received — so an agent that returns prose or edits a file in place silently got neither. Both are
exactly as necessary there: an agent that writes to disk and returns nothing is one of the longest
silences in a run, and an agent whose product *is* prose is the one that most needs the writing rules.
They are here now, and no phase file writes them in by hand any more.

## When a dispatch produces a shape, add this

**Send this block whenever the job produces JSON at all — returned, written to a file, or both.** It
is the only place an agent is given the schema, so the test is whether a shape comes out of the
dispatch, never which route it takes out.

Three routes, all of them qualifying:

| The agent | Route | Example |
|---|---|---|
| returns the shape, writes a copy | both | most of them |
| returns `done`, writes the shape | file only | Branch Searcher, Page Analyst |
| returns the shape, writes nothing | message only | Handle Vetter |

**Both narrower tests break, and each breaks a different agent.** "Returns a shape" drops the two
that reply `done`, leaving them told to write a file with no schema and no path. "Writes a shape"
drops the Handle Vetter, which writes no copy on purpose. Either way an agent is asked for JSON and
never shown its shape.

Where an agent returns `done`, its own entry says so and the first line below changes to match: write
the JSON, return the word, nothing else. Everything after it is unchanged.

```
Return exactly this JSON and nothing else, and write the same JSON to
digmore/<slug>/cache/_returns/<your-label>.json:

<THE SHAPE — verbatim, from `validate.mjs --shape <name>`.>

<THE FORMAT SPEC — only where the job produces formatted output. The column rules, cell
format and worked example from the command's reference file, verbatim. A sub-agent
pointed at a file instead of given the spec defaults to the shortest plausible content.>
```

| Slot | Where it comes from |
|---|---|
| The job | The phase file dispatching it — one item, named. |
| The shape | **Print it, do not open the file:** `node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/validate.mjs" --shape <name>`. Paste the whole entry; its `description` says what the shape is for. `--shapes` lists the names. |
| The format spec | The command's reference file, and only for agents that render a section of the summary. |

**A `_returns/` file is written because `validate.mjs` reads a file, not a message.** For the two
agents that return `done` it is not a copy at all — it is the only place their output exists, which is
what makes the one-word return honest rather than lossy.

**The one deliberate exception is the Handle Vetter**: it fans out a batch at a time, its return is
short and its verdicts have to reach the orchestrator to be written into `<source>-handles.json`,
which is where the gate is — so it writes no copy and is checked over stdin instead,
`validate.mjs source-handles -`.

## Then check what comes back

Every payload gets checked before anything is built on it:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/validate.mjs" <shape> digmore/<slug>/cache/_returns/<label>.json
```

**`<shape>` is a key in `scripts/subagent_returns.json`**, and that file is the list — run
`validate.mjs --shapes` to print it rather than keeping a copy here, which is how the copy in this
file went stale.

**Some shapes are checked as files rather than as returns**, because they never enter your context at
all: what a Page Analyst writes beside its stripped page, what a Source Analyst writes for the phases
after it, and the claim index. Same command, pointed at the file the agent wrote rather than at
`_returns/`. Each shape's `description` says which it is.

Exit 0 means use it. Exit 1 prints the problems, one line each, already worded to be pasted at the
sub-agent. Exit 2 means the payload was not JSON at all, or the call was wrong — there is no document
to repair, so treat it as a failed return.

**What it checks:** the keys that must be there, the JSON type of each one, allowed enum values, array
and number bounds, and the conditional requirements a shape declares. **What it does not check:**
whether a quote is real, whether a URL resolves, whether a price is a price. A payload that passes is
well-formed, not true.

**A CSV and a markdown document cannot be checked this way at all** — the script reads JSON against a
shape and nothing else. The agents that write those re-read their own output against the file that
says what the right answer is; that is a prose check rather than a gate, and the agents' own files say
so rather than implying otherwise.

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
forever, and `subagents.repairAttempts` in `~/.digmore/settings.json` is 1 so the limit is a fact
rather than a judgement call.

**Where a return is an array, the item is one entry, not the dispatch.** A Page Analyst hands back one
receipt per URL in its batch, so a single malformed receipt is dropped and the rest stand — the agent
had already written every page and its claims to disk before returning, which is what makes that
survivable: what a dropped receipt costs is the branch's fetch tally and that URL's line in
`audit.md`, not the evidence. `extract_phase_b.md` §"What comes back" carries it.

Count the repairs and the drops per run in `audit.md` (`phases/audit_phase_f.md`). A shape that needs
repairing on most returns is a broken dispatch prompt, and that is only visible if the number is
written down.

## Count them

Every dispatch counts toward the run's total, recorded in `audit.md` split by agent kind. A full run
reaches into the hundreds — one per branch, one per batch of URLs read, one per batch of handles vetted, one per player
profiled, one per paragraph fact-checked, plus the writing and review passes — and the number is only
knowable after the fact if it is written down.
