# Plan

Print `[1/6] Plan` when this phase starts (`../reporting.md`).

This phase settles two things and writes them to one file: **which topic this is**, and **what the run will go looking for**. Every later phase inherits both.

Almost all of it is yours. One sub-agent is dispatched, to scout the subject — see below for why the split falls there.

## 1. The topic — identity, slug, and how this run relates to earlier ones

Identity first, because the angles are built for a subject and the file they land in is named after it.

A research topic is the working unit: a kebab-case directory name, a human-readable title, and state that persists across runs. Topics form **chains** — the user reads one output, spots an adjacent area, and starts a new topic that builds on the last. A session is often 3–10 related topics rather than one, so detecting that is part of this step.

This part cannot be a sub-agent: it talks to the user, and a sub-agent has no channel to them.

### Slug the topic

1. **Underspecified topics get questions, not guesses.** "video stuff", with no buyer, use-case or domain anchor, is underspecified. In manual mode ask 2–3 clarifying questions before slugging; the refined topic is what gets slugged. In `--auto` answer them yourself from what you can see, slug on that, and record the reading you took in the run's Issues. See `../modes.md`.
2. List existing topics under `digmore/` to detect re-run or branching cases the user did not name explicitly.
3. **State what you detected — fresh / re-run / branched from a parent, the slug, the parent, the mode — and then stop only if you chose something the user did not.** In manual mode, that means waiting for a go-ahead when, and only when, one of these is true:
   - a parent was picked from more than one candidate topic;
   - the run is being treated as a re-run or a branch and the user did not say so;
   - the topic stayed underspecified after the questions in step 1.

   Otherwise say what you detected in a line or two and go straight into §2. A confirmation that only ever repeats what the user typed teaches them to say yes without reading, which is the state in which a wrong parent slips through.

   This stop is separate from §3.1, which shows the finished plan and always waits. This one is about the topic; that one is about what the run will go and read.

   In auto mode there is no stop at all: state the reading, proceed, and record it in the run's Issues.

Slug rules:
- Kebab-case, ASCII only, no leading/trailing dashes.
- 2–5 words is the sweet spot. `video-api-providers` beats `v` beats `video-api-providers-b2b-deep-research-2026-06`.
- Include the key disambiguating dimension when there is one — `video-api-providers` vs. `video-api-providers-b2b` if you anticipate a sibling B2C topic.

### Three flows beyond a fresh topic

1. **Incremental update of an existing topic.** The user extends `experts.csv`, or experts were auto-added by an earlier run. Re-running re-vets old datapoints against the new expert list and surfaces new datapoints introduced by those experts.

2. **Branched topic.** A new related topic spins off from a parent. The child inherits the parent's `experts.csv` **by copy at the moment of branching** — copy `parent/experts.csv` into the new topic's directory. The child can then diverge without affecting the parent, and `parent_slug` records the link. Cached data may also be copied where you judge it relevant. What carries over from the parent's `players.csv` is Synthesize's business — see `synthesize_phase_e.md` §1.

3. **Chained follow-up.** Same as branched, but driven by the user's own read-through of the parent's summary. The user decides what is worth a follow-up; do not pre-suggest one.

### Write identity

Write `slug`, `title`, `kind`, `created_at`, `parent_slug` and `originating_prompt` into `research_plan.json`, and append this run's entry to `run_history`. Full field list below.

**Then check it**, because this is a JSON you wrote and every writer checks its own
(`../subagents/dispatch_structured_subagent.md` §"Whoever writes a JSON validates it"):

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/validate.mjs" research-plan \
  digmore/<slug>/research_plan.json
```

One repair, one re-check, then stop and say what is wrong — **do not start Extract on a plan that
failed its check.** `scope` is legitimately absent at this point and the shape does not require it;
everything else is what the rest of the run reads.

## 2. The angles — the one sub-agent

Do not write the angles out of what you already know: written cold they come out as `incumbents`,
`pricing`, `pain points` — true of every market, useful for none. The subject has to be looked at
first.

Dispatch **ONE Scoping agent**, per `../subagents/dispatch_structured_subagent.md`. It goes out to the open
web — unbudgeted here — and returns the `scope` shape (see `../../scripts/subagent_returns.json`):
the vocabulary the subject's own people use, the names that recur, and the angles built from them.

It is a sub-agent for one reason: it reads a lot of the open web to produce a short answer, and none
of that raw reading is worth carrying for the rest of the run. What comes back is small; what it
read is not.

**Tell it what an angle costs, in the numbers this run will actually spend.** An angle is not one
unit of work: it becomes **one branch per available source**, and each branch reads up to
`extract.fetchesPerBranch` pages. So the dispatch carries the arithmetic —

> Each angle becomes one branch per source. This run has <n> sources and spends up to
> <extract.fetchesPerBranch> fetches per branch, so each angle costs about <n × fetches> pages.

— with the source count you settled and the number `preflight.mjs` printed. Without it the agent is
told to return "between `minAngles` and `maxAngles`" and has no way to see that the top of that range
is several times the work of the bottom, so it returns the ceiling every time. §"The maximum is a
ceiling, not a target" in its own file says the same thing in words, and words alone have not held.

**It returns the angles and stops there.** The sections are not its call — deciding them needs the
command's reference file and, in manual mode, the user, and it has neither.

Record what came back in `research_plan.json` under `scope`. In `--fast` there is less time for
this, not none.

## 3. The sections the summary will have — yours, not the agent's

**Do not plan the observation section.** Every summary ends with "LLM free-flow observations", it is
the same in every command, and it is not in `scope.deliverables` — `sections.md` states it and the
Final report writer adds it. Planning it would put it in the section list twice.

Decide the whole section list, in order, and record it as `scope.deliverables` — the key is the
section's title, the value says what belongs in it. Rules and types in `../sections.md`.

**Decide it from everything the Scoping agent returned, not just the angles** — the vocabulary tells
you what these people call things, and the recurring names tell you who and what the summary will
have to account for. A section list built from the angles alone is built from a third of what you
were given.

**Predefined first, in the command's order.** Each one's value is a pointer to the file that defines
it, and nothing about its shape is repeated: `"Tactics inventory": "reference/gtm-teardown.md §1.4"`.

**The Run footer is not a deliverable and never appears here.** It is the orchestrator's own
bookkeeping — WebSearch queries run, caps hit, sources the run could not reach, the mode tags — and
none of it exists in the claim set. It is appended to the finished summary at Audit's Record step,
after the last agent has touched the file (`../reporting.md` §"The Run footer"). Listed as a
deliverable it would be a section the Final report writer is told to write and cannot fill, and one
the Final report reviewer then reports missing on every run. The command reference files still list
it as their last section, which describes the finished document rather than the writer's brief.

**Then anything this run adds.** A section the command does not have, because this request wants it.
Its value is `{"type": ..., "description": ...}`, and if it is enumerable — a `list` or a `chart` —
`scope.sections` carries the rest of its spec: what a row is, the fields, the sort, how it renders.
An enumerable section without that is not usable; see `../sections.md`.

This matters because the rest of the pipeline is built for prose. Extract mines claims, Vet judges
handles, Audit checks claims against sources — all of it assumes the answer is an argument. A list
that is never declared here gets narrated as a paragraph at the end, and the user is handed twelve
communities they cannot reach. Declaring it is what makes the list a list.

## 3.1. Show the plan before running it

**Manual mode: ask with `AskUserQuestion`, in one call. Not a paragraph.**

This used to print a sentence naming the angles and the sources and end with "go ahead, or change an
angle or a source". It reliably got waved through. **Prose plus a free-text yes is the shape a reader
skims**, and composing "drop the third angle and add forums" is enough work that nobody does it —
so the plan the run executed was the plan nobody read. Options force a read, because answering means
choosing, and dropping two angles becomes two clicks.

Three questions, one call, every one of them **multi-select with everything pre-selected**, so
answering nothing changes nothing and the user only acts where they disagree:

| Question | Options | Header |
|---|---|---|
| Which angles should the run cover? | one per angle, its `label` and a few words of its `rationale` | `Angles` |
| Which sources should it search? | one per source available this run — the ones without a key are not offered | `Sources` |
| Which sections should the summary have? | one per entry in `scope.deliverables`, in order | `Sections` |

**Say what is non-standard beside the choices, not instead of them.** A predefined section dropped,
or one added that the request did not name, is a fact readable off `scope.deliverables` — put it in
that option's `description` ("not in the standard `gtm` set") so it is visible at the moment of
choosing. The old rule said to mention only the difference and stay silent otherwise; that is what
left the section list unreviewable on every ordinary run.

**Rewording is "Other".** The options settle what is in and what is out; an angle whose wording is
wrong comes back as free text, which is the one case that genuinely needs a sentence.

**Nothing else goes in this call.** Not the depth, not the mode, not the topic — the topic was
settled at §1 and asking twice teaches the user that these questions do not matter.

**In `--auto` there is no call and no wait.** State the angles, the sources and any non-standard
section in a line, record it in the run's Issues, and proceed.

## 4. Angles — check what came back

The angles are the Scoping agent's, but they are yours to accept. Nothing downstream can tell whether
they were right: every branch query in the run is written from them, and a bad angle returns a full
set of plausible results about the wrong thing.

**Three faults are visible without re-searching:**

- **It is written in generic market language** rather than in the vocabulary the agent just
  returned. That is the failure the whole step exists to prevent.
- **Its `label` collides with another**, or is not kebab-case. The label names the branch, its log
  file and its records.
- **The count is wrong for the mode** — between `plan.minAngles` and `plan.maxAngles`, both printed by `preflight.mjs`; `ask` sets its own
  (`../modes.md`).

**Then read them and ask whether the set makes sense.** The three checks above are mechanical and a
set can pass all of them and still be wrong. Read each angle against the request the user actually
made:

- **Does this angle answer part of the question?** An angle that is interesting about the subject but
  answers nothing the user asked is a branch spent on the wrong thing.
- **Do they overlap?** Two angles that would return the same pages are one angle and a wasted set of
  branches.
- **Is anything obviously missing?** A `gtm` run with no angle on reception, a `competitor` run with
  no angle on pricing — the gap is visible from the request, not from the results.
- **Does the vocabulary actually belong to this subject?** The agent returns the words it found; if
  they read like the words anyone would have guessed, it did not look hard enough.

Send the set back once if any of the three faults hold or if this read fails, per
`../subagents/dispatch_structured_subagent.md`, saying which angle and why. Do not quietly rewrite
them: an angle you wrote yourself is one the agent's reading no longer stands behind.

## 5. Branches

Each angle is paired with every **available** source, and each pair is a **branch** — the unit Extract works in. `pricing × websearch` is a branch; so is `pricing × reddit`.

Available means available on this run. Reddit and Twitter need an API key, so with no key no branch is built on them — the plan reflects what the run can actually reach, rather than promising sources it will later report as missing.

`local` joins only when the user handed something over.

## `research_plan.json` — the file this phase builds

One file for the topic and the plan. Identity at the top level, history beside it, this run's plan under `scope`. Plan owns this file; the later phases read it.

```json
{
  "slug": "video-api-providers",
  "title": "Video API providers landscape (B2B)",
  "kind": "landscape",
  "created_at": "2026-06-10T15:30:00Z",
  "parent_slug": "video-infra-overview",
  "originating_prompt": "research B2B video API providers — pricing tiers and recent moves",
  "run_history": [
    {"ts": "2026-06-10T15:30:00Z", "kind": "fresh", "prompt": "…", "mode": "manual, full", "configurations": {"extract": {"fetchesPerBranch": 10, "maxPagesPerDocument": 5, "urlsPerDispatch": 5}, "vet": {"handleCapPerSource": 20, "handlesPerDispatch": 10}, "enrich": {"expertsFollowed": 5, "urlsPerExpert": 10}, "audit": {"paragraphsPerDispatch": 5}}, "phases_completed": "plan,extract,vet,enrichment,synthesize,audit"},
    {"ts": "2026-06-12T10:00:00Z", "kind": "re-run", "prompt": "…", "mode": "auto, fast", "configurations": {"extract": {"fetchesPerBranch": 5, "maxPagesPerDocument": 5, "urlsPerDispatch": 5}, "vet": {"handleCapPerSource": 10, "handlesPerDispatch": 10}, "enrich": {"expertsFollowed": 0, "urlsPerExpert": 3}, "audit": {"paragraphsPerDispatch": 5}}, "phases_completed": "plan,extract,vet"}
  ],
  "scope": {
    "vocabulary": ["voice cloning", "streaming latency"],
    "recurring_names": ["ElevenLabs", "Cartesia"],
    "deliverables": {"Players": "reference/landscape.md §1.1", "Licensing deals": {"type": "chart", "description": "…"}},
    "sections": {"Licensing deals": {"type": "chart", "csv": "licensing-deals.csv", "row_is": "…", "fields": [{"name": "…", "description": "…"}], "sort": "…", "render": "…"}},
    "angles": [{"label": "pricing-tiers", "query": "...", "rationale": "..."}],
    "sources": ["websearch", "hackernews"],
    "sources_unavailable": [{"source": "reddit", "reason": "no API key"}],
    "branches": ["pricing-tiers × websearch"]
  }
}
```

Identity fields, set once and then left alone:
- `slug` — kebab-case directory name (matches the folder, and the summary filename).
- `title` — human-readable full title; what shows up when listing topics.
- `kind` — command identity. Allowed values: `landscape`, `competitor`, `inquiry`, `gtm-teardown`.
- `created_at` — ISO timestamp of topic creation. **Get it from `runlog.mjs stamp`**, which is also where each `run_history` entry's `ts` comes from. You have no clock, and a composed timestamp is wrong in a way nothing downstream catches.
- `parent_slug` — null for fresh topics, set for branched/chained ones.
- `originating_prompt` — the user's free-form invocation at topic creation, kept verbatim.

History, appended to and never rewritten:
- `run_history` — every run appends an entry. Each entry stores `ts`, `kind` (`fresh` / `re-run` / `branch`), `prompt` (verbatim user prose for THIS run, which may differ from `originating_prompt`), `mode`, `configurations`, and `phases_completed`. Storing the per-run prompt lets you see how intent shifted across re-runs; storing the configurations is what makes two runs on one topic comparable, because the numbers that applied are otherwise gone the moment the plan is rewritten. **They are the values that applied, not the ones configured** — `--fast` lowers several, and the entry records what the run really used, in the same shape `preflight.mjs` printed them.

**The entry is appended here, in Plan, not at the end of the run**, and every field but `phases_completed` is filled in now — `preflight.mjs` has already printed the configurations, so they are known before a single request goes out. Only `phases_completed` waits, because it is the one thing the end of the run knows and Plan does not.

**An entry written at the end is missing exactly when it is needed.** A run that dies mid-Extract wrote nothing, so a resume has no record of the numbers the cache on disk was built to and falls back to whatever the settings file says today — which is a different cap the moment anyone changes one. `extract_resume.mjs` reads this entry for that reason (`../resuming.md` §"Which configurations a resumed run uses"). An entry with no `phases_completed` is a run that did not finish, which is worth being able to see.

The plan, which belongs to the current run:
- `scope` — `vocabulary`, `recurring_names`, `deliverables`, `sections`, `angles`, `sources`, `sources_unavailable`, `branches`. The first two come back from the Scoping agent (§2), the section fields are settled in §3 and specified in `../sections.md`, the angles are checked in §4, and the branches are built in §5.
  - `deliverables` — every section of the summary, in order. Key is the title, value is either a pointer to the file that defines it or, for a section this run invented, `{type, description}`.
  - `sections` — the full spec for each invented enumerable section: `csv`, `row_is`, `fields`, `sort`, `render`. Empty when the run invented none.

**An empty `scope` means the plan has not been made yet** — a fresh topic, or a deliberate re-plan. That is the state Extract's resume reads as "nothing was fetched".

**Identity and history outlive the plan.** That is why they share a file but not a lifetime: `run_history` must never lose an entry, while `scope` describes one run and is replaced when a run is re-planned. Anything that rewrites `scope` leaves the rest untouched.

Two reasons the plan is a file rather than a step in your head:

- **Resume needs a checkpoint.** Without it, a run killed during Extract cannot tell "planned but not searched" from "half searched", and re-planning produces different angles than the ones the half-finished cache was built against.
- **The bound is knowable here.** Branches × the run's `extract.fetchesPerBranch` is the upper limit on fetches, decided before a single request goes out. The audit log reports what was actually spent against it.

Written by the orchestrator: identity and this run's `run_history` entry at the start of Plan, `scope` once the plan is settled, and the entry's `phases_completed` filled in at the end of the run.

**Each of those three writes is followed by `validate.mjs research-plan` on the file**, one repair
then a stop. It is the only JSON the orchestrator writes, and it is hand-composed rather than emitted
by a script — the failure that matters is a `run_history` entry that never landed, which nothing
notices until a resumed run silently falls back to today's configurations (`../resuming.md`
§"Which configurations a resumed run uses").

**The second call goes in once `scope` is written and before Extract starts.** Same command; with
`scope` present the shape requires it to be complete, so this is the call that catches a plan missing
its branches, its deliverables or a rationale on an angle.

## End of Plan

Plan is complete when `research_plan.json` holds the topic's identity and a `scope` with at least one branch, the scouted vocabulary behind it, and every section the summary will have — **and passes `validate.mjs research-plan`**. In manual mode it is complete only once the user has seen the plan and gone ahead (§3.1); in `--auto`, once it is written.
