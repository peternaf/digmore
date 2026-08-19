# Hacker News source

Script: `hackernews.mjs`. Free, no key, no API gate — this source runs whether or not digmore's API is configured. Two data sources:
- Algolia HN API — `hn.algolia.com/api/v1` — public, no auth. Item trees + per-user metadata.
- HN user pages — `news.ycombinator.com/user?id=<name>` — HTML; the only source for `account_age`. Rate-limited aggressively.

## CLI surface

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/hackernews.mjs" story <item_id> --topic <slug>
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/hackernews.mjs" user  <name>    --topic <slug>
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/hackernews.mjs" vet   <name>    --topic <slug>
```

JSON on stdout. **`--topic <slug>` is mandatory on every call** and the script refuses to run without it.

Three verbs. Discovery happens through WebSearch — see below.

## Search — Discovery

Discovery is `WebSearch site:news.ycombinator.com <query>` + `after:<YYYY-MM-DD>`. The Branch searcher harvests `item?id=<N>` URLs, then for each calls `hackernews.mjs story <N>`.

Algolia's own keyword search (`/api/v1/search?query=`) is intentionally NOT used as a discovery path — it returns too many off-topic matches on semantically ambiguous queries. That is why the script has no `search` verb, and adding one is out of scope. Once you have item IDs, this module fetches their trees.

What you must not do is stop at the WebSearch result. The snippet is the story title and little else; the comments are where the content is, and only `story` returns them.

## What you get back

- `Story` — id, title, url, points, num_comments, author, created_utc, top_comments (flattened tree, depth ≤ 3).
- `Comment` — id, author, text, parent_id, story_id, created_utc.
- `User` — name, karma, created_utc, about, stories_submitted (lifetime), comments_submitted (lifetime), comment_count_sampled, recent_comment_excerpts, last_activity_utc.

## Recency

The recent-comment search is filtered to the last two years, per `../recency.md`. The two counting calls are deliberately not filtered: they exist to read lifetime totals and the true date a person last posted. Filtering them would turn "comments this account has ever posted" into "comments in the last two years", and would make anyone dormant for longer than the window look as though they had never posted at all — the opposite of the signal the Hubs table wants.

## Rate limiting & graceful degradation

Calls to `news.ycombinator.com` are serialized with a 15s minimum interval between consecutive calls. 429s trigger exponential backoff (5s, 15s, 45s).

If backoff is exhausted, `user` falls back to Algolia's `/users/<name>` endpoint for karma + bio. The fallback loses `created_utc` (account age) — vetting tolerates this, and karma alone can still reach a `legit` verdict.

## Vet — vetting (`vet_user`)

HN signals, in order:

1. Missing / throwaway profile → `unknown`.
2. Bio host repeated ≥3 times in recent comments → `promoter`. Excludes platform hosts (`news.ycombinator.com`, `ycombinator.com`, `hn.algolia.com`) — moderators and regulars routinely link to HN itself.
3. Non-bio, non-platform host repeated ≥5 times → `spammer`.
4. Account age < 90 days + karma < 50 → `unknown` (young + low-karma).
5. Submitter-only (zero comments sampled) → `unknown`.
6. Karma > 1000 → `legit` (heavy contributor; karma alone is enough regardless of age, including when age is unknown via the fallback).
7. Age ≥ 2 years + karma > 100 → `legit`.
8. Anything else → `unknown` (insufficient signal).

Karma replaces "distinct sub count" — Algolia's recent-comments slice often clusters in a few topics even for heavy commenters.

## Cache layout

`digmore/<slug>/cache/hackernews/`:
- `item-<N>.json` — full story tree.
- `user-page-<name>.html` — HN web page.
- `user-comments-<name>.json` — Algolia recent-comments payload.
- `user-algolia-<name>.json` — fallback payload when HN web is 429-blocked.
- `vet-<name>.json` — the verdict, signals and reason from `vet`.

## Known gaps

1. HN web is the bottleneck — a 15s gap minimum between calls. Algolia is not rate-limited in practice.
2. The comment tree flattens to depth 3, so deeper sub-threads are dropped. For analysis of long argumentative chains, that limit is real — say so in `source_notes/hackernews.md` rather than implying full coverage.

## Anonymity

UA from the shared pool in `scripts/fetch.mjs`. Algolia doesn't care; the HN web page sees a normal Chrome string.
