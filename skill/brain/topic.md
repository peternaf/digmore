# Topics — identity, slugging, branching, chaining

A research topic is the working unit. Not "slug" — a *topic*. A topic has a kebab-case directory name, a human-readable title, and persistent state across runs.

Topics naturally form **chains**: the user reads one research output, spots an adjacent area worth digging into, and starts a new topic that builds on the previous one. Many research sessions will be a chain of 3–10 related topics, not a single one-shot. Treat this as the expected workflow.

## Topic directory layout

Every file written *during* a research run lives under `digmore/<topic-slug>/`, resolved against the directory the user is working in. Nothing a run produces lands outside that subtree, and nothing is ever written inside the installed plugin.

```
digmore/<topic-slug>/
  <topic-slug>.md                # user-facing summary, named after the topic
  topic.json                     # identity + run history
  scope.json                     # the plan: angles, sources, branches
  experts.csv                    # curated experts (legit verdict only)
  raw_research_outcomes.md       # LLM-facing structured claims index
  players.csv                    # competitor / subject matrix
  audit.md                       # Audit verdict log
  source_notes/<source>.md       # free-flow notes per source
  cache/<source>/<file>          # raw fetched content, per-source
  cache/_progress/<label>.log    # one heartbeat line per sub-agent step
  cache/_returns/<label>.json    # what a sub-agent handed back, before it was checked
```

**One writer per file.** Nothing here is written by two things at once, and that is what keeps it safe: only `experts.csv` has a lock, because only Vet fans out writers to a shared file.

| File | Written by |
|---|---|
| `scope.json` | Scope, once |
| `experts.csv` | Vet, through `experts.mjs` — the one locked writer |
| `players.csv`, `promoter_network.csv`, `raw_research_outcomes.md`, `<topic-slug>.md` | Synthesize's single synthesizer |
| `audit.md`, `topic.json` | the orchestrator |
| `source_notes/<source>.md` | one sub-agent per source, each to its own file |
| `cache/**` | whichever sub-agent fetched it, each to its own filename |

Anything new that writes a shared file needs a lock or a single writer. A step that fans out writers to one of the rows above will lose rows silently — no error, no trace.

The summary is named after the topic rather than a fixed filename, so a user who opens `digmore/` sees what each folder holds without opening anything. Everywhere these files refer to "the summary", they mean `<topic-slug>.md`.

**Any temp files generated during the run go under `cache/<source>/` (or `cache/_misc/` if source-agnostic).** Intermediate JSON dumps, scratch markdown, sub-agent partial outputs, debug traces — all under the topic's cache subtree. Nothing the run produces, even briefly, lands outside `digmore/<topic-slug>/`.

`_misc` is for what belongs to no source. **Anything a source produced goes under that source**, at the filename its own file gives it. That is where resume looks for it.

## `topic.json` schema

```json
{
  "slug": "video-api-providers",
  "title": "Video API providers landscape (B2B)",
  "kind": "landscape",
  "created_at": "2026-06-10T15:30:00Z",
  "parent_slug": "video-infra-overview",
  "originating_prompt": "research B2B video API providers — pricing tiers and recent moves",
  "run_history": [
    {"ts": "2026-06-10T15:30:00Z", "kind": "fresh", "prompt": "research B2B video API providers — pricing tiers and recent moves", "phases_completed": "scope,extract,vet,synthesize,audit"},
    {"ts": "2026-06-12T10:00:00Z", "kind": "re-run", "prompt": "re-run focusing on B2C providers and self-serve onboarding", "phases_completed": "scope,extract,vet"}
  ]
}
```

Fields:
- `slug` — kebab-case directory name (matches the folder, and the summary filename).
- `title` — human-readable full title; what shows up when listing topics.
- `kind` — command identity. Allowed values: `landscape`, `competitor`, `inquiry`, `gtm-teardown`.
- `created_at` — ISO timestamp of topic creation.
- `parent_slug` — null for fresh topics, set for branched/chained ones.
- `originating_prompt` — the user's free-form invocation at topic creation, kept verbatim.
- `run_history` — every run appends an entry. Each entry stores `ts`, `kind` (`fresh` / `re-run` / `branch` — a topic branched from a parent), `prompt` (verbatim user prose for THIS run, may differ from `originating_prompt`), and `phases_completed`. Storing the per-run prompt lets the model see how intent shifted across re-runs.

Written by the command's flow at topic creation, updated at the end of each run.

## Slugging

When the user invokes a command, parse intent from the prose and slug the topic:

1. If the topic is underspecified ("video stuff" with no buyer / use-case / domain anchor), ask 2–3 clarifying questions before slugging. The refined topic is what gets slugged. In auto mode, answer them yourself from what you can see and slug on that, then record the reading you took in the run's Issues.
2. List existing topics under `digmore/` to detect re-run or branching cases the user didn't name explicitly.
3. **State what you detected — fresh / re-run / branched from a parent, the slug, the parent, the mode — and then stop only if you chose something the user did not.** In manual mode, that means waiting for a go-ahead when, and only when, one of these is true:
   - a parent was picked from more than one candidate topic;
   - the run is being treated as a re-run or a branch and the user did not say so;
   - the topic stayed underspecified after the questions in step 1.

   Otherwise say what you detected in a line or two and go straight into Scope. A confirmation that only ever repeats what the user typed teaches them to say yes without reading, which is the state in which a wrong parent slips through.

   In auto mode there is no stop at all: state the reading, proceed, and record it in the run's Issues.

Slug rules:
- Kebab-case, ASCII only, no leading/trailing dashes.
- 2–5 words is the sweet spot. "video-api-providers" beats "v" beats "video-api-providers-b2b-deep-research-2026-06".
- Include the key disambiguating dimension when there is one ("video-api-providers" vs. "video-api-providers-b2b" if you anticipate a sibling B2C topic).

## Three flows beyond fresh research

1. **Incremental update of an existing topic.** User extends `experts.csv` (or experts get auto-added in a later run). Re-running re-vets old datapoints against the new expert list and surfaces new datapoints introduced by those experts.

2. **Branched topic.** A new related topic spins off from a parent. The new topic inherits the parent's `experts.csv` **by copy at the moment of branching** — copy `parent/experts.csv` into the new topic's directory. The child can diverge cleanly without affecting the parent. `topic.json.parent_slug` records the link. Cached data may also be copied if the model judges it relevant.

   **Player numeric carryover.** When a player from the parent's `players.csv` survives carryover-revalidation (see `phases/synthesize_phase_d.md` §1) and enters the child, copy the parent's `monthly_visits` and `funding_stage` directly — no re-fetch. If either is missing on the parent row, the parent was incomplete: fix the parent first, then re-copy. UNAVAILABLE in the child because the parent didn't have it is NOT acceptable.

3. **Chained follow-up.** Same as branched, but driven by the user's own read-through of the parent's summary — specifically the "Non-trivial insights" and "Adjacent spaces" sections. The user decides what's worth a follow-up; the command does NOT pre-suggest. The loop — research → user reads → user picks a follow-up → new run → repeat — is the intended way to use digmore over time.

## Anonymity

Topic creation must not leak the user's identifying terms into external request bodies, query strings, or headers. See `anonymity.md`.
