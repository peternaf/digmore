# Branch Searcher — Hacker News

Free, no key. This source runs whether or not digmore's API is configured.

## The query

```
WebSearch site:news.ycombinator.com <query>
```

Two or three keywords. No `after:` — recency on Hacker News is applied by the script when a person
is vetted, not by the query (`../../recency.md`).

From each result, harvest the **item id**: the `<N>` in `news.ycombinator.com/item?id=<N>`. That id
is what you return. The Page Analyst calls `hackernews.mjs story <N>` on each one to get the
comment tree.

## Algolia keyword search is not a discovery path

`hn.algolia.com/api/v1/search?query=` returns too many off-topic matches on a semantically ambiguous
query. That is why `hackernews.mjs` has no `search` verb, and adding one is out of scope. Discovery
is WebSearch; the script takes it from the item id onward.

## The snippet is the title, not the thread

A WebSearch result on Hacker News gives you the story title and little else. The content is in the
comments, and only `hackernews.mjs story` returns them — which is the Page Analyst's step. Return
the URL and let it do that.

## What you return

The `branch-searcher` shape. `url` is the `item?id=<N>` link, `title` the story title, `relevance`
your estimate for this angle.

## What lands on disk

Nothing from this step. WebSearch results live in what you return; the story trees are written by
the Page Analyst as `digmore/<slug>/cache/hackernews/hackernews-item-<N>.json`.
