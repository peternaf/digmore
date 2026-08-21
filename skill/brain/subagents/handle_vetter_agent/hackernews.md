# Handle Vetter — Hacker News

Free, no key. Two hosts, neither throttled: the Algolia HN API, and the official Firebase HN API at
`hacker-news.firebaseio.com`.

## The commands

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/hackernews.mjs" user <name> --topic <slug>
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/hackernews.mjs" vet  <name> --topic <slug>
```

`user` is the snapshot, `vet` is the verdict. `--topic <slug>` is mandatory on both.

## Speed

A handle costs about a second, and handles can run beside each other. Vet Hacker News the way you
vet any other source — batch it, fan it out, and put it next to the rest.

**A quiet heartbeat here is suspicious after one minute, not the two that
`../../phases/index.md` §"When a sub-agent goes quiet" allows by default.** That default is sized
for the open web, where a single fetch can honestly stall; nothing on this source can. Everything
else in that section is unchanged — one minute is when to look, and the line still decides.

Until 2026-08-21 account age was scraped from a `news.ycombinator.com/user` page that allowed one
request per 15 seconds, which made this the slowest source in a run by a wide margin and forced it
to be worked one handle at a time by a single agent. Firebase serves the same fields unthrottled.
If you find a brain file, an old plan or a habit that still budgets minutes for this source, it is
out of date.

## What comes back

`name`, `karma`, `created_utc`, `about`, `stories_submitted` and `comments_submitted` (both
lifetime), `comment_count_sampled`, `recent_comments`, `last_activity_utc`,
`recent_posts_checked` and `recent_posts_dead`.

**`recent_comments` carries each comment in full**, not an excerpt — `text`, plus `id`,
`story_id`, `story_title` and `created_utc`. Algolia returns the whole thing and keeping it costs
nothing; Enrichment extracts from these bodies later, and `story_id` is how it reaches the thread a
comment sits in.

**The lifetime counts are deliberately unfiltered by date**, while the recent-comment sample is
filtered to two years. That is on purpose: filtering the counts would turn "comments this account
has ever posted" into "comments recently", and would make anyone dormant longer than the window look
as though they had never posted at all.

## The signals behind the verdict

In order:

1. Missing or empty profile → `unknown`. The account does not exist, or could not be read — which is
   not a judgement about the person. Do not confuse it with `throwaway` below.
2. **Enough of the sampled recent posts came back dead → `throwaway`, reason `shadowbanned`.** The
   threshold is `DEAD_POSTS_FOR_SHADOWBAN` in `hackernews.mjs`, an absolute count rather than a
   ratio so it cannot fire on an account with one or two submissions to its name. Checked before the
   host counts below, because nobody reads a shadowbanned account and there is no point weighing its
   comments for promotion.
3. Bio host repeated enough times in recent comments → `promoter`. Platform hosts are excluded —
   `news.ycombinator.com`, `ycombinator.com`, `hn.algolia.com` — because regulars link to HN itself
   constantly.
4. A non-bio, non-platform host repeated more often still → `spammer`.
5. Young, low-karma and barely posted → `throwaway`. All three together, never one alone.
6. Zero comments sampled, submissions only → `unknown`.
7. **High karma → `legit`.** On its own, regardless of age, including when age is unknown.
8. Long-lived account with moderate karma → `legit`.
9. Anything else → `unknown`.

The thresholds are in `vetUser` in `hackernews.mjs`; read them there rather than from memory.

Karma does the work here that subreddit spread does on Reddit. Algolia's recent-comment slice
clusters in a few topics even for heavy commenters, so breadth is not a usable signal on this source.

## The shadowban check

Hacker News kills posts without telling the poster, and **Algolia 404s a dead item** — so a
shadowbanned account looks merely quiet there, and looked entirely normal to this plugin until the
Firebase swap. Firebase is the only place the `dead` flag is visible.

The check reads `dead` on the newest `hackernews.deadSampleSize` items in the profile's `submitted`
list — `preflight.mjs` prints what this run uses. It costs nothing to find them (`submitted` arrives
with the profile) and almost nothing to read them (`/item/<id>/dead.json` answers `true` or `null` in
four bytes).

**`recent_posts_checked` of `0` means the test did not run** — the user set the ceiling to zero, the
account has no submissions, or the profile came back through the Algolia fallback. It does not mean
clean. Say the check was not made rather than reporting a clean result.

A handful of dead posts is an account with a comment or two flagged, which is ordinary. It is a
clear majority of a sample that means the account itself is being killed.

## When Firebase will not answer

`user` falls back to Algolia's `/users/<name>` endpoint for karma and bio.

**The fallback loses `created_utc` and the shadowban check both**, so account age is unknown and
`recent_posts_checked` is `0`. Age being unknown is tolerable — the karma rule above reaches `legit`
without it, which is why it exists. Say in your `reason` that age was unavailable and the dead
sample was not taken.

## Your part — topical relevance

Read `recent_comments` against the research question.

Harder here than on Reddit: HN has no subreddits, so there is no cheap proxy for what someone works
on. Read the comments properly — `story_title` says what thread each one sits in, which is the
closest thing this source has to a subreddit. Someone whose recent comments circle your subject
from several angles is `high`; someone who mentioned it once in a thread about something else is
`low`.

## `last_active`

`last_activity_utc`, as `YYYY-MM-DD`.

## What lands on disk

`digmore/<slug>/cache/hackernews/`, all written by the script:

- `hackernews-vet-<name>.json` — the verdict.
- `hackernews-user-<name>.json` — the assembled snapshot the verdict was computed from.
- `hackernews-user-firebase-<name>.json` — the raw Firebase profile it was built from.
- `hackernews-user-comments-<name>.json` — the Algolia recent-comments payload.
- `hackernews-user-algolia-<name>.json` — the fallback payload, when Firebase did not answer.

**A handle already vetted is not vetted again.** The script checks for the verdict before it makes a
single request, so an interrupted run resumes at the handle it stopped on rather than re-fetching
the whole source.
