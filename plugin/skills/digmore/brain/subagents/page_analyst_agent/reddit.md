# Page Analyst — Reddit

Reddit comes back as structured JSON from digmore's API. **No `fetch.mjs`, no stripping** — the
script has already done the equivalent, and what it writes is the stored page.

## The command

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" reddit thread <id-or-permalink> \
  --topic <slug> [--limit 500]
```

`--topic <slug>` is mandatory. Accepts a bare post id, a `/comments/<id>/…` path, or the full URL.

Exit codes: `0` success · `3` source temporarily unavailable · `4` no API key · `5` key rejected ·
`1` anything else.

## What comes back

- **`Post`** — id, title, url, selftext, author, subreddit, score, num_comments, created_utc,
  permalink, and **`comments`**.
- **`Comment`** — id, author, body, score, created_utc, permalink, parent_id.

**Comments arrive flat; `parent_id` is the tree.** `t3_<id>` means top level, `t1_<id>` means a
reply to that comment. Rebuild the nesting from it — who replied to whom is evidence, and a thread
read as one flat run of comments loses the argument inside it.

The array is `comments`, not `top_comments`: what it holds is decided by `--limit` and the sort,
neither of which is a property of the field. Highest-scoring first.

## Check whether you read the whole thread

**`num_comments` is the thread's real size.** If `num_comments > comments.length`, the rest were not
returned and you are reading part of a thread.

Say so, with both numbers. A partial thread quoted as if it were the whole one is how a minority
view becomes the consensus.

## What lands on disk

Two files in `digmore/<slug>/cache/reddit/`:

| File | Written by |
|---|---|
| `reddit-thread-<id>.json` | the script — the full Post, comments and all |
| `reddit-thread-<id>-claims.json` | you |

If the thread file already exists the script returns it without a re-fetch.

## Source quality

`forum`, almost always — this is community discussion. The exception is a subreddit's own pinned
moderator post stating a policy, which is `primary-self` for that subreddit. Definitions in
`../../vetting.md`.

## Known gaps

- **Comment trees truncate at `--limit`** (default 500) per page. "Load more comments" anchors are
  not followed. The `num_comments` check above is how you know it happened.
- **`[deleted]` / `[removed]`** — the body is gone and the attribution with it. Not quotable.
