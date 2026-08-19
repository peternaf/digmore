# Source Analyst — Reddit

## What is on disk

`digmore/<slug>/cache/reddit/`:

| File | What it is |
|---|---|
| `reddit-search-<subs>-<sort>-<window>-<qhash>.json` | one per branch query — the URLs that branch found, and the ones it ranked below the cut |
| `reddit-thread-<id>.json` | one per thread the run read: the full `Post`, with `comments` |
| `reddit-thread-<id>-claims.json` | the Page Analyst's extraction from that thread |

Comments inside a thread arrive flat, with `parent_id` giving the tree — `t3_<id>` is top level,
`t1_<id>` is a reply.

## What Reddit gives you that a single thread cannot

- **Subreddit as a variable.** The same question asked in two subs often gets two different answers,
  and the difference is the finding. Say which sub each pattern came from; a complaint that only
  exists in one community is not the same as one that spans four.
- **Score against agreement.** A heavily-upvoted comment is popular, not correct. Where the top
  comment and the replies disagree, that split is worth more than either side alone.
- **The same account across threads.** One person answering the same question three times, or
  contradicting themselves between subs, is visible only from here.
- **Sequence.** Threads carry `created_utc`. A complaint that stops appearing after a date usually
  means something shipped; one that starts appearing means something broke.
- **The search files show what was passed over.** Each holds more URLs than the run read. A recurring
  title among the ones nobody opened is a gap worth naming.

## Coverage, in numbers — also for `full_source_analysis/reddit.md`

Every thread file carries `num_comments`. Compare it to the length of `comments`:

- Equal → the thread was read whole.
- `num_comments` larger → the rest were not returned, and you are looking at part of it.

Record the shortfall per thread, both numbers. A thread read at 500 of 3,000 comments does not
support a claim about what "the thread concluded".

## Known gaps to record in `full_source_analysis/reddit.md`

- **Comment trees truncate at the `--limit` on the fetch**, default 500. "Load more comments" is not
  followed.
- **`[deleted]` / `[removed]`** — the body is gone and the attribution with it. Where a removed
  comment is clearly the pivot of a thread, that absence is itself worth reporting.
