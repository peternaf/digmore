# Branch Searcher — the open web

Claude Code's `WebSearch` tool. Free, no key, and the backbone of a run with no API key configured.

## The query

- **Two or three keywords.** A long query narrows to nothing and, with a `site:` filter, quietly
  falls back to other domains.
- **Quote multi-word phrases** for exact match. Drop the quotes if results come back thin.
- **No `after:` filter.** WebSearch's date operator is approximate — older content slips through
  either way — so the window is judged when the page is read, not asked for in the query. The
  sources that can filter by date properly do it in their own scripts (`../../recency.md`).

## Spend the budget on angles, not on rewordings

Claude Code caps web searches per session, and a deep run can reach it. Several angle-specific
queries are worth more than one broad query run again with small variations. If the cap is hit
mid-run the run does not fail — the user starts a new session and resumes from the cache
(`../../phases/index.md`).

## `site:` on a host with no source file

Ordinary web search, and fine. Code hosts and Q&A sites reach the report this way — their content
arrives, just without the extra signals a dedicated source would add.

The three hosts that have their own file in this directory — `reddit.md`, `hackernews.md`,
`twitter.md` — are the exception, and each explains why.

## What comes back

Titles, short snippets and URLs. Enough to rank a candidate, not enough to extract a claim from —
the Page Analyst opens what you return.

## What you return

The `branch-searcher` shape.

## Known gaps worth knowing while ranking

- **Paywalls.** A paywalled page surfaces as a thin, low-content result. Rank it low unless nothing
  else covers the point.
- **A few dozen results per query, maximum.** Breadth comes from more angles, not from a bigger
  query.
