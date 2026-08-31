# Sections — the parts of the summary

The summary is a list of sections, in order. `research_plan.json` holds that list under
`scope.deliverables`: the key is the section's title as it will appear, the value says what belongs
in it.

Two kinds of value:

- **A pointer** — `reference/gtm-teardown.md §1.4`. A section the command already defines; that file
  holds its shape, its columns and its worked example. Nothing is repeated here.
- **A definition** — `{"type": ..., "description": ...}`. A section this run invented, which no file
  defines. `scope.sections` carries the rest of its spec.

Predefined sections come first, in the command's order. Invented ones follow.

## The three types

| Type | What it is | Produced from |
| --- | --- | --- |
| `text` | Prose. A verdict, an answer to one question, a paragraph of caveats. | Written from the claims |
| `list` | One line per item, in a stated order. A timeline, a set of complaints. | A CSV, one row per line |
| `chart` | A table. Columns, one row per entity. | A CSV, one row per row |

`list` and `chart` are **enumerable**: the section is rendered from a file, never written from
memory. `text` is not, and nothing below applies to it.

## An enumerable section gets its own CSV

Named after the section, kebab-cased: `Paid promoter programmes` → `paid-promoter-programmes.csv`,
in the topic directory beside `players.csv`.

Three sections already have a file and keep it: players → `players.csv`, hubs and individuals →
`experts.csv`, promoters → `promoter_network.csv`. A section that maps onto one of those uses it
rather than making a second file of the same thing.

## Planning the file — in Plan

An invented enumerable section is not usable until `scope.sections` says what a row is. Five things,
and a section is under-specified without them:

```json
"Paid promoter programmes": {
  "type": "chart",
  "csv": "paid-promoter-programmes.csv",
  "row_is": "one formal programme the company runs to pay or reward people for promoting it",
  "fields": [
    {"name": "programme", "description": "The programme's own name, as the company writes it."},
    {"name": "url", "description": "The programme's page on the company's site."}
  ],
  "sort": "first_seen ascending",
  "render": "One row per programme. The programme name is the link."
}
```

- **`row_is`** decides what belongs in the file and what does not. Without it, two people filling the
  same file disagree about what a row means and the section becomes a mixture.
- **`fields`** are the columns, each with what goes in the cell. Write them as instructions, not
  labels: "what a participant receives, in the units the page states" tells the filler what to do;
  "pays" does not.
- **`sort`** decides the order. A list with no stated order gets whatever order the rows happened to
  arrive in.
- **`render`** says how a row becomes a line or a table row.

## Filling the file — during the run

The claims come back from the readers. **The Source aggregator writes the rows**
(`subagents/source_aggregator_agent.md`), building each declared enumerable section before it writes
the claim index — one writer per file, per `phases/index.md`.

Three of these files have a different owner and keep it: `players.csv` is the orchestrator's, written
in Enrichment; `experts.csv` is the orchestrator's, written in Vet. Everything else an enumerable
section renders from — the CSV for a section this run invented, and `promoter_network.csv` — is the
Source aggregator's.

Rules for a cell:

- **A cell has a source or it is `—`.** Never a guess, never a placeholder, never `UNAVAILABLE` on
  its own.
- **A row with nothing behind it does not exist.** An entity worth naming with no evidence is a
  finding for `audit.md`, not a row.
- **`url` is where the thing is**, not where the evidence is. The evidence is the claim's citation
  and travels with the claim.

## Rendering the section

**The Final report writer renders it, from the finished file, never from memory**
(`subagents/final_report_writer_agent.md`). This rule holds for every enumerable section, predefined
or invented:

- **One row, one entry.** The section and the file match: nothing in the section that is not a row, no
  row silently missing. An entity worth naming that has no row is a known-gap for `audit.md`, not a
  line added at drafting time — the row set was settled from a count across every source, and a row
  invented here would have no evidence behind it and no record of why it qualified.
- **The name is the link** — `[r/LocalLLaMA](https://old.reddit.com/r/LocalLLaMA)` — taken from the
  row's `url`. Never a separate URL column, and never a bare name. This is the *destination*, not the
  citation: cite-or-drop proves the claim, and says nothing about whether the reader can reach the
  thing. A section can satisfy every other rule in the brain and still name twelve communities nobody
  can visit.
- **Keep the sections apart.** Rows carry their kind, so people render into the people section and
  communities into theirs. Rendering from one file does not merge them.
- **A row whose `url` is genuinely unknown** renders unlinked and is recorded in `audit.md` as a
  known-gap. It is never quietly dropped, and the gap is never hidden by omitting the entity.

Citations still attach to the claims made *about* each entity. This adds the destination; it replaces
nothing.

## The observation section — the last one, and not a deliverable

**Every command's summary ends with "LLM free-flow observations", and no run decides that.** It is
not in `scope.deliverables` and Plan does not plan it: it fits neither kind of value there — not a
pointer to a command's reference file, not a definition for a section the run invented — because it is
in every command, every run, in the same place.

**Where its content comes from.** The Source aggregator merges every source's observations, adds its
own cross-source ones, and writes `observations.md`. **The Final report writer copies that file in
verbatim** as the last section; it does not rewrite it. Every other section is rewritten because it is
built from claims Audit later verifies, and this one has no such backstop — so each rewrite would be
an unchecked chance for the meaning to shift.

**It carries no citations, by design**, and cite-or-drop does not apply to it — see `output.md`.
Three things follow, and each is enforced somewhere rather than remembered:

- **The fact check never sees it.** `factcheck.mjs prepare` excludes it, so it never reaches
  `cache/audit/unmarked.md` and `[6.4/6]` cannot cut it as prose with no claim behind it.
- **`factcheck.mjs` owns the section's title**, in `UNCHECKED_SECTIONS`, and this file points at it
  rather than repeating the string. Two copies would drift, and a title reworded here alone would
  silently put the section back in front of the writer.
- **The vetted-voice check skips it.** A section with no `legit` citation normally opens by saying
  so; this one has no citations at all, so the banner would fire every run.

**The footer is not a section**, and shares no rule with this. The orchestrator appends it after
everything, and the writer is told not to add it — where it *is* told to add this one.

## Who checks it

Two agents, one question each, and they are not the same question:

- **Is every declared section present at all?** The Final report reviewer, against
  `scope.deliverables` (`subagents/final_report_reviewer_agent.md`). It needs no CSV.
- **Does each enumerable section match its CSV row for row, and is each name a link?** The Final
  report writer, on the draft it just produced. It renders those sections *from* those files, so the
  check costs nothing and it can fix what it finds while it still holds the evidence.

Both are the agents reading their own output. Neither is a scripted gate — `validate.mjs` reads JSON
against a shape, and a CSV and a summary are neither.
