# Source Analyst — specialty forums

## What is on disk

`digmore/<slug>/cache/forums/`:

| File | What it is |
|---|---|
| `<name>.md` | one per thread the run read: the stripped markdown, every page merged, nesting kept |
| `<name>-claims.json` | the Page Analyst's extraction from it |

`<name>` is the URL slugged, host first, so you can see at a glance which forums the run reached.

## What forums give you that a single thread cannot

- **Which forums are alive on this topic at all.** The set of domains in this directory is a finding
  in itself: where a community has settled, and where it has moved away from.
- **Resolution rate.** Forums are where problems get solved or abandoned. Count it roughly — threads
  that reached an accepted answer against threads that trailed off. A topic where nothing resolves is
  a topic where the tooling is failing people.
- **The same regulars.** Small forums are carried by a handful of people. One name answering across
  several threads is the most credible voice the source has, and worth naming.
- **Vocabulary that differs from the vendor's.** Forums call things what users call them, which is
  often not what the marketing does. That gap is useful to the report and to any later run.
- **Age.** Forum threads run for years. A 2019 thread still getting replies means the problem was
  never fixed.

## Coverage, honestly

This is the weakest source for credibility and the most uneven for coverage:

- **Reputation signals are inconsistent.** Some forums expose post counts, badges or trust levels;
  most expose nothing. Where the Page Analyst recorded them, they are in the claims; where it did
  not, the handle carries no weight at all.
- **Blocked and unreadable forums are absent, not empty.** Forums that returned 403 on every attempt,
  or that need JavaScript, produced nothing — and nothing looks identical to a quiet forum. The Page
  Analyst reported those; carry them forward so the absence is on the record.
- **Discord threads are partial** wherever they appear. Only the visible slice loads.

## Known gaps to record in `full_source_analysis/forums.md`

- Forums that were found in search and could not be read, by domain and reason.
- Threads cut short by the fetch budget mid-pagination, where the resolution was probably on a page
  nobody reached.
- Any forum whose posts are anonymised after account closure, where quotes exist but attribution
  does not.
