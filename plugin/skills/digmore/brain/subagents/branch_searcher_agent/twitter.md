# Branch Searcher — Twitter (X)

Discovery runs on WebSearch, because there is no affordable historical search of x.com. The API is
for reading tweets and vetting handles, both later steps.

**Twitter needs an API key** for anything past the title. Plan builds no Twitter branches without
one, so if you were dispatched, there is one.

## The query

```
(site:x.com OR site:twitter.com) "<topic phrase>"
```

Four rules, each learned the hard way:

- **Two or three keywords, no more.** WebSearch's `site:` operator soft-fails when too few pages
  match every keyword at once — instead of returning empty it quietly serves results from *other*
  domains. `cloudinary pricing expensive bill shocked` returns zero x.com URLs; `cloudinary
  expensive` returns several. Narrow with one well-chosen noun, not a multi-word predicate.
- **No `after:` filter.** On x.com it suppresses organic tweets and biases the top results toward
  indexed marketing accounts. Recency comes from each tweet's own `created_at` after it is fetched
  (`../../recency.md`).
- **OR both hosts.** `twitter.com` still holds older indexed content.
- **Quote the phrase** for exact match, and drop the quotes if results come back thin.

## What a result gives you

URLs and thin titles. **Tweet body text is not indexed** — x.com renders client-side, so a crawler
sees the page title, roughly the first fifteen words. That is the expected output here, not a
failure.

Harvest two things from each result:

1. **The author handle** — the Handle Vetter takes it from there.
2. **The tweet id** — the last path segment of `x.com/<handle>/status/<id>`. The Page Analyst uses
   it to pull the real body when the tweet gets quoted.

## What you write

The `branch-searcher` shape. Put the `status/<id>` URL in `url` so both the handle and the id travel
with it.

## What lands on disk

Nothing from this step. Tweet bodies and profiles are written later, by the agents that fetch them.
