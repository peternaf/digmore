# Raw report writer — the agent

| Field | |
|---|---|
| **Phase** | Synthesize `[5.1/6]`, and again in Audit `[6.2/6]` when the reviewer finds a closable gap |
| **Purpose** | Build the enumerable sections this run declared, then merge the six per-source reports into one aggregate raw report — the single evidence record everything after it reads |
| **Input text** | the topic · the research question · the spec for every enumerable section this run declared — `row_is`, fields, sort and render, from `research_plan.json.scope.sections`. **On the repair pass**, the gap list instead: what the reviewer found missing or wrong |
| **Input rule files** | `output.md` · `sections.md` · `page_quality.md`, **for the rank order alone**. **Not `vetting.md`** — the verdict rules are the script's, and an agent sent them would be a second place they could be applied differently |
| **Input data files** | every `full_source_analysis/<source>-joined.json` · `players.csv`, finished. **On `gtm` runs only**, also the four `<source>-handles.json`, which `promoter_network.csv` needs for `person_verdict` and for the labelled identifiers its identity join rests on |
| **Runs** | `synthesis.mjs read_source_claims`, which prints every surviving claim one to a line with the position the manifest addresses it by — **that, not the joined files raw**, which is six files of citation objects to reach six fields · `synthesis.mjs index`, which expands its merge manifest into `claim_index.json` · `validate.mjs` on the manifest and on its own receipt, each with one repair and one re-check. No network. It re-reads the CSVs it wrote against `sections.md`'s cell rules — a prose check, not a gate, because the checker reads JSON against a shape and a CSV is neither |
| **Settings that control it** | `subagents.repairAttempts` — **this agent enforces it**, on both files it checks: one repair, one revalidation, then it reports a failure. Nothing else — everything that bounded the evidence was spent before this agent ran |
| **Held in its context** | every surviving claim in the run at once, from the six joined reports, plus `players.csv`. **It is the only actor that ever holds the whole claim set**, and the split from the Final report writer exists so that nothing else has to |
| **Returns to main context** | the `raw-report-writer` shape — counts, the sections it wrote and their row counts, **every claim it deleted for having no URL**, and the subjects the filter dropped with reasons. Not the claim set, and not the index: both are on disk |
| **Writes to disk** | at the topic root — each declared enumerable section's CSV **first**, then `<slug>-raw-report.md` and `cache/_returns/raw-report-writer-manifest.json` **together at the end** · `promoter_network.csv` on `gtm` runs, written directly rather than through `experts.mjs` · `cache/_returns/raw-report-writer.json`. **`claim_index.json` is the script's**, written from the manifest — every field of it but the merged claim text and the refutation is a copy, a maximum or a counter |
| **Logs** | `cache/_progress/raw-report-writer.log` — `reading <source>` · `merging duplicates across sources` · `settling contradictions` · `writing <section-name>.csv` · `writing the raw report and the manifest`, and **once per batch where a write runs past one tool call**: `writing the raw report, part <n>`. A step that goes quiet for ten minutes is killed |
| **How it reports failure** | `claimIndexError` on the receipt, when `synthesis.mjs index` still refused the manifest after the one repair — its errors name the reference that would not resolve. Finding nothing to repair on the repair pass is **not** a failure — it means the evidence was already in the aggregate and the fault was the draft's |
| **One dispatch per** | the run |
| **Run instances** | 1, plus **one** repair dispatch when the reviewer finds a closable gap. One pass only, never a loop |
| **`--fast`** | the same in both modes |
| **Concurrency** | n/a — single |
| **Model tier** | set in `brain/index.md` §Sub-agents, which is where the orchestrator reads it |

It runs long with nothing to show, so its log lines are the only sign it is alive.

## What this agent does

**You decide what survives; the Final report writer decides how it reads.** The two were one agent
that read every claims file *and* wrote the summary in a single dispatch — so a dispatch that died
took the reading with it, and nothing bounded either half. Splitting it pays the expensive read once
and leaves it on disk, and the two documents still cannot contradict each other, because the summary
is written from your file rather than from the same pile a second time.

The verdict join and the citation filter already happened, in `synthesis.mjs join`. What reaches you
is claims whose every citation carries a `status`, with the rejected ones already gone. Five steps are
yours, and the order matters in two places.

### 1. Merge duplicates across sources

Each per-source report already deduplicated within its own source. **You are the only actor holding
all six**, so cross-source merging is your job and nowhere else's — and it is what makes corroboration
visible.

**A merged claim takes the highest `importance` and the highest `pageQuality` of the set it was merged
from.** The page quality is the canonical citation's, which is the same best-evidence selection the
merge already uses to pick that citation. Both are the same rule the Source Analyst applied within one
source, so the answer does not change depending on which merge produced it.

**Then recount corroboration from the citations that survived**, not the ones the claim arrived with.
A claim that lost two of three citations to spam otherwise still reads as corroborated across three
sources, and nothing anywhere would catch it. A claim counts as corroborated only where its surviving
citations differ on at least two of three axes: different domain, different source, different person.

### 2. Assign the `claimId`

A counter over the merged set — `claim-001`, `claim-002`.

**After the merge, never before.** Assign it first and two claims that become one leave two ids behind,
so a marker in the summary points at something that no longer exists as a unit. The id travels into the
raw report, into the summary as the paragraph marker, and back on every verdict.

**On the repair pass the counter continues from the highest id already there.** A repaired claim with
no id is one the writer cannot mark and the fact check never receives.

### 3. Settle contradictions

Contradiction is the mirror of duplication — same subject, opposite content — so you are already
comparing the pairs that matter, and you are the only one holding every claim at once. **Nothing
searches the web for a counter-source:** a contradiction is found inside the evidence the run gathered
or it is not found at all.

**The stronger claim stands.** Strength is what the row already carries: `importance` × page quality
(the scores are in `page_quality.md`), whether its citations are vetted, and how many independent
citations survived. The loser is marked refuted and goes to the summary's "Refuted / unsubstantiated"
section rather than into the body, so the writer never drafts a claim we already know is beaten.

**Only factual contradictions. Never disagreements.** *"Mux charges $0.005/min"* against *"$0.01/min"*
is a contradiction: one is wrong. *"Self-hosting is cheaper at scale"* against *"self-hosting costs
more than teams expect"* is two real positions, and both belong in the report. A rule that killed the
weaker side of every disagreement would delete exactly what "Non-trivial insights & unexpected expert
takes" is built from — and call it verification.

**Write the refutation onto the loser in the manifest**, as `refutedByIndex` — the winner's position
in the manifest, since the ids do not exist until the script has run — and `refutedReason`, one line on
why that one was stronger. Not because the file is edited later: it
is written once, with the refutation already known. Your return is a receipt of counts, and `audit.md`
is written two steps later by someone else, so a refutation held only in your head dies when this
dispatch does.

**Refuted is not unsupported.** A refuted claim had a source and lost an argument, which is a finding
about the subject and worth showing. A claim with no source at all is a defect in us and leaves no
trace in the report — see below.

### 4. Build each declared enumerable section

One at a time, re-reading each against `sections.md`'s cell rules before moving on: a cell has a source
or it is `—`, a row with nothing behind it does not exist, and `url` points at the thing rather than at
the evidence.

**These come before the raw report, and that is deliberate.** Filling one forces a structured pass over
the evidence with a specific question — every dated move, every programme — which settles sequence and
completeness that a prose pass blurs. Writing the raw report afterwards means those are resolved rather
than re-derived loosely.

**The rule that follows: a fact that lives in an enumerable section's CSV is not restated in the raw
report** — the raw report points at it. Otherwise the duplication that already exists between the
claims files and the raw report gets a third copy, and the three drift.

**Which sections are yours, and it is fewer than all of them.** A section is `text`, `list` or `chart`,
and `list` and `chart` are the enumerable ones. You write the CSV for a section **this run invented**,
and `promoter_network.csv` on `gtm`. `players.csv` was written in Enrichment and `experts.csv` in Vet;
you only read those.

**`promoter_network.csv` is yours because nobody else can build it.** A row is one *person*, and every
column comes from material you already hold: `person_verdict` from the handles files,
`brand_mention_count` and `url_repetition_pattern` from the claims across all six reports,
`disclosure_pattern` and `role` from what those claims actually say. Its columns are
`reference/gtm-teardown.md`'s.

**The identity join is the weak part, and it is honest about it.** A row needs to know that `u/foo`,
`hn/foo` and `@foo` are one human, and the only thing that establishes that is what each profile
literally printed — carried on the roster row as **labelled fields**: `realName`, `github`,
`website`, `reddit`, `hn`, `twitter`, and `otherIdentifiers` for the rest. **Join two handles when
one profile named the other, and never because they look like the same person.** A guess here produces a promoter network that is confidently
wrong about who someone is. What it costs: someone who never links their accounts stays two or three
rows, and their mention count is split across them instead of summed — one person promoting across
three platforms is exactly what a teardown exists to catch. Record it in the receipt as a known-gap
whenever the run finishes with handles it could not join.

### 5. Write the raw report and the merge manifest — together

Both carry the merge from step 1 and the refutations from step 3, and they cannot drift, because you
write both from that one merge. There is no third file either is derived from.

**The raw report is markdown, though the six files you read are JSON.** Structured where a script
reads it, prose where a model does — the asymmetry is the rule, not an oversight. It is read by the
Final report writer, by the copy editor, and by a person.

**The manifest is not the claim index.** It says *which source claims you merged into one and what
that merged claim says* — the `merge-manifest` shape — and a script expands it into
`claim_index.json`:

```json
{"claims": [
  {"claim": "Mux charges $0.005 per minute of encoding",
   "from": [{"source": "reddit", "index": 12}, {"source": "websearch", "index": 3}]},
  {"claim": "Mux charges $0.01 per minute",
   "from": [{"source": "reddit", "index": 41}],
   "refutedByIndex": 0, "refutedReason": "the vendor's own pricing page against one forum comment"}
]}
```

- **`from`** is a position in that source's `<source>-joined.json` `claims` array. Source claims have
  no ids, and the file was written once by `synthesis.mjs join` and is never rewritten, so the
  position is stable for the rest of the run. **`synthesis.mjs read_source_claims` prints that position beside
  every claim** — `reddit[12]` — so copy it rather than counting: a miscount is refused by
  `synthesis.mjs index` after the whole merge is done, which is the worst moment in the run to find
  a bookkeeping mistake.
- **Leave `claim` out where nothing merged.** It is required only where several source claims
  became one and need a sentence covering them all. An entry with a single `from` almost never
  does — the source claim already says what it says, and the script copies its text across. This is
  the one field that still costs real output, so writing it where it is not needed is the whole of
  what this file still costs you.
- **`refutedByIndex` is a position in this manifest**, not a `claimId` — the ids do not exist until
  the script has run. It turns yours into the winner's id.

**Why you do not write the index yourself.** Every field of it except the merged claim text and the
refutation is a copy, a maximum or a counter: the citations are the bulk of the file and each is
copied verbatim out of `<source>-joined.json`. A run spent twelve minutes emitting it as output, hit
the limit part-way and restarted in batches — and retyping the quotes is a correctness risk of its
own, since the fact check compares the report against the cached page and a quote that drifts while
being retyped sends it to the wrong evidence. **What is yours is the judgement**: which source claims
are one claim, what it says, and which of two contradicting claims won.

**Check it, then run the script:**

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/validate.mjs" merge-manifest \
  digmore/<slug>/cache/_returns/raw-report-writer-manifest.json

node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/synthesis.mjs" index --topic <slug>
```

The two catch different things and neither substitutes for the other: the shape check reads
structure, and the script is what knows whether `reddit[41]` is actually a claim.

It resolves every reference, copies each one's citations, takes the highest `importance` and the
canonical `pageQuality`, and numbers the result. **It fails on a reference that does not resolve,
naming it** — a check no shape could make, since a shape reads structure and not whether a claim is
there. Fix the manifest and run it again. On the repair pass add `--append`, which continues the
counter from the highest id already in the file.

**A long write says so while it is writing.** Where any of your writes runs past a single tool call —
the raw report is the one that does — beat per batch rather than per step: `writing the raw report,
part 3`. A step that goes quiet for ten minutes is killed by the stuck-agent check, and your own file
already notes you run long with nothing to show.

## A claim with no URL does not leave this step

Cite-or-drop means such a claim cannot legitimately exist, so an unsourced claim was invented somewhere
in this pipeline. `synthesis.mjs join` already collected the ones it found; **delete any you find too,
and return every one of them on your receipt** — the claim, and which per-source report it came from.

**The receipt is the only route.** `audit.md` belongs to the orchestrator and is written in Audit; you
are gone by then, and the claim itself is gone from disk. A defect you delete silently is a defect
nobody ever learns about — which is the failure this deletion exists to surface.

**It is not "refuted", and it must never reach that section.** Refuted means the claim had a source and
the evidence contradicts it; a reader learns from seeing it killed. A claim with no source is a finding
about *us*: nothing was checked, because there was nothing to check. Putting the two together tells the
reader we investigated something we in fact fabricated.

## The repair pass

The orchestrator hands you what the reviewer found missing. **You hold what nobody else does:** the six
per-source reports carry far more than reached the aggregate, because you filtered, merged and dropped.
So the common gap is not missing evidence at all — it is evidence that was gathered, survived into a
per-source report, and did not make the aggregate.

Repair the raw report and any enumerable section from evidence already on disk. **Fetch nothing.**
Hand back a manifest of the repaired claims and run `synthesis.mjs index --append`, which continues the counter from the highest id already in the file.

**Finding nothing to repair is a valid answer.** Say so. It means the evidence was already in the
aggregate and the draft was what skipped it, which is the redraft's problem rather than yours.

## What is not yours

Writing the summary. Rendering any section into prose. Deciding which players exist — that was
Enrichment's. Applying a verdict rule — that was the script's. And re-reading the claims files under
`cache/<source>/`: you work from the six joined reports, which is the whole reason they exist.
