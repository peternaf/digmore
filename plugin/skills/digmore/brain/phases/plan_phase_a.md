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

## 2. Scout the subject before deciding — the one sub-agent

Do not build the angles out of what you already know: writing them cold produces `incumbents`, `pricing`, `pain points` — true of every market, useful for none. Find out what the subject actually is first.

Dispatch **ONE Subject Scout**, per `../dispatch_structured_subagent.md`. It goes out to the open web — unbudgeted here — and returns the `scope` shape (see `../../scripts/subagent_returns.json`): the vocabulary the subject's own people use, and the names that recur.

It is a sub-agent for one reason: scouting reads a lot of the open web to produce a short answer, and none of that raw reading is worth carrying for the rest of the run. What comes back is small; what it read is not.

It returns the vocabulary and the names and nothing else. The angles are yours, built from what it found — you are the one who will use them.

Record what came back in `research_plan.json` under `scope`. In `--fast` there is less time for this, not none.

## 3. What the user asked for — things, or an understanding

Decide this before the angles, and record it. Two requests that look alike want different deliverables:

- **An enumeration.** "List the online hubs for TTS", "which vendors ship X", "who are the people worth following". The deliverable is a **set of records** the user will act on one by one. Success means the set is complete, each entry is reachable, and nothing is missing.
- **An understanding.** "Why do people dislike X", "is X worth adopting", "how is X being promoted". The deliverable is an **argument** built from evidence. Success means the reasoning holds and every claim is sourced.

Most runs are some of both, so record the enumerations the request contains rather than picking one label for the whole run: `scope.deliverables: ["hubs", "influencers"]`. Each named enumeration becomes a CSV row set and its own summary section, rendered per `synthesize_phase_d.md` §3.6.

This matters because the rest of the pipeline is built for the second kind. Extract mines claims, Vet judges handles, Audit checks claims against sources — all of it assumes the deliverable is an argument. An enumeration that is never declared here gets narrated as prose at the end, and the user is handed a paragraph naming twelve communities they cannot reach. Declaring it is what makes the list a list.

## 4. Angles

Decompose the topic into 3–6 complementary angles, **built on what the Subject Scout surfaced** — its vocabulary, its recurring names, its live arguments. Angles are domain-aware:

- A B2B SaaS market gets angles like `incumbents`, `pricing tiers`, `pain points`, `alternatives`, `expert critiques`.
- A hardware market gets different angles: `vendors`, `benchmarks`, `supply chain`, `firmware quirks`, `upgrade churn`.
- A niche dev tool gets others again: `maintainers`, `workflow friction`, `breaking changes`, `ecosystem dependencies`.

`--fast` takes exactly 2; `ask` sets its own counts and approves them with the user (`../modes.md`).

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
    "deliverables": ["hubs", "influencers"],
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

Plan is complete when `research_plan.json` holds the topic's identity and a `scope` with at least one branch and the scouted vocabulary behind it. The plan is written, not approved: Extract follows immediately. What the user is asked to confirm, and when, is `../research_plan.md` step 3.
