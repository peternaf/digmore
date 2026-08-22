# Source Analyst — Hacker News

## What is on disk

`digmore/<slug>/cache/hackernews/`:

| File | What it is |
|---|---|
| `hackernews-item-<N>.json` | one per story the run read: the story, and its comment tree |
| `hackernews-item-<N>-claims.json` | the Page Analyst's extraction from that story |

`hackernews-vet-<name>.json` files appear here too if Vet ran before you did — one per handle,
carrying that person's profile, their recent comments in full and the verdict. They are the Handle
Vetter's, and they tell you who was judged credible, which is useful context for weighing a pattern.

**In Enrichment mode those files are also where the new material came from**: an expert's cached
comments are extracted straight out of them, with no fetch.

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

**The comment tree is flattened at `hackernews.commentDepth`, 5 by default, and everything deeper is
dropped by the script.** That is
not a truncation you can measure from the file — the deeper replies are simply absent.

What you can do is say where it mattered: a story whose visible discussion is clearly mid-argument at
the cut was read partially, and any claim about how that argument resolved is unsupported.

Where `num_comments` on the story greatly exceeds what is in the tree, record both numbers.

## The handles — `full_source_analysis/hackernews-handles.json`

- **The handle form is `hn/<name>`.**
- **`signals` worth carrying:** whether they submitted the story or only commented, their depth in
  the tree, and whether they disclosed working for something being discussed — employees answering in
  the thread are common on HN and usually say so.
- **The depth cut hides handles.** The script flattens the tree and drops everything below, so a person who
  only ever replied deep in a chain is absent from the material and cannot appear in this file at
  all. That is a coverage gap, not an empty source — say so in `observations`.

## The players — `full_source_analysis/hackernews-players.json`

Hacker News is the one source where a document often **is** a player: a Show HN or a launch thread is
a company introducing itself, and the story's own `url` is that company's site. Record it as an
alias — it is the most reliable identifier this source produces.

- **The submitter is frequently the founder**, disclosed or not. That makes the story's own claims
  the company's own words, and their handle will usually vet as `promoter`. Record the entity
  normally; whether those claims count is decided later, not by you.
- **Comparison comments name a dozen tools in a line.** One document, one count each.
- **The depth cut hides players too.** A tool only ever recommended deep in a reply chain is
  absent from the material entirely. Say so in the notes where you can see it happening.

## Known gaps — they go in `observations`

- **The `hackernews.commentDepth` cut**, per above — the single biggest limit on this source.
- **Dead and flagged comments** do not come back — Algolia 404s a dead item, so a moderated thread
  reads as an intact one that happens to be one-sided, and the absence is invisible in the file.
  Vet can see it for a handle it vets (`../handle_vetter_agent/hackernews.md` §"The shadowban
  check"), but nothing recovers it for a thread. Where a discussion reads as though a side is
  missing, say so.
