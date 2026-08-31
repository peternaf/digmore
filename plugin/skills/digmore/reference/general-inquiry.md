# Digmore — Inquiry

Answer a specific business question with evidence pulled from every source digmore has. Different from `landscape`: the input is a question, and the output is an answer whose shape adapts to the question.

**Read `../brain/index.md` first and follow it.** This file adds only what is specific to `ask`.

## Input framing

A free-form question. Examples:

- `/digmore ask how does paperswithcode's founder make money from paperswithcode`
- `/digmore ask what alternatives are there to gstreamer that people actually use` (underspecified — "for what use case?" — clarify before slugging, per `../brain/phases/plan_phase_a.md` §1)
- `/digmore ask --fast what are the recurring complaints about whisper.cpp on CPU?`
- `/digmore ask --auto is paperswithcode still being maintained`

`research_plan.json.kind` is `inquiry`. The question itself is already on record as `originating_prompt` — do not copy it into a second field. `scope.angles` holds the approved angle list once Plan settles it.

## Topic slug

Plan generates a 2–4-word kebab slug from the question:

- `how does paperswithcode's founder make money from paperswithcode` → `paperswithcode-founder-monetization`
- `what alternatives are there to gstreamer that people use` → `gstreamer-alternatives`
- `what are the questions people online ask about computer vision benchmarks` → `cv-benchmark-questions`

## Plan — command-specific

Plan reads the question and produces two angle sets:

- **Recommended angles** — the angles you'd actually run. Each is `{label, query, rationale}`.
- **Bonus angles** — free-form angles you came up with that the user might find interesting but you wouldn't run by default.

**How many of each** — this replaces `../brain/modes.md`'s angle counts for `ask` only: 3–6 recommended plus 2–3 bonus in full, exactly 2 recommended and no bonus in `--fast`. Every other reduction in that file applies here unchanged.

Recommended angles MAY draw from the lens-template menu below or be invented from scratch — pick what fits the question's shape:

| Question shape | Suggested angles |
|---|---|
| find alternatives to X | direct competitors · indie/FOSS options · who switched · why · regrets |
| how does Y make money | stated business model · revenue sources · funding history · founder's other ventures · post-exit moves |
| what do people ask about Z | top forum threads · recurring complaints · beginner questions · expert questions · cross-source duplicate themes |
| is X any good / X vs Y | proponents' takes · skeptics' takes · benchmarks/numbers · production horror stories · who switched away |
| what's the state of W | recent moves · loud signals · contrarian takes · quiet incumbents · what experts predict |
| who is person P / what does P do / research P | current roles & employers · monetization (salary + side income + equity) · public takes & track record · industry network/influence · **digital-footprint inventory (mandatory — see below)** |

Every command shows its plan before searching (`../brain/phases/plan_phase_a.md` §3.1). What `ask` adds is the bonus set: present both, and wait for a pick, edit, extension or approval; where the mode leaves no room to ask, take the strongest recommended set. Bonus angles are offered, never run.

### Person-inquiry rule — the digital-footprint angle is mandatory

When the subject is a person (a named individual, not a company or product), Plan MUST emit a `digital-footprint` angle on top of whatever substantive angles fit the question. It is non-optional in both depth modes — in `--fast` it displaces one of the two recommended angles rather than being added to them.

Person-inquiries have a known failure mode: commercial and published angles surface the bios and miss the social footprint. This angle exists to close that gap. Skipping it is the same class of error as substituting WebSearch for a dedicated source tool (`../brain/phases/extract_phase_b.md` §"Source-tool discipline") — it produces a plausible-looking result that quietly underreports the truth.

The angle sweeps these platforms by name, regardless of person:

- Active-or-not check: Bluesky · Mastodon · Threads · Substack · Medium · Quora · GitHub · YouTube channel · TikTok · Instagram · personal homepage
- Aggregator/database check: Muck Rack · Crunchbase · PitchBook · AngelList · Wikipedia / Wikidata · ResearchGate / ORCID · RocketReach / Tilt / Intelligent Relations
- Employer / conference / podcast presence: every current employer's team page · every conference org page listing them as speaker/moderator/chair · every podcast directory listing them as host/co-host

Output: one row per platform with URL + status (active / dormant / absent). Lands in the topic directory as `online_presence.md`, referenced from the summary's §2.

## 1. The summary

Sections in this exact order.

1. **Direct answer** — 1–3 sentences answering the question. At the top. No preamble.
2. **Evidence** — the body. The Final report writer picks the shape per question: comparison table (often driven by `players.csv` rows), categorized list, prose-with-timeline, per-sub-question grouping, or a mix. Add subsections (`What people pay for`, `Hubs touching this question`, `Buying signals`, etc.) when they help the answer. Inline URL refs for every non-obvious claim, with the commenter handle and Vet verdict.
3. **Caveats / what's missing** — where evidence is thin, single-sourced, or conflicting. Be specific about what you didn't find, and name any source the run could not reach.
4. **Refuted / unsubstantiated** — claims that didn't survive Audit. Each entry: kill reason + original source URL.
5. **Run footer** — per `../brain/reporting.md`.

## 2. The rest

- `players.csv` — **same columns as `landscape.md` §2.** Built from every entity mentioned ≥5 times. Its role here is a credibility filter for the evidence and a reference for any comparison table in §2. If the question genuinely has no players ("what do people ask about computer vision benchmarks"), write the file with the header row plus a single `# no players in scope` comment line.
- `experts.csv`, `observations.md`, `audit.md` — the brain's, unchanged.
