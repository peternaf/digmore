# Topics — identity, slugging, branching, chaining

A research topic is the working unit. Not "slug" — a *topic*. A topic has a kebab-case directory name, a human-readable title, and persistent state across runs.

Topics naturally form **chains**: the user reads one research output, spots an adjacent area worth digging into, and starts a new topic that builds on the previous one. Many research sessions will be a chain of 3–10 related topics, not a single one-shot. Treat this as the expected workflow.

## Topic directory layout

Every file written *during* a research run lives under `digmore/<topic-slug>/`, resolved against the directory the user is working in. Nothing a run produces lands outside that subtree, and nothing is ever written inside the installed plugin.

```
digmore/<topic-slug>/
  <topic-slug>-executive-summary.md   # the user-facing summary
  research_plan.json             # the topic: identity, run history, and this run's plan
  experts.csv                    # curated experts (legit verdict only)
  raw_research_outcomes.md       # LLM-facing structured claims index
  players.csv                    # competitor / subject matrix
  <section-name>.csv             # one per invented enumerable section — sections.md
  audit.md                       # Audit verdict log
  source_notes/<source>.md       # free-flow notes per source
  cache/<source>/<file>          # raw fetched content, per-source
  cache/_progress/<label>.log    # one heartbeat line per sub-agent step
  cache/_returns/<label>.json    # what a sub-agent handed back, before it was checked
```

**One writer per file.** Nothing here is written by two things at once, and that is what keeps it safe: only `experts.csv` has a lock, because only Vet fans out writers to a shared file.

| File | Written by |
|---|---|
| `research_plan.json` | the orchestrator — identity at Plan, `scope` when the plan is settled |
| `experts.csv` | Vet, through `experts.mjs` — the one locked writer |
| `players.csv`, `promoter_network.csv`, any `<section-name>.csv`, `raw_research_outcomes.md`, the summary | Synthesize's single synthesizer |
| `audit.md` | the orchestrator |
| `source_notes/<source>.md` | one sub-agent per source, each to its own file |
| `cache/**` | whichever sub-agent fetched it, each to its own filename |

Anything new that writes a shared file needs a lock or a single writer. A step that fans out writers to one of the rows above will lose rows silently — no error, no trace.

The summary carries both the topic and what it is: the slug so it stays findable once it has been moved or shared out of its folder, and `-executive-summary` so the name says what the file holds. Everywhere these files refer to "the summary", they mean `<topic-slug>-executive-summary.md`.

**It is an executive summary, and that is a kind of document, not just a filename.** It is written for someone who has to decide something and will not read the sources — a founder, an operator, a board member. So it leads with what is true and what follows from it, and every section earns its place by changing a decision. Background the reader can infer, methodology, and the story of how the research went do not belong in it; the findings, the numbers, the disagreements and the gaps do. The reader should be able to act after the first screen and read the rest only to check the work. Depth without shape belongs in `raw_research_outcomes.md`, which is the LLM-facing record and has no length limit.

**Any temp files generated during the run go under `cache/<source>/` (or `cache/_misc/` if source-agnostic).** Intermediate JSON dumps, scratch markdown, sub-agent partial outputs, debug traces — all under the topic's cache subtree. Nothing the run produces, even briefly, lands outside `digmore/<topic-slug>/`.

`_misc` is for what belongs to no source. **Anything a source produced goes under that source**, at the filename its own file gives it. That is where resume looks for it.

## `research_plan.json` schema

```json
{
  "slug": "video-api-providers",
  "title": "Video API providers landscape (B2B)",
  "kind": "landscape",
  "created_at": "2026-06-10T15:30:00Z",
  "parent_slug": "video-infra-overview",
  "originating_prompt": "research B2B video API providers — pricing tiers and recent moves",
  "run_history": [
    {"ts": "2026-06-10T15:30:00Z", "kind": "fresh", "prompt": "…", "mode": "manual, full", "fetchesPerBranch": 20, "vetHandleCap": 50, "phases_completed": "plan,extract,vet,synthesize,audit"},
    {"ts": "2026-06-12T10:00:00Z", "kind": "re-run", "prompt": "…", "mode": "auto, fast", "fetchesPerBranch": 5, "vetHandleCap": 20, "phases_completed": "plan,extract,vet"}
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
- `created_at` — ISO timestamp of topic creation.
- `parent_slug` — null for fresh topics, set for branched/chained ones.
- `originating_prompt` — the user's free-form invocation at topic creation, kept verbatim.

History, appended to and never rewritten:
- `run_history` — every run appends an entry. Each entry stores `ts`, `kind` (`fresh` / `re-run` / `branch` — a topic branched from a parent), `prompt` (verbatim user prose for THIS run, may differ from `originating_prompt`), `mode`, the two ceilings the run actually applied (`fetchesPerBranch`, `vetHandleCap`), and `phases_completed`. Storing the per-run prompt lets the model see how intent shifted across re-runs; storing the ceilings is what makes two runs on one topic comparable, because the numbers that applied are otherwise gone the moment the plan is rewritten. **They are the ceilings that applied, not the ones configured** — `--fast` lowers both, and the entry records what the run really used.

The plan, which belongs to the current run:
- `scope` — what this run goes looking for: `vocabulary`, `recurring_names`, `deliverables`, `sections`, `angles`, `sources`, `sources_unavailable`, `branches`. Field-by-field in `phases/plan_phase_a.md`; the two section fields in `sections.md`.
  - `deliverables` — every section of the summary, in order. Key is the title, value is either a pointer to the file that defines it or, for a section this run invented, `{type, description}`.
  - `sections` — the full spec for each invented enumerable section: `csv`, `row_is`, `fields`, `sort`, `render`. Empty when the run invented none.

**`scope` is `{}` until Plan settles it**, and an empty one is a real state rather than a missing file: a fresh topic has it, and so does a topic being deliberately re-planned. Extract's resume reads it that way — no `scope`, nothing was fetched.

**Identity and history outlive the plan.** That is why they share a file but not a lifetime: `run_history` must never lose an entry, while `scope` describes one run and is replaced when a run is re-planned. Anything that rewrites `scope` leaves the rest untouched.

Written by the orchestrator: identity at the start of Plan, `scope` once the plan is settled, and a `run_history` entry appended at the end of each run.

## Slugging

When the user invokes a command, parse intent from the prose and slug the topic:

1. If the topic is underspecified ("video stuff" with no buyer / use-case / domain anchor), ask 2–3 clarifying questions before slugging. The refined topic is what gets slugged. In auto mode, answer them yourself from what you can see and slug on that, then record the reading you took in the run's Issues.
2. List existing topics under `digmore/` to detect re-run or branching cases the user didn't name explicitly.
3. **State what you detected — fresh / re-run / branched from a parent, the slug, the parent, the mode — and then stop only if you chose something the user did not.** In manual mode, that means waiting for a go-ahead when, and only when, one of these is true:
   - a parent was picked from more than one candidate topic;
   - the run is being treated as a re-run or a branch and the user did not say so;
   - the topic stayed underspecified after the questions in step 1.

   Otherwise say what you detected in a line or two and go straight into the rest of Plan. A confirmation that only ever repeats what the user typed teaches them to say yes without reading, which is the state in which a wrong parent slips through.

   In auto mode there is no stop at all: state the reading, proceed, and record it in the run's Issues.

Slug rules:
- Kebab-case, ASCII only, no leading/trailing dashes.
- 2–5 words is the sweet spot. "video-api-providers" beats "v" beats "video-api-providers-b2b-deep-research-2026-06".
- Include the key disambiguating dimension when there is one ("video-api-providers" vs. "video-api-providers-b2b" if you anticipate a sibling B2C topic).

## Three flows beyond fresh research

1. **Incremental update of an existing topic.** User extends `experts.csv` (or experts get auto-added in a later run). Re-running re-vets old datapoints against the new expert list and surfaces new datapoints introduced by those experts.

2. **Branched topic.** A new related topic spins off from a parent. The new topic inherits the parent's `experts.csv` **by copy at the moment of branching** — copy `parent/experts.csv` into the new topic's directory. The child can diverge cleanly without affecting the parent. `research_plan.json.parent_slug` records the link. Cached data may also be copied if the model judges it relevant.

   **Player numeric carryover.** When a player from the parent's `players.csv` survives carryover-revalidation (see `phases/synthesize_phase_d.md` §1) and enters the child, copy the parent's `monthly_visits` and `funding_stage` directly — no re-fetch. If either is missing on the parent row, the parent was incomplete: fix the parent first, then re-copy. UNAVAILABLE in the child because the parent didn't have it is NOT acceptable.

3. **Chained follow-up.** Same as branched, but driven by the user's own read-through of the parent's summary — specifically the "Non-trivial insights" and "Adjacent spaces" sections. The user decides what's worth a follow-up; the command does NOT pre-suggest. The loop — research → user reads → user picks a follow-up → new run → repeat — is the intended way to use digmore over time.

