# The user's own documents

The user's own material: documents and text they hand over. Free, no key, no network — this source runs whether or not digmore's API is configured, and it is the only source whose content never leaves the machine.

The only source whose content never leaves the machine.

## What this source reads

Two things, and only these two:

1. **Files the user names.** Any path they give you — a markdown file, a text file, a CSV, a spreadsheet export, meeting notes, a pasted transcript saved to disk.
2. **Text the user pastes into the conversation** and asks you to fold into the research.

Read the file with the harness's own Read tool. There is no script for this source: the file is already local, and a fetch would be a detour through the network to reach something on disk.

## What this source does NOT read

- **PDFs.** Out of scope for this version.
- **YouTube links, or any other link the user hands over expecting it to be scraped.** A link is not a document. If it is a web page worth reading, it belongs to `websearch.md` or `forums.md` and goes through `fetch.mjs`; if it is a video, digmore cannot read it.
- **Directories the user has not named.** Never go looking. Read what you were given and nothing adjacent to it.

When the user hands over something out of scope, say so plainly, once, and carry on with what is in scope. Do not silently skip it — a source the user believes is in the research and is not is worse than one they know was refused.

## Search — Discovery

This source has no search. It fans out like every other source — one sub-agent per `(local × angle)` pair — but each sub-agent reads the same handed-over material through the lens of its angle, rather than issuing a query.

Copy each file the user names into `digmore/<slug>/cache/local/` before reading it, keeping the original filename. Two reasons: the run's own rule is that everything it works from lives under the topic directory, and a file the user later edits or moves would otherwise make the run unreproducible and its citations unresolvable.

Pasted text is written to `digmore/<slug>/cache/local/pasted-<n>.md` with a first line recording when it arrived and what the user said it was.

The sub-agent returns the Branch searcher schema like any other, with the file path in `url`.

## Citation — by path and location, not URL

There is no URL. A claim from this source cites the file and the place inside it, precisely enough that the user can go and look:

```
([pricing-notes.md, "Enterprise tier" section](digmore/<slug>/cache/local/pricing-notes.md))
([board-update-q2.txt, lines 40-48](digmore/<slug>/cache/local/board-update-q2.txt))
([pasted-1.md, the paragraph on churn](digmore/<slug>/cache/local/pasted-1.md))
```

Use a section heading where the file has one, a line range where it does not. "Somewhere in the notes" is not a citation, and cite-or-drop applies here exactly as it does everywhere else: if you cannot point at where the file says it, the claim does not appear.

## Source quality

Everything from this source is tagged `internal`.

`internal` sits outside the `primary-3p > primary-self > … ` ranking in `../vetting.md` on purpose, because it is not comparable to a public source. It is first-hand and usually the most accurate account of the user's own business that exists anywhere. It is also unverifiable by anyone else and may be an early draft, a stale number, or one colleague's opinion written down.

So:

- **Never present an `internal` claim as external corroboration.** It is the user telling us something. If the summary says "the market prices this at $40" and the only source is the user's own pricing notes, that is not a market fact.
- **`internal` never satisfies the multi-source corroboration test** in `../phases/synthesize_phase_d.md` on its own. It can be one of the two axes, never both.
- **Where an internal claim and an external source disagree, surface both** and say which is which. That disagreement is usually the most valuable thing in the run — it is the user's belief meeting the evidence.

## Vetting — `vet_user` does not apply

There is no handle on this source, so there is nobody to vet. `vet_user` is not run, no verdict is recorded, and nothing from this source is ever added to `experts.csv`.

The credibility question does not disappear, it just changes shape: the user vouched for this material by handing it over. What still applies is the source-quality rule above and the cite-or-drop rule. What does not apply is any part of `../vetting.md` that depends on a person having an account somewhere.

## Modes

Defined in all four cells, per `../modes.md`:

| | Full | Quick |
| --- | --- | --- |
| **Manual** | Read every file the user named, in full. If they mention material they have not given you a path to, ask for it once before Scope. | Read every file the user named, in full. Files are the user's own and usually few; there is nothing to cap. Do not ask for more. |
| **Auto** | Read every file the user named, in full. Never prompt for more — name anything referred to but not supplied in the run's Issues. | Same as auto + full. |

The source is never skipped for depth. A user who hands over a document expects it read, and reading local files costs nothing but context.

If the material is genuinely too large for one context, say so in the run's Issues rather than sampling silently — a partial read presented as a full one is the failure mode this source is most exposed to.

## Recency

No window. `../recency.md`'s two-year cutoff is about the public web going stale; the user chose this file, and its age is their call. Note the date if the file carries one and it matters to a claim.

## Known gaps

1. **No PDFs**, which is the format most of this material actually arrives in.
2. **No spreadsheet semantics.** A CSV is read as text; formulas, multiple sheets and formatting are lost.
3. **No way to tell a draft from a decision.** A file saying "we should raise prices to $60" may be a plan or a passing thought, and nothing in the file distinguishes them. Where a claim turns on that difference, ask, or mark it uncertain and say why.
