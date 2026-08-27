# Source Analyst — Reddit

## What is on disk

`digmore/<slug>/cache/reddit/`:

| File | What it is |
|---|---|
| `reddit-search-<scope>-<query-in-4-words>.json` | one per search — the URLs it found, and the ones the run ranked below the cut. `_request` inside says exactly what was asked for |
| `reddit-thread-<id>.json` | one per thread the run read: the full `Post`, with `comments` |
| `reddit-thread-<id>-claims.json` | the Page Analyst's extraction from that thread |
| `reddit-vet-<name>.json` | one per vetted handle, if Vet has already run: the profile, up to 100 recent comments in full, and the verdict together |
| `handles/` | **not yours, and not material.** Vet's own verdict on each handle, one file each. Skip the directory: a vetting record read as a document puts a judgement about a person into the report as though somebody had said it |

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

## Coverage, in numbers — for `observations`

Every thread file carries `num_comments`. Compare it to the length of `comments`:

- Equal → the thread was read whole.
- `num_comments` larger → the rest were not returned, and you are looking at part of it.

Record the shortfall per thread, both numbers. A thread read at 500 of 3,000 comments does not
support a claim about what "the thread concluded".

## The handles — `full_source_analysis/reddit-handles.json`

Reddit gives you the richest handle list of any source, because every comment names both its author and
its subreddit.

- **The handle form is `u/<name>`**, as Reddit writes it.
- **`signals` worth carrying:** the subreddits they posted in, whether they authored the thread or
  only commented, and their best comment score. Subreddit spread is the one Reddit gives cheaply that
  the Handle Vetter would otherwise have to infer — and it is what tells a genuine specialist apart
  from the fanboy the script's 80%-in-one-sub rule fires on.
- **`[deleted]` and `[removed]` are not handles.** Skip them; there is nobody to vet.

## The players — `full_source_analysis/reddit-players.json`

Reddit names products constantly and links them rarely. Expect bare names, misspellings and
shorthand — `elevenlabs`, `11labs`, `EL` in the same thread — so `aliases` earns its place here more
than on any other source.

- **The subreddit is part of the relevance.** "Praised in r/selfhosted, called overpriced in
  r/startups" is a better line than either half alone, and it is visible only to you.
- **A recommendation thread is not five mentions.** One document naming eight tools counts once for
  each of them. Do not inflate a comparison thread into evidence of eight popular products.
- **`[deleted]` comments still name products.** The claim has no handle, so it will be judged on page
  quality rather than dropped — record the entity.

## Known gaps — they go in `observations`

- **Comment trees truncate at the `--limit` on the fetch**, default 500. "Load more comments" is not
  followed.
- **`[deleted]` / `[removed]`** — the body is gone and the attribution with it. Where a removed
  comment is clearly the pivot of a thread, that absence is itself worth reporting.
