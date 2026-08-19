# Reddit source

Script: `api.mjs reddit`. Reddit is reached through digmore's API, not from this machine — the plugin sends a query and a topic slug and gets structured results back. No account, no OAuth, nothing to configure beyond the API key.

**This source needs an API key.** Without one, `api.mjs` exits 4 and the source is unavailable. That is not a failure: the run proceeds without Reddit and says so, in the summary and in the terminal output. See `../phases/extract_phase_b.md` "Search" and `../phases/audit_phase_e.md` §5.

## CLI surface

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" reddit search <query> --topic <slug> [--subreddit <name>]... [--sort {relevance|new|top|comments|hot}] [--time-window {hour|day|week|month|year|all}] [--limit 20] [--after-date YYYY-MM-DD]
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" reddit thread <id-or-permalink> --topic <slug> [--limit 500]
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" reddit user   <name> --topic <slug>
```

**`reddit user` returns the snapshot and the verdict together.** Vetting is computation over comments that call has already fetched, so the verdict costs no extra request.

All commands emit JSON to stdout. Errors to stderr. **`--topic <slug>` is mandatory on every call** and the script refuses to run without it.

Exit codes: `0` success · `3` the source is temporarily unavailable · `4` no API key, source disabled · `5` the key was rejected · `1` anything else, including a request blocked in transit.

## Search — Discovery

Discovery is `api.mjs reddit search`. Output matches the Branch searcher schema: `{"results":[{"url","title","relevance"}]}`, `relevance` rank-based.

Do not try WebSearch for reddit.com — the harness's WebSearch UA is blocked at robots.txt and `WebSearch site:reddit.com ...` fails silently, returning 0 or near-0 results regardless of content. If a person- or company-inquiry concludes "Reddit is empty on this topic" without `api.mjs reddit search` having been run, that conclusion is unfounded — re-run via the script. See `../phases/extract_phase_b.md` §"Source-tool discipline" for the full no-substitution rule.

**An empty result from the script means empty.** Reddit answers a blocked request with a redirect to its login page, which returns HTTP 200 and parses as zero results. The API detects that, retries on a fresh connection, and reports exit 3 only once every attempt is walled. So `{"results": []}` from `api.mjs reddit search` is a thin topic and can be reported as one; exit 3 is the source being unavailable and is reported that way instead. The two are never the same statement.

Pass one or more `--subreddit <name>` to scope to topically relevant subreddits. Multi-sub is the default; site-wide (no `--subreddit`) returns too much off-topic noise on narrow topics.

**Multi-sub is one request, and the merge happens on the far side of the API.** Order carries meaning — the first `--subreddit`'s hits rank above the second's — `--limit` applies to the merged list rather than per subreddit, and `relevance` is rank *within* that merged list. Reversing the subs is a different query with different results, not the same one.

**`--time-window` defaults to `year`**, Reddit's largest bounded window. For `recency.md`'s 2-year window pass `--time-window all --after-date <today-minus-2y>`: `--after-date` applies a post-creation filter on top of the unbounded window. That pair is the caller's job on every discovery search — the default is a floor, not the rule.

After search returns URLs, Source extractors call `api.mjs reddit thread` on each.

## What you get back

- `Post` — id, title, url, selftext, author, subreddit, score, num_comments, created_utc, permalink, **comments**.

The array is `comments`, not `top_comments`: what it holds is decided by `--limit` and by the sort asked for, neither of which is a property of the field. Highest-scoring first, capped at `--limit`. **`num_comments` is the thread's real size and can be larger** — when it is, the rest were not returned, and you are reading part of a thread. Say so rather than implying you read it all; see Known gaps below. Comments arrive flat, and `parent_id` rebuilds the tree: `t3_<id>` is top level, `t1_<id>` is a reply.
- `Comment` — id, author, body, score, created_utc, permalink, parent_id.
- `User` — name, link_karma, comment_karma, created_utc, **recent_comments**, **verdict, signals, reason**.

`recent_comments` is **one object per comment** — body, subreddit, created_utc, permalink, score — up to 100, Reddit's page cap. Each comment carries its own subreddit and timestamp, so read them off the object; never pair separate lists by position. A comment on a profile post reads `u_<name>`, Reddit's own naming. `id`, `author` and `parent_id` are not here: the author is the user you looked up, and threading only means something inside a thread, which is what `reddit thread` returns under `comments`.

## Vet — vetting (`vet_user`)

The verdict arrives inside `reddit user`, alongside the `recent_comments` that step 4's topical-relevance check reads. One call returns both. See `../phases/vet_phase_c.md` step 3.

Reddit vetting signals combined into a verdict (legit / unknown / promoter / spammer / troll):

1. Account age < 30 days + low karma → `unknown` (suspicious).
2. Same URL host repeated 5+ times across recent comments → `promoter`. 10+ → `spammer`.
3. Same brand-shaped token (`acme.com`-style) repeated 5+ times → `promoter`.
4. 80%+ of recent comments in one sub (with ≥10 comments) → `unknown` (fanboy).
5. Multi-year history (age ≥ 730d) + total karma ≥ 100 + comment karma ≥ 1000 → `legit`.
6. Burst posting (50 comments in ≤ 2h window) → `spammer`.
7. Topical relevance — `vet_user` doesn't know the topic. The orchestrator layers this check (see `../vetting.md` §"Topical relevance").

## Cache layout

`digmore/<slug>/cache/reddit/`:
- `search-<subs-joined-or-sitewide>-<sort>-<time-window>-<qhash>.json` — one file per request, naming every sub in the order given. A long sub list collapses to `<n>subs-<hash>` so the filename stays inside the path limit.
- `thread-<id>.json` — the full Post, `comments` and all. Written by `reddit thread`.
- `user-about-<name>.json` — profile fields (name, karma, age).
- `user-comments-<name>.json` — the `recent_comments` array, whole objects.
- `vet-<name>.json` — the verdict, signals and reason.

**The last three are all written by one `reddit user` call**, which splits its single response across them. Nothing else writes any of the three.

Resumable: if a cache file exists, the script returns it without re-fetching.

## Known gaps

1. Comment trees may be truncated at `--limit` (default 500) per page. Deeper expansion via "load more comments" anchors is not implemented. **You can tell when it happened: `num_comments` is the thread's real size, so `num_comments > comments.length` means the rest were not returned.** Record the shortfall in `source_notes/reddit.md` with both numbers; don't pretend coverage is total.
2. `[deleted]` / `[removed]` content — body invisible, attribution lost.
3. User history is capped by Reddit's UI — vetting only sees the recent slice for very old, very active accounts.

## Anonymity

Nothing about the user reaches Reddit: the request goes to digmore's API, which owns whatever fetching discipline the source needs. The plugin sends a topic slug and a query and nothing else.
