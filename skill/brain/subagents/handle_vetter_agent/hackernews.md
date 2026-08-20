# Handle Vetter — Hacker News

Free, no key. **The slowest source in the run** — read the rate limit section before planning
anything.

## The commands

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/hackernews.mjs" user <name> --topic <slug>
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/hackernews.mjs" vet  <name> --topic <slug>
```

`user` is the snapshot, `vet` is the verdict. `--topic <slug>` is mandatory on both.

## Expect to wait

Calls to `news.ycombinator.com` are serialised at **one every 15 seconds**, with backoff at 5s, 15s
and 45s on a 429. Algolia is not rate-limited in practice, but the HN web page is the only source of
account age, so most vets touch it.

Two or three requests per handle means a minute or more each, and **only one of these agents runs at
a time on Hacker News** — the throttle is per process, and the first request in a fresh process does
not wait at all, so running several in parallel would hammer the host rather than sharing the limit.

Log the wait. A quiet dispatch here is a working one.

## What comes back

`name`, `karma`, `created_utc`, `about`, `stories_submitted` and `comments_submitted` (both
lifetime), `comment_count_sampled`, `recent_comment_excerpts`, `last_activity_utc`.

**The lifetime counts are deliberately unfiltered by date**, while the recent-comment sample is
filtered to two years. That is on purpose: filtering the counts would turn "comments this account
has ever posted" into "comments recently", and would make anyone dormant longer than the window look
as though they had never posted at all.

## The signals behind the verdict

In order:

1. Missing or empty profile → `unknown`. The page could not be read, which is not a judgement about
   the person — do not confuse it with the `throwaway` verdict at 4.
2. Bio host repeated ≥3 times in recent comments → `promoter`. Platform hosts are excluded —
   `news.ycombinator.com`, `ycombinator.com`, `hn.algolia.com` — because regulars link to HN itself
   constantly.
3. A non-bio, non-platform host repeated ≥5 times → `spammer`.
4. Under 90 days old, karma < 50, and fewer than 20 lifetime posts → `throwaway`. All three
   together, never one alone.
5. Zero comments sampled, submissions only → `unknown`.
6. **Karma > 1000 → `legit`.** On its own, regardless of age, including when age is unknown.
7. Age ≥ 2 years with karma > 100 → `legit`.
8. Anything else → `unknown`.

Karma does the work here that subreddit spread does on Reddit. Algolia's recent-comment slice
clusters in a few topics even for heavy commenters, so breadth is not a usable signal on this source.

## When the web page will not answer

If backoff is exhausted, `user` falls back to Algolia's `/users/<name>` endpoint for karma and bio.

**The fallback loses `created_utc`**, so account age is unknown. That is tolerable — rule 6 above
reaches `legit` on karma alone, which is why it exists. Say in your `reason` that age was unavailable.

## Your part — topical relevance

Read `recent_comment_excerpts` against the research question.

Harder here than on Reddit: HN has no subreddits, so there is no cheap proxy for what someone works
on. Read the excerpts properly. Someone whose recent comments circle your subject from several
angles is `high`; someone who mentioned it once in a thread about something else is `low`.

## `last_active`

`last_activity_utc`, as `YYYY-MM-DD`.

## What lands on disk

`digmore/<slug>/cache/hackernews/`:

- `hackernews-user-page-<name>.html` — the HN web page.
- `hackernews-user-comments-<name>.json` — the Algolia recent-comments payload.
- `hackernews-user-algolia-<name>.json` — the fallback payload, when the web page was 429-blocked.

## Known gap

**The `vet` verb caches nothing.** It returns a verdict and leaves no file, so a resumed run re-vets
every handle from scratch — at 15 seconds a request, on the slowest source there is. Worth knowing
when a run is interrupted mid-Vet.
