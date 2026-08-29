# Page Analyst — Reddit

Reddit comes back as structured JSON from digmore's API. **No `fetch.mjs`, no stripping** — the
script has already done the equivalent, and what it writes is the stored page.

## The command

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" reddit thread <id-or-permalink>... \
  --topic <slug> [--limit 500]
```

`--topic <slug>` is mandatory. Each argument is a bare post id, a `/comments/<id>/…` path, or the
full URL — mixed forms in one call are fine.

On a failure the script says what happened on stderr — read that rather than decoding the exit code. Two change what you do: `4` means no API key, so this source is disabled rather than failed, and `3` means the source is temporarily unavailable. Anything else is a failure to report as one.

## Fetch the whole batch first, in one call

**Pass every URL in your batch to one `reddit thread` call, before you read any of them.** One
request brings back every thread; the script writes one file per thread, and the reading loop that
follows works from those files without touching the network again.

This is the only place Reddit departs from the one-document-at-a-time rule in `index.md`, and it
departs from it for the fetch alone. **The reading is unchanged**: still one document at a time,
still one receipt per URL, still nothing from one document carried into the next.

Log a line before the call and a line after it:

```
fetching <n> threads in one call
fetched <n> threads: <n> ok, <n> failed
```

Without them the batch is silent for as long as the whole fetch takes, and a silent agent is what
the stuck-agent check in `../../phases/index.md` kills.

## What comes back

The response is **keyed by the thread id you sent**:

```json
{"threads": {"1a2b3c": { … }, "1d4e5f": {"fetchFailed": "not found", "failedAt": "…"}}}
```

Each value is either the thread or a record of why that one could not be fetched. **One bad id never
costs the rest of the batch.**

- **`Post`** — id, title, url, selftext, author, subreddit, score, num_comments, created_utc,
  permalink, and **`comments`**.
- **`Comment`** — id, author, body, score, created_utc, permalink, parent_id.

**Comments arrive flat; `parent_id` is the tree.** `t3_<id>` means top level, `t1_<id>` means a
reply to that comment. Rebuild the nesting from it — who replied to whom is evidence, and a thread
read as one flat run of comments loses the argument inside it.

The array is `comments`, not `top_comments`: what it holds is decided by `--limit`, which is not a
property of the field. Highest-scoring first.

## A thread that could not be fetched

A value carrying `fetchFailed` is a blocked page, and gets a blocked page's treatment: **`outcome:
blocked` on that URL's receipt, `fetchFailed`'s text as the reason, and no claims file.** Then move
on to the next URL.

Two things not to do with it:

- **Do not call the script again for it.** The failure is already stored, so a second call returns
  the same record without a request. `not found` means the thread is gone and will never come back;
  `unavailable` is not retried either.
- **Do not count it against the branch's fetch budget.** `pagesRead` is `0` for a page that could
  not be read at all, and `fetchedWith` is `none`.

## What lands on disk

Two files per thread in `digmore/<slug>/cache/reddit/`:

| File | Written by |
|---|---|
| `reddit-thread-<id>.json` | the script — the full Post, comments and all |
| `reddit-thread-<id>-claims.json` | you |

A thread the script already has is returned without a re-fetch, and is not included in the request
it sends — so re-running a batch after a resume costs only the threads that are actually missing.
A thread that failed leaves the same filename holding its `fetchFailed` record, which is what stops
anything asking for it twice.

## Page quality

`forum`, almost always — this is community discussion. The exception is a subreddit's own pinned
moderator post stating a policy, which is `primary-self` for that subreddit. Definitions in
`../../vetting.md`.

## Known gaps

- **Comment trees truncate at `--limit`** (default 500) per thread. "Load more comments" anchors are
  not followed.
- **`[deleted]` / `[removed]`** — the body is gone and the attribution with it. Not quotable.
