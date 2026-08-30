# Scoping agent

| Field | |
|---|---|
| **Phase** | Plan `[1/6]` |
| **Purpose** | Find out what the subject actually is before the run commits to searching it — the words its own people use, the names that keep coming up — and turn that into the angles every later search is built on |
| **Input text** | the topic as the user phrased it · the mode's angle count · the job: find what this subject actually is, then decompose it into angles. **Explicitly not the sections** |
| **Input rule files** | `subagents/scoping_agent.md` · `output.md` |
| **Input data files** | none |
| **Runs** | WebSearch, up to `plan.scopingSearches` calls · `validate.mjs` on the return it writes, one repair and one re-check. No other scripts, and it reads no files |
| **Settings that control it** | `plan.scopingSearches` — **this agent enforces it**, counting its own calls. `plan.minAngles` and `plan.maxAngles` bound what it returns; it is told the count and the orchestrator checks it in `plan_phase_a.md` §4. `subagents.repairAttempts` — **this agent enforces it**, on the file it writes: one repair, one revalidation, then it reports a failure |
| **Held in its context** | everything it read on the open web. Reading a great deal to hand back a little is the whole reason this is a sub-agent |
| **Returns to main context** | the `scope` shape — the vocabulary, the recurring names, and the angles, each with a kebab-case label, a search-ready query and a rationale |
| **Writes to disk** | **nothing it fetched** — what it read on the open web is not kept. `cache/_returns/scoping-agent.json`, a copy of what it returned, on disk because `validate.mjs` reads a file rather than a message |
| **Logs** | `cache/_progress/scoping-agent.log` — `searching <query>`, one per WebSearch call |
| **How it reports failure** | a subject it could not pin down comes back with the angles it can defend and says so in their rationales. It never pads the set to reach the minimum |
| **One dispatch per** | the topic |
| **Run instances** | 1 |
| **`--fast`** | 1 — `plan.minAngles` and `plan.maxAngles` both drop, and there is less looking behind them |
| **Concurrency** | n/a — single |
| **Model tier** | set in `brain/index.md` §Sub-agents, which is where the orchestrator reads it |

Where it sits: the orchestrator has settled which topic this is and what the user asked for. What
you return decides what the whole run goes and reads, and shapes how the answer gets presented.
Nothing downstream can tell whether you got it right.

## What this agent does

**Find out what the subject actually is, then turn that into the angles the run will search.**

Two things, in that order:

1. **Look at the subject.** Search the open web until you can say what these people call things and
   who keeps coming up. The vocabulary matters most — every branch query the run issues is written
   in the words you return, so the words have to be theirs, not the generic ones a market description
   would use.
2. **Decompose it into angles.** between `plan.minAngles` and `plan.maxAngles`, both printed by `preflight.mjs`. Each angle is one
   research direction, built on what you just found.

   **The maximum is a ceiling, not a target.** Return the number the topic actually has — a question
   with three real directions gets three, and padding it to the ceiling invents angles nobody asked
   about, spends a branch on each of them against every source, and dilutes the report with material
   the reader did not want. Reach the maximum only where the topic genuinely splits that many ways.

## Search budget

**`plan.scopingSearches` WebSearch calls, 10 by default.** `preflight.mjs` prints the number this run
applies — read it there, and never substitute one of your own. This is the only search in the run
that happens before the plan exists, so it runs against the session's ceiling with nothing else
bounding it.

## What you return

The `scope` shape from `../../scripts/subagent_returns.json`:

```json
{
  "queries": ["…"],
  "vocabulary": ["…"],
  "recurring_names": ["…"],
  "angles": [{"label": "kebab-case", "query": "…", "rationale": "…"}]
}
```

- **`queries`** — the searches you actually ran, so the route to the answer is on the record.
- **`vocabulary`** — the terms the subject's own people use. Every later branch query inherits this
  wording.
- **`recurring_names`** — companies, projects, products or people that came up repeatedly.
- **`angles`** — `label` is kebab-case and names the branch, its log file and its records, so it is
  load-bearing. `query` is search-ready and written in the vocabulary above. `rationale` says why
  this angle matters for this request, and the user reads it when the plan is presented.

## Where the angles stop

The angles are yours. The **sections** of the summary are not — deciding those needs the command's
reference file and, in manual mode, the user, and this dispatch has neither.

The two are one chain: you settle the vocabulary, the names and the angles; the orchestrator then
decides the deliverables and sections from all three (`../phases/plan_phase_a.md` §3). Your half
comes first and everything else is built on it.

## What makes an angle usable

The orchestrator checks three things and sends the set back once if any fails
(`../phases/plan_phase_a.md` §4):

- **Written in the subject's vocabulary**, not in generic market language. `incumbents`, `pricing`,
  `pain points` are true of every market and useful for none — they are what comes out when the
  angles are written without looking first, which is the failure this whole step exists to prevent.
- **Labels unique and kebab-case.**
- **The right count for the mode** — between `plan.minAngles` and `plan.maxAngles`. `ask` sets its own
  (`../modes.md`).

## What lands on disk

Nothing you read. The open web you searched is not kept — that is why this is a sub-agent: it reads
a great deal to hand back a little, and none of the reading is worth carrying for the rest of the
run.

`digmore/<slug>/cache/_returns/scoping-agent.json` holds a copy of what you returned.

## Writing style

`../output.md`, before anything you return. The `rationale` on each angle reaches the user.
