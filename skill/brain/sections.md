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

The claims come back from the readers. The **synthesizer writes the rows**, as it does for
`players.csv` — one writer per file, per `research_plan.md`.

Rules for a cell:

- **A cell has a source or it is `—`.** Never a guess, never a placeholder, never `UNAVAILABLE` on
  its own.
- **A row with nothing behind it does not exist.** An entity worth naming with no evidence is a
  finding for `audit.md`, not a row.
- **`url` is where the thing is**, not where the evidence is. The evidence is the claim's citation
  and travels with the claim.

## Rendering the section

One row, one entry. The section and the file match: nothing in the section that is not a row, no row
silently missing. See `phases/synthesize_phase_d.md` §3.6, which owns this rule for every enumerable
section, predefined or invented.

A row whose `url` is genuinely unknown renders unlinked and is recorded in `audit.md` as a
known-gap. It is never quietly dropped.

## What the audit checks

Every section in `scope.deliverables` exists in the summary, and every enumerable one matches its
file row for row (`phases/audit_phase_e.md` §0).
