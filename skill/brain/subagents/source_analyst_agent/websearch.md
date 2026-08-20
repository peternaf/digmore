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

## No handles file on this source — but you still write the players file

A web page has an author, not an account, so there is nobody for Vet to check and no
`websearch-handles.json`. You write the notes and nothing else.

Where a page's author turns up elsewhere as a Reddit, Hacker News or Twitter handle, that belongs in
the notes as a finding — it is how a byline becomes a person the Handle Vetter can reach through
another source's handles file.

## The players — `full_source_analysis/websearch-players.json`

**This is usually the richest player source in the run, and the only one with no handles file
beside it.** Every claim here is judged on page quality rather than on who said it, so what you
record is the whole of what this source contributes to who the research is about.

- **A page tagged `primary-self` is the company speaking for itself**, and its host is that
  company's domain. That is the single most reliable alias available anywhere — record it.
- **Comparison and listicle pages name twenty vendors at once.** One document, one count each. A
  "top 20 tools" article is not evidence that twenty companies matter; it is one page.
- **Watch for the same entity under several names** — the legal name, the product name, the domain.
  `aliases` is doing most of the work on this source.
- **Vendor marketing names its competitors too**, usually unfavourably. Record them; the page's own
  bias is already captured by its `primary-self` tag.

## Known gaps to record in `full_source_analysis/websearch.md`

- Any claim that traces back to a single primary source despite appearing in several pages.
- Domains that dominate the cache, so the reader knows whose framing shaped the picture.
- Paywalled or blocked pages that mattered, by URL.
