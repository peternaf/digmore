# Source Analyst — Hacker News

## What is on disk

`digmore/<slug>/cache/hackernews/`:

| File | What it is |
|---|---|
| `hackernews-item-<N>.json` | one per story the run read: the story, and its comment tree |
| `hackernews-item-<N>-claims.json` | the Page Analyst's extraction from that story |

Vetting files — `hackernews-user-*`, `hackernews-vet-*` — appear here too if Vet ran before you did.
They are the Handle Vetter's, and they tell you who was judged credible, which is useful context for
weighing a pattern.

## What Hacker News gives you that a single story cannot

- **The same story submitted more than once.** A link that was posted three times and only caught
  fire on the third is a finding about timing, not about the link.
- **Points against argument.** A story with high points and a hostile comment section is a different
  signal from one with both high. HN's front page rewards the headline; the comments are where the
  audience actually lands.
- **Recurring commenters.** A handful of accounts carry most of the expertise in any niche on HN. One
  answering across four of your stories is the strongest single lead the source produces — flag them
  by name.
- **Employees answering in the thread.** Common on HN and usually disclosed. Where a vendor's own
  people show up to defend a product, note both the disclosure and how the thread received it.
- **Time.** Stories carry `created_utc`. The arc across two years — enthusiasm, then complaints, then
  silence — is the sort of thing only a whole-source read can see.

## Coverage, in numbers

**The comment tree is flattened at depth 3, and everything deeper is dropped by the script.** That is
not a truncation you can measure from the file — the deeper replies are simply absent.

What you can do is say where it mattered: a story whose visible discussion is clearly mid-argument at
depth 3 was read partially, and any claim about how that argument resolved is unsupported.

Where `num_comments` on the story greatly exceeds what is in the tree, record both numbers.

## The roster — `full_source_analysis/hackernews-handles.json`

- **The handle form is `hn/<name>`.**
- **`signals` worth carrying:** whether they submitted the story or only commented, their depth in
  the tree, and whether they disclosed working for something being discussed — employees answering in
  the thread are common on HN and usually say so.
- **Depth 3 hides handles.** The script flattens the tree and drops everything below, so a person who
  only ever replied deep in a chain is absent from the material and cannot appear in the roster at
  all. That is a coverage gap, not an empty roster — say so in the notes.

## Known gaps to record in `full_source_analysis/hackernews.md`

- **Depth-3 flattening**, per above — the single biggest limit on this source.
- **Dead and flagged comments** do not come back. A thread that reads oddly one-sided may have been
  moderated, and the absence is invisible in the file.
