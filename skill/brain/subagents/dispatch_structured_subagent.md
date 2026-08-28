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

That covers editing a file as much as anything else. To change a file you already have,
use the edit tool on it. Never write a .py or .mjs to transform it, and never pipe it
through python3, node -e, sed or a shell heredoc: a document holding URLs, quotes and
backticks is a document the shell reparses, and the failures are silent ones you then
spend turns chasing.

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

Run from the directory you were started in. Never cd, and write every path relative to
it — digmore/<slug>/..., never C:/dev/... or /Users/... Every script builds its own paths
that way, so stepping into the topic directory first makes it nest a second copy inside
itself; the scripts now refuse rather than do it silently.

Never mkdir either. Every script creates the directories it needs on the way, and so
does the tool you write a file with. A mkdir asks the user to approve a directory that
already exists, and an agent that opens by scaffolding reads as one that does not know
where it is.

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

This overrides the scratchpad directory your harness told you to use. That
instruction is a general one about not littering the machine; this is the specific
one, and the specific one wins. A run's working files have to sit with the run:
resume looks for them under the topic, the user's own tooling looks there, and a
temp directory keyed to a session is gone the moment the session is. Whatever path
your harness named for temporary files, do not use it here.
```

## Send the agent its own files

**Every dispatch names the path to the agent's own `<agent>.md`, and to its `<source>.md` where it
has one.** `brain/index.md` §Sub-agents says an agent is sent its own file and the file for the
source it was given and nothing else; this is the instruction that principle never got.

**A sub-agent has what its prompt gives it and nothing else.** A path in the prompt is what makes a
file openable — without one there is no way to reach it, and **no error when it is not reached.** So
every *Input rule files* row in every agent's file describes something that happens only if the
dispatch carried those paths.

**Vet is where it costs most, and Vet is where it was missing.** That phase deliberately holds none
of its own judgement — the verdict vocabulary, the topical-relevance read, the per-source signals and
the Twitter voice rubric all live in `handle_vetter_agent/`. A vetter dispatched without those paths
is judging thirty-odd ranges of handles against nothing, and hands back verdicts that look exactly
like judged ones.

`fetching.md` goes with them on the two agents that fetch, and `output.md` is already in the standing
block above.

**Pass the agent's `Model` from `brain/index.md` §Sub-agents as the dispatch's `model`** — `inherit`,
which is most of them, means pass none.

## A dispatch never restates what the agent's own file says

The job slot says **what work, over which item, with which per-dispatch values**, and stops. How to
judge, which command to run, what a field means, how a page is fetched — all of that is in the files
the agent opens, and repeating it in the prompt buys nothing and costs you the words on every
dispatch.

**And when a rule has to reach the agent, it goes in the agent's file — not into the prompt that
carries it.** A rule pasted into a dispatch exists only for as long as someone remembers to paste it,
and it is paid for every time. `AGENTS.md`'s one-place rule already governs the repo; this is the
same rule at run time.

**Three things stay pasted, and they are the whole list:**

| Pasted | Why it is the exception |
|---|---|
| the standing block above | its rules failed *before* precisely because they lived in files agents never read. Naming a path is a stronger position than that was, but it is untested, and these are the rules whose omission is silent |
| the format spec | an agent pointed at a file instead of given the spec defaults to the shortest plausible content, and nothing catches that |
| any configuration number | an agent cannot follow a pointer to what `preflight.mjs` printed, so it is given the value |

Everything else is a path.

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
| returns `done`, writes the shape | file only | Branch Searcher, Page Analyst, Handle Vetter |

**Say it by route-independence even so.** "Returns a shape" drops the three that reply `done`,
leaving them told to write a file with no schema and no path. "Writes a shape" happens to drop
nobody today — the Handle Vetter was the one agent that returned its shape and wrote no file, and it
now writes one per handle — but the next agent that returns without writing would fall through the
same gap, and the test costs nothing to state the durable way round.

Where an agent returns `done`, its own entry says so and the first line below changes to match: write
the JSON, return the word, nothing else. Everything after it is unchanged.

```
Your return is the shape <SHAPE NAME>. Print it before you start, and follow it exactly:

  node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/validate.mjs" --shape <SHAPE NAME>

Return exactly that JSON and nothing else, and write the same JSON to
digmore/<slug>/cache/_returns/<your-label>.json.

Then check the file you wrote, and do not return until it passes:

  node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/validate.mjs" <SHAPE NAME> \
    digmore/<slug>/cache/_returns/<your-label>.json

Exit 0 and you are done. Exit 1 prints one line per problem: fix what you wrote, write
it again, and run the check once more. One repair and one re-check, never a loop.

Fixing means fixing the structure. Do not search, fetch or research again — this is a
formatting correction, not another pass at the work. And where a required field has no
value in what you read, say so and leave the item out. Never fill one to make the check
pass: that is how a missing quote becomes an invented quote, and an invented quote
passes every check there is.

Where your shape is an array, one bad entry is one entry. Drop that entry, keep the
rest, re-check — never discard the whole file for it.

Still failing after that one repair, or exit 2, which means what you wrote was not JSON
at all: record it and say so in your return rather than returning a file you know is
wrong.

  node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/runlog.mjs" finding subagent-drop \
    "<SHAPE NAME> from <your-label>: <the errors>" --topic <slug>

Where the repair worked, record that too, with the same command and the category
subagent-repair. A shape that needs repairing on most dispatches is a broken prompt,
and nobody can see that unless the attempts are written down.

<THE FORMAT SPEC — only where the job produces formatted output. The column rules, cell
format and worked example from the command's reference file, verbatim. A sub-agent
pointed at a file instead of given the spec defaults to the shortest plausible content,
and nothing downstream catches that — which is why this one is pasted and the shape is
not.>
```

| Slot | Where it comes from |
|---|---|
| The job | The phase file dispatching it — one item, named. |
| The shape name | A key in `scripts/subagent_returns.json`. **Name it; do not paste it.** `validate.mjs --shapes` lists them. |
| The format spec | The command's reference file, and only for agents that render a section of the summary. |

**The agent prints its own shape, and that is worth roughly 250 dispatches of schema.** An entry runs
300 to 500 tokens, and the repeated agents carry it over and over — `page-analyst` around 108 times
once its URLs are batched, `player-profile` ~47, `handle-vetting` ~40, `claim-fact-checker` ~30,
`branch-searcher` 27. Pasted, every one of those lands in **your** transcript and stays there for the
rest of the run; printed by the agent, it costs the agent one command and costs you nothing.

**Omitting it is still the one thing that gets caught — now by the agent itself.** A pasted *rule* an
agent skips fails silently: no heartbeat file, a scratch file at a name another agent also picks,
prose in the return. A skipped `--shape` produces the wrong shape, and the agent's own
`validate.mjs` call says so on the next line, with one repair and then a recorded drop. The gate is
self-administered, and what makes that hold is that it is mechanical: its verdict is an exit code
rather than a judgement, so an agent cannot talk itself past it the way it can past a rule.

**A `_returns/` file is written because `validate.mjs` reads a file, not a message.** For the agents
that return `done` it is not a copy at all — it is the only place their output exists, which is what
makes the one-word return honest rather than lossy.

**The Handle Vetter writes somewhere else, and that is the only variation.** Its output is one file
per handle under `cache/<source>/handles/`, not one per dispatch under `_returns/`, because a range
of handles produces a verdict each and a resumed run needs to know which of them finished. So it runs
the check below once per handle rather than once per dispatch. Nothing is checked over stdin
anywhere in the run.

## Whoever writes a JSON validates it

**The agent checked its own file before returning** — the block above carries the call, the one
repair, the array rule and the two `runlog.mjs finding` records. **You run no `validate.mjs` on a
return, in any phase.** It used to be one call per dispatch, ~280 in a full run, each serialised in
your thread and each staying in your transcript.

**You are inside the rule rather than outside it.** `research_plan.json` is the one JSON you write
yourself, and it is checked the same way — `plan_phase_a.md` after the identity write and after
`scope`, `audit_phase_f.md` §`[6.8/6]` after `phases_completed`.

**Scripts are outside it.** `players.mjs candidates`, `handle_vetting.mjs prepare` and `aggregate`,
`synthesis.mjs join` write JSON and validate none of it: a script's shape is fixed in code and
covered by the tests, and this rule exists because a model drifts where a script does not.

**What passing means, since you act on it without seeing it.** The checker reads structure — required
keys, JSON types, enum values, array and number bounds, the conditional requirements a shape
declares, and where a shape names a key it is unique on, that no two entries share it. It says
nothing about whether a quote is real, a URL resolves or a price is a price. **A payload that passed
is well-formed, not true.**

**What is left for you is the failure the agent reports.** A dispatch that comes back saying its file
could not be made to satisfy the shape has already recorded `subagent-drop`. Drop that item, name it
in the run's Issues, and carry on — **never re-dispatch it**: `subagents.repairAttempts` is 1 and the
agent has already spent it. A second repair from here is the unbounded loop the limit exists to
prevent.

**A CSV and a markdown document are checked by nobody** — the script reads JSON against a shape and
nothing else. The agents that write those re-read their own output against the file that says what
the right answer is; that is a prose check rather than a gate, and their own files say so rather than
implying otherwise.

## Count them

Every dispatch counts toward the run's total, recorded in `audit.md` split by agent kind. A full run
reaches into the hundreds — one per branch, one per batch of URLs read, one per batch of handles vetted, one per player
profiled, one per paragraph fact-checked, plus the writing and review passes — and the number is only
knowable after the fact if it is written down.

**The repairs and the drops are already in there** and are not yours to tally: each agent records its
own as `subagent-repair` or `subagent-drop` at the moment it happens. What the numbers are for is
unchanged — a shape that needs repairing on most dispatches is a broken prompt, and that is only
visible if the attempts are written down.
