# Page Analyst — Hacker News

Free, no key. Comes back as a structured tree from Algolia. **No `fetch.mjs`, no stripping** — what
the script writes is the stored page.

## The command

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/hackernews.mjs" story <item_id> --topic <slug>
```

The Branch Searcher harvested `<item_id>` from a `news.ycombinator.com/item?id=<N>` URL.
`--topic <slug>` is mandatory.

## What comes back

- **`Story`** — id, title, url, points, num_comments, author, created_utc, and **`top_comments`**.
- **`Comment`** — id, author, text, parent_id, story_id, created_utc.

The comments arrive as a tree. `parent_id` is what makes a reply a reply — keep that nesting when
you write the page.

## The tree is cut at depth 3

`top_comments` is flattened at **depth ≤ 3**, and everything below is dropped. On a long
argumentative chain — which is exactly the thread worth reading — the part being cut is where the
argument actually resolves.

**Say so when it matters.** A story whose discussion clearly ran deeper than what you were given is
partially read, and a claim drawn from the top three levels carries that limit with it.

## Rate limits

Calls to `news.ycombinator.com` are serialised at one every 15 seconds, with backoff at 5s, 15s and
45s on a 429. Algolia is not rate-limited in practice.

This means a Hacker News dispatch can sit quiet for a couple of minutes and still be working. Log
the wait rather than retrying around it.

## What lands on disk

Two files in `digmore/<slug>/cache/hackernews/`:

| File | Written by |
|---|---|
| `hackernews-item-<N>.json` | the script — the full story tree |
| `hackernews-item-<N>-claims.json` | you |

## Source quality

`forum` — community discussion. Where a comment is the author of the thing being discussed
answering for it, the claim is still `forum` by venue; note who they are in the claim instead.
Definitions in `../vetting.md`.
