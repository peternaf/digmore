# Plan

Print `[1/5] Plan` when this phase starts (`../reporting.md`).

This phase settles two things and writes them to one file: **which topic this is**, and **what the run will go looking for**. Every later phase inherits both.

Almost all of it is yours. One sub-agent is dispatched, to scout the subject — see below for why the split falls there.

## 1. The topic

Identity first, because the angles are built for a subject and the file they land in is named after it.

- Parse the invocation, slug the topic, and decide whether this is a fresh topic, a re-run, or one branched from a parent. Rules in `../research_plan.md`.
- **Underspecified topics get questions, not guesses.** In manual mode ask 2–3 before slugging; in `--auto` answer them yourself and record what you assumed. See `../modes.md`.
- Write identity into `research_plan.json` — `slug`, `title`, `kind`, `created_at`, `parent_slug`, `originating_prompt` — and append this run's entry to `run_history`.

This part cannot be a sub-agent: it talks to the user, and a sub-agent has no channel to them.

## 2. The angles — the one sub-agent

Do not write the angles out of what you already know: written cold they come out as `incumbents`,
`pricing`, `pain points` — true of every market, useful for none. The subject has to be looked at
first.

Dispatch **ONE Scoping agent**, per `../dispatch_structured_subagent.md`. It goes out to the open
web — unbudgeted here — and returns the `scope` shape (see `../../scripts/subagent_returns.json`):
the vocabulary the subject's own people use, the names that recur, and the angles built from them.

It is a sub-agent for one reason: it reads a lot of the open web to produce a short answer, and none
of that raw reading is worth carrying for the rest of the run. What comes back is small; what it
read is not.

**It returns the angles and stops there.** The sections are not its call — deciding them needs the
command's reference file and, in manual mode, the user, and it has neither.

Record what came back in `research_plan.json` under `scope`. In `--fast` there is less time for
this, not none.

## 3. The sections the summary will have — yours, not the agent's

With the angles back, decide the whole section list, in order, and record it as `scope.deliverables` — the key is the
section's title, the value says what belongs in it. Rules and types in `../sections.md`.

**Predefined first, in the command's order.** Each one's value is a pointer to the file that defines
it, and nothing about its shape is repeated: `"Tactics inventory": "reference/gtm-teardown.md §1.4"`.

**Then anything this run adds.** A section the command does not have, because this request wants it.
Its value is `{"type": ..., "description": ...}`, and if it is enumerable — a `list` or a `chart` —
`scope.sections` carries the rest of its spec: what a row is, the fields, the sort, how it renders.
An enumerable section without that is not usable; see `../sections.md`.

This matters because the rest of the pipeline is built for prose. Extract mines claims, Vet judges
handles, Audit checks claims against sources — all of it assumes the answer is an argument. A list
that is never declared here gets narrated as a paragraph at the end, and the user is handed twelve
communities they cannot reach. Declaring it is what makes the list a list.

## 3.1. Show the plan before running it

**Manual mode: present the plan and wait.** The angles and the sources are what the user is being
asked about — those decide what the run goes and reads. Say them in a line or two and offer the
change:

> 5 angles — dated channel appearances, repeatable programme tactics, promoter handles and
> disclosure, backlash and repercussions, observed reach per tactic — across Reddit, Hacker News,
> Twitter, web and forums. Standard gtm sections.
>
> Go ahead, or change an angle or a source.

**Say nothing about the sections unless one of two things is true**: a predefined section was
dropped, or a section was added that the request did not name. Both are facts, readable off
`scope.deliverables`. When either holds, name the difference in one more line — "plus two sections
not in the standard set: Paid promoter programmes, Timeline of dated moves" — and let the user
change it. A confirmation that only ever repeats the standard list teaches them to say yes without
reading.

**In `--auto` there is no wait.** State the same thing, record it in the run's Issues, and proceed.

## 4. Angles — check what came back

The angles are the Scoping agent's, but they are yours to accept. Three things make one unusable,
and all three are visible without re-searching:

- **It is written in generic market language** rather than in the vocabulary the agent just
  returned. That is the failure the whole step exists to prevent.
- **Its `label` collides with another**, or is not kebab-case. The label names the branch, its log
  file and its records.
- **The count is wrong for the mode** — 3–6 in a full run, exactly 2 in `--fast`; `ask` sets its own
  (`../modes.md`).

Send it back once if any of those hold, per `../dispatch_structured_subagent.md`. Do not quietly
rewrite them: an angle you wrote yourself is one the agent's reading no longer stands behind.

## 5. Branches

Each angle is paired with every **available** source, and each pair is a **branch** — the unit Extract works in. `pricing × websearch` is a branch; so is `pricing × reddit`.

Available means available on this run. Reddit and Twitter need an API key, so with no key no branch is built on them — the plan reflects what the run can actually reach, rather than promising sources it will later report as missing.

`local` joins only when the user handed something over.

## `research_plan.json`

One file for the topic and the plan. Identity at the top level, this run's plan under `scope`. Full field list in `../research_plan.md`.

```json
{
  "slug": "tts-providers",
  "title": "Text-to-speech API providers (B2B)",
  "kind": "landscape",
  "created_at": "2026-08-18T09:00:00Z",
  "parent_slug": null,
  "originating_prompt": "research TTS API providers — pricing tiers and recent moves",
  "run_history": [{"ts": "…", "kind": "fresh", "prompt": "…", "phases_completed": "plan"}],
  "scope": {
    "vocabulary": ["voice cloning", "niqqud", "streaming latency"],
    "recurring_names": ["ElevenLabs", "Cartesia", "Kokoro"],
    "deliverables": {"Players": "reference/landscape.md §1.1", "Licensing deals": {"type": "chart", "description": "..."}},
    "sections": {"Licensing deals": {"type": "chart", "csv": "licensing-deals.csv", "row_is": "...", "fields": [], "sort": "...", "render": "..."}},
    "angles": [{"label": "pricing-tiers", "query": "...", "rationale": "..."}],
    "sources": ["websearch", "hackernews", "forums"],
    "sources_unavailable": [{"source": "reddit", "reason": "no API key"}],
    "branches": ["pricing-tiers × websearch", "pricing-tiers × hackernews"],
    "fetchesPerBranch": 20
  }
}
```

**An empty `scope` means the plan has not been made yet** — a fresh topic, or a deliberate re-plan. That is the state Extract's resume reads as "nothing was fetched".

Two reasons the plan is a file rather than a step in your head:

- **Resume needs a checkpoint.** Without it, a run killed during Extract cannot tell "planned but not searched" from "half searched", and re-planning produces different angles than the ones the half-finished cache was built against.
- **The ceiling is knowable here.** Branches × `fetchesPerBranch` is the run's upper bound on fetches, decided before a single request goes out. Record it; the audit log reports what was actually spent against it.

## End of Plan

Plan is complete when `research_plan.json` holds the topic's identity and a `scope` with at least one branch, the scouted vocabulary behind it, and every section the summary will have. In manual mode it is complete only once the user has seen it and gone ahead (§3.1); in `--auto`, once it is written. What the user is asked to confirm, and when, is `../research_plan.md` step 3.
