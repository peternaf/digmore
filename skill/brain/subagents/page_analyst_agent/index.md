# Page Analyst — the agent

**Phase: Extract, sub-step `[2.2/5]` Extract · Read.** Dispatched by `../../phases/extract_phase_b.md`.

One dispatch per document: one URL, or one post from Reddit, Hacker News or Twitter. A single piece
of online material, got and analysed.

Where it sits: the **Branch Searcher** found this URL and ranked it. What you write to disk is what
the **Source Analyst** reads across the whole source, and what the **Claim Fact Checker** goes back
to in Audit. What you return is what the report is built from.

## What this agent does

**Turn one document into evidence.**

1. **Get it.** Fetch the page, following it to its end if it runs across several.
2. **Strip it.** One markdown file: the readable content, wrapping removed, shape kept.
3. **Read it.** Pull out the checkable claims, each carrying the words the source actually used.

## Get it — the fetch

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/fetch.mjs" <url> \
  --output-dir digmore/<slug>/cache/<source>
```

**The script names the file.** You pass the directory; it derives the filename from the URL and
returns the path it wrote. One URL always produces one file, which is what lets a later run skip
work it has already done.

Three things it does for you:

- **Already on disk → it comes back without a request**, answering `cached: true`. No existence
  check of your own.
- **Content type decides the extension.** Read the written name off the returned `path`.
- **A failure carries the filename with it.** See the wall rule below.

Reddit, Hacker News and Twitter do not go through `fetch.mjs` — each has its own script, in its own
file in this directory.

## Get it — when the page is walled

`fetch.mjs` gets the whole page but is blocked by bot walls. WebFetch gets through walls but
**silently shortens long pages and never says where it cut**. So:

1. **`fetch.mjs` first, always.**
2. **On a wall, use WebFetch** — and save what it returns under the `filename_only` the failed call
   put in its error payload, so the file lands where the rest of the run will look for it.
3. **Say which tool got it.** A page taken by WebFetch may be missing a tail nobody can see, and a
   claim drawn from it carries that risk.

What is not a fallback: `curl`, third-party proxies, reader services, archive mirrors. Two tools,
in that order.

## Get it — follow the document to its end

A long thread or article is often split across pages, and the first page is the least interesting
one — the resolution, the correction and the "this worked" reply are at the end.

Paginate **first**, all the way, before parsing anything. Then merge every page into one document
and strip that.

What counts as a next-page link, in the order worth trying: a `rel="next"` link, a numbered pager
where the current page is not the last, or a "Next" / "Older" / "»" control. Query-string
(`?page=2`) and path-segment (`/page/2/`) forms are both common. A page with none of these is the
last page, and that is the normal way to stop.

**Stop when the link stops moving.** A pager that returns the same URL, or a page whose content
repeats the one before it, is the end of the document dressed up as another page. Two identical
pages in a row means stop.

Every page is a fetch and spends the branch's budget.

## Strip it — one markdown file per document

Not the raw HTML, and not whatever the fetcher happened to store. Nobody downstream reads markup.

**Keep the content, drop the wrapping.** Out go navigation, ads, cookie banners, share widgets,
related-links rails, scripts and markup.

**Keep the shape, because the shape is evidence.** Heading levels, lists, tables, code blocks — and
above all **who is replying to whom**. A comment on a comment stays visibly nested, with its author
and its depth. A thread flattened into one run of paragraphs loses the argument: you can no longer
tell a top-level claim from the reply that corrected it, or see that six people piled onto one
comment while the rest of the thread ignored it. On Reddit and Hacker News that shape is most of the
evidence there is.

Markdown is the target, because it carries heading level and nested quoting. Plain text does not.

The page title becomes the file's first heading, so the cache folder reads without opening anything.

The raw pages `fetch.mjs` wrote are deleted once the merged file exists.

## Read it — the claims

Every claim carries a verbatim quote. A claim you cannot quote is one you drop.

Each claim needs four fields, and two more when it is quantitative — the shape is in
`../../../scripts/subagent_returns.json` under `page-claims`, and the file for your source says
what that source's material looks like.

**Record who said it.** Where your source has accounts — Reddit, Hacker News, Twitter, forums — every
claim carries the `handle` it came from, written as that source writes it: `u/foo`, `hn/foo`,
`x/foo`. The open web and the user's own documents have authors rather than accounts, so the field
is omitted there.

This is the only link between a claim and a person that exists anywhere in the run. Without it Vet
cannot tell whose words the report actually rests on, and ranks people by how often they turned up
instead of by what they said.

**`sourceQuality` is one of seven words, and `../../vetting.md` says what each one means.** It goes on
the claims file, not in what you hand back. The schema gives you the list; read the definitions before
choosing, and read your source's file — a forum post and a vendor pricing page are not judged the same
way.

## What you write to disk

**Two files per document, sharing one name**, in `digmore/<slug>/cache/<source>/`:

| File | What is in it |
|---|---|
| `<name>.md` — or the script's own file, on the three scripted sources | the whole document: stripped markdown, all pages merged |
| `<name>-claims.json` | what you pulled out of it, each claim with its quote and its handle — the `page-claims` shape |

`<name>` is what `fetch.mjs` derived from the URL, or what the source's own script called its file.
Your source's file gives the exact pair.

Per **document**, not per page: eight pages make one pair, not eight.

Plus `digmore/<slug>/cache/_returns/page-analyst-<filename>.json` — a copy of what you returned.

## What you return — a receipt, not the claims

The `page-analyst` shape, and it is four fields: `outcome`, `claimCount`, `pagesRead`,
`fetchedWith`.

**Nothing else comes back with you** — not the claims, not the source quality, not the page's date.
All of that is in the file you wrote, and the Source Analyst, the Report Writer and the fact checker
open it there. Not even the path: your file sits in `cache/<source>/` under the name the fetch gave
it, and they find it by reading the directory.

Four, because four is what the orchestrator does anything with: whether the page yielded something,
how much, how many fetches it cost against the branch's budget, and which tool got it. Several
hundred of these dispatches run in one job, and anything carried back in each of them is carried for
the rest of the run.

**`fetchedWith` is the one that outlives the run.** Say `WebFetch` when the wall forced you onto it,
and the orchestrator lists that URL in `audit.md` — WebFetch shortens long pages without saying
where, so every claim you took from that page may be missing a tail nobody can see. Recorded, that is
a known limit; unrecorded, it is a silent one.

## Say which of these happened

| `outcome` | What it means |
|---|---|
| `ok` | claims were found |
| `blocked` | **you could not read the page** — walled, paywalled, refused after both tools |
| `nothing-found` | **you read it and it yielded nothing** — off the angle, or nothing in it that could be tied to a quote |

**The two failures are not the same finding, and only you can tell them apart.** A blocked page is a
gap in what the run could reach; an empty one is a fact about the topic. Reported as one, a walled
subject and a genuinely undiscussed one become indistinguishable, and the report says "little was
written about this" when the truth is "we could not get in".

A blocked page also leaves nothing on disk, so this receipt is the only trace in the whole run that
the URL was ever tried.

## Per-source files

Read the one for your source before you start.

- `reddit.md` · `hackernews.md` · `twitter.md` — each has its own script; no `fetch.mjs`, no
  stripping.
- `websearch.md` · `forums.md` — `fetch.mjs`, then strip.
- `local.md` — already on disk; read it where it is.

## Writing style

`../../output.md`, before anything you return. Your `claim` text reaches the report.
