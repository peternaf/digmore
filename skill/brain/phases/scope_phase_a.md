# Scope

Print `[1/5] Scope` when this phase starts (`../reporting.md`).

One sub-agent, one file. It decides what the whole run goes looking for; every later phase inherits its angles.

## Orient before deciding

Do not build the angles out of what you already know: scoping cold produces `incumbents`, `pricing`, `pain points` — true of every market, useful for none. Find out what the subject actually is first. How is yours to judge; the open web is available here and unbudgeted.

Good angles rest on the vocabulary the subject's own people use (every branch query inherits your wording), the names that recur, the arguments that are live now, and where the discussion happens.

Record how you got there in `scope.json` under `orientation`. In `--quick` there is less time for this, not none.

## Angles

Decompose the topic into 3–6 complementary angles, **built on what orientation surfaced** — its vocabulary, its recurring names, its live arguments. Angles are domain-aware:

- A B2B SaaS market gets angles like `incumbents`, `pricing tiers`, `pain points`, `alternatives`, `expert critiques`.
- A hardware market gets different angles: `vendors`, `benchmarks`, `supply chain`, `firmware quirks`, `upgrade churn`.
- A niche dev tool gets others again: `maintainers`, `workflow friction`, `breaking changes`, `ecosystem dependencies`.

Dispatch ONE sub-agent for this. It returns the Scope schema (see `../schemas.md`). `--quick` takes exactly 2 angles; `ask` sets its own counts and approves them with the user (`../modes.md`).

## Branches

Each angle is paired with every **available** source, and each pair is a **branch** — the unit Extract works in. `pricing × websearch` is a branch; so is `pricing × reddit`.

Available means available on this run. Reddit and Twitter need an API key, so with no key no branch is built on them — the plan reflects what the run can actually reach, rather than promising sources it will later report as missing.

`local` joins only when the user handed something over.

## `scope.json`

Write the plan before dispatching anything:

```json
{
  "orientation": {
    "queries": ["text to speech api pricing 2026", "tts latency complaints"],
    "vocabulary": ["voice cloning", "niqqud", "streaming latency"],
    "recurring_names": ["ElevenLabs", "Cartesia", "Kokoro"]
  },
  "angles": [{"label": "pricing-tiers", "query": "...", "rationale": "..."}],
  "sources": ["websearch", "hackernews", "forums"],
  "sources_unavailable": [{"source": "reddit", "reason": "no API key"}],
  "branches": ["pricing-tiers × websearch", "pricing-tiers × hackernews"],
  "fetchesPerBranch": 20
}
```

Two reasons it is a file rather than a step in your head:

- **Resume needs a checkpoint.** Without it, a run killed during Extract cannot tell "scoped but not searched" from "half searched", and re-scoping produces different angles than the ones the half-finished cache was built against.
- **The ceiling is knowable here.** Branches × `fetchesPerBranch` is the run's upper bound on fetches, decided before a single request goes out. Record it; the audit log reports what was actually spent against it.

## End of Scope

Scope is complete when `scope.json` exists with at least one branch and an `orientation` block behind it. The plan is written, not approved: Extract follows immediately. What the user is asked to confirm, and when, is `../topic.md` step 3.
