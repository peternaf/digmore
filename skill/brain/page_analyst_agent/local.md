# Page Analyst — the user's own documents

Already on disk, copied into `digmore/<slug>/cache/local/` by the Branch Searcher. **No fetch, no
stripping, no network.** Read the file where it is, with the harness's own Read tool.

The only source whose content never leaves the machine.

## Cite by path and location

There is no URL. A claim from this source names the file and the place inside it, precisely enough
that the user can go and look:

```
([pricing-notes.md, "Enterprise tier" section](digmore/<slug>/cache/local/pricing-notes.md))
([board-update-q2.txt, lines 40-48](digmore/<slug>/cache/local/board-update-q2.txt))
([pasted-1.md, the paragraph on churn](digmore/<slug>/cache/local/pasted-1.md))
```

A section heading where the file has one, a line range where it does not. "Somewhere in the notes"
is not a citation, and cite-or-drop applies here exactly as everywhere else.

## Source quality — `internal`, and it sits outside the ranking

Everything from this source is tagged `internal`. It is deliberately not comparable to a public
source: first-hand and usually the most accurate account of the user's own business that exists
anywhere, and at the same time unverifiable by anyone else, possibly an early draft, a stale number,
or one colleague's opinion written down.

Three rules follow:

- **An `internal` claim is never external corroboration.** If the summary says "the market prices
  this at $40" and the only source is the user's own pricing notes, that is not a market fact.
- **`internal` never satisfies multi-source corroboration on its own.** It can be one of the two
  axes, never both.
- **Where an internal claim and an external source disagree, surface both** and say which is which.
  That disagreement is often the most valuable thing in the run — it is the user's belief meeting
  the evidence.

## What lands on disk

One file: `digmore/<slug>/cache/local/<document-filename>-claims.json`.

The document itself is already there, copied in by the Branch Searcher under its original name. You
do not rewrite it — this is the one source where the page half of the pair was not yours to make.

## Read all of it

Files the user handed over are few and are theirs. Read each one in full — there is nothing to cap
here, and the cost is context, not requests.

If the material is genuinely too large for one context, **say so** rather than sampling quietly. A
partial read presented as a full one is the failure this source is most exposed to.

## No date window

`../recency.md`'s two-year cutoff is about the public web going stale. The user chose this file; its
age is their call. Note the date where the file carries one and a claim turns on it.

## Known gaps

- **No PDFs** — which is the format most of this material actually arrives in. Say so once, plainly,
  and carry on with what is in scope.
- **No spreadsheet semantics.** A CSV is read as text; formulas, multiple sheets and formatting are
  lost.
- **No way to tell a draft from a decision.** A file saying "we should raise prices to $60" may be a
  plan or a passing thought, and nothing in the file distinguishes them. Where a claim turns on that
  difference, mark it uncertain and say why.
