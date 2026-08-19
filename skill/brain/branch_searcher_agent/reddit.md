# Branch Searcher — Reddit

Reddit is reached through digmore's API, never from this machine. You send a query and a topic slug
and get structured results back. No account, no OAuth.

**Needs an API key.** Without one `api.mjs` exits 4 and Reddit is unavailable — not a failure. Plan
builds no Reddit branches when there is no key, so if you were dispatched, there is one.

## The command

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" reddit search <query> --topic <slug> \
  [--subreddit <name>]... [--sort {relevance|new|top|comments|hot}] \
  [--time-window {hour|day|week|month|year|all}] [--limit 20] [--after-date YYYY-MM-DD]
```

`--topic <slug>` is mandatory; the script refuses to run without it. JSON on stdout, errors on
stderr.

Exit codes: `0` success · `3` source temporarily unavailable · `4` no API key · `5` key rejected ·
`1` anything else.

## NEVER use WebSearch for Reddit

**`WebSearch site:reddit.com …` is forbidden. `api.mjs reddit search` is the only way in.**

This has happened in real runs, which is why it is stated this hard. reddit.com blocks the harness's
WebSearch UA at robots.txt, so a `site:reddit.com` query returns zero or near-zero results whatever
the topic actually holds — **and it returns them without an error**. Nothing looks wrong. The run
then reports "Reddit is thin on this topic," which is not a finding, it is the search never having
happened.

If you catch yourself reaching for WebSearch here, the answer is the script above.

## Scope to subreddits

Pass one or more `--subreddit <name>`. Multi-sub is the default; site-wide returns too much
off-topic noise on a narrow topic.

**Multi-sub is one request, merged on the API's side.** Three consequences:

- **Order carries meaning** — the first `--subreddit`'s hits rank above the second's. Reversing them
  is a different query, not the same one.
- `--limit` applies to the merged list, not per subreddit.
- `relevance` is rank *within* that merged list.

## The date window

`--time-window` defaults to `year`, Reddit's largest bounded window. For the two-year window in
`../recency.md`, pass both:

```
--time-window all --after-date <today-minus-2y>
```

`--after-date` filters on post creation on top of the unbounded window. That pair is yours to pass
on every search — the default is a floor, not the rule.

## Empty means empty

The script tells you which of two things happened, and they get different sentences:

- **`{"results": []}` on exit 0** — the topic really is thin on Reddit, and you can say so.
- **Exit 3** — the source was walled. Report it as unavailable.

You can trust that split because the API does the work: Reddit answers a blocked request with a
redirect to its login page, HTTP 200, which parses as zero results. The API spots that, retries on a
fresh connection, and reserves exit 3 for the case where every attempt was walled.

## What you return

The search output already matches the `branch-searcher` shape —
`{"results":[{"url","title","relevance"}]}`, with `relevance` rank-based.

## What lands on disk

`digmore/<slug>/cache/reddit/reddit-search-<subs|sitewide>-<sort>-<window>-<qhash>.json` — one file
per request, written by the script, naming every subreddit in the order given. A long list collapses
to `<n>subs-<hash>` so the filename stays inside the path limit.

That one file is what this dispatch leaves behind. The threads behind those URLs belong to the Page
Analyst.

If the cache file already exists, the script returns it without re-fetching.
