# Source Analyst — the open web

## What is on disk

`digmore/<slug>/cache/websearch/`:

| File | What it is |
|---|---|
| `<name>.md` | one per page the run read: the stripped markdown, every page merged |
| `<name>-claims.json` | the Page Analyst's extraction from it |

`<name>` is the URL, slugged — host first — so the directory listing already tells you which domains
the run leaned on.

## What the open web gives you that a single page cannot

- **Who is repeating whom.** The same figure in five articles is usually one primary source and four
  restatements. Trace it back: if four of the five cite the same press release, that is one source,
  and the report should say so rather than counting to five.
- **The domain mix.** Read the filenames as a whole. A topic covered only by vendor blogs is a
  different state of the world from one with analyst reports and regulatory filings in the pile.
- **What the vendors say versus what everyone else says.** `primary-self` pages and `secondary` pages
  on the same claim, side by side, is the cheapest credibility check the run has.
- **Recency drift.** The search carried no date filter, so this cache spans whatever the web offered.
  Where old and new pages disagree, that is a change over time, not a contradiction.
- **What is conspicuously absent.** A question every forum asks and no article answers is worth a
  line.

## Coverage, honestly

- **The search returned at most a few dozen results per query**, and the run read the top of that.
  This is a slice of the open web, never a survey of it.
- **Paywalled pages arrived thin.** They are in the cache as low-content files. Note which topics
  were mostly behind a paywall — that is a real limit on what the run could establish.

## Known gaps to record in `full_source_analysis/websearch.md`

- Any claim that traces back to a single primary source despite appearing in several pages.
- Domains that dominate the cache, so the reader knows whose framing shaped the picture.
- Paywalled or blocked pages that mattered, by URL.
