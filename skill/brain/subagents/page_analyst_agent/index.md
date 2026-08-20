# Page Analyst — the agent

**Phase: Extract, sub-step `[2.2/6]` Extract · Read.** Dispatched by `../../phases/extract_phase_b.md`.

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

**`../../fetching.md`, which you are sent with this file.** It is the whole of how a page is got:
the `fetch.mjs` command, that the script names the file and hands back a cached one without a
request, and what to do when a site blocks you — `fetch.mjs` first, WebFetch on a wall, saved under
the name the failed call handed back, and say which tool got it.

Your `--output-dir` is `digmore/<slug>/cache/<source>`, for the source you were given.

Reddit, Hacker News and Twitter do not go through `fetch.mjs` — each has its own script, in its own
file in this directory.

Two things follow from the wall rule and are yours rather than that file's: `fetchedWith` on your
receipt is where you say which tool got the page, and a page you could not read either way is
`outcome: blocked`.

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

**And stop at `extract.maxPagesPerDocument`**, 5 by default — `preflight.mjs` prints the number this
run uses. It is the user's ceiling, not a suggestion, and it exists because one thread with forty
pages would otherwise eat a whole branch's budget on its own.

Every page is a fetch and spends the branch's budget. When the ceiling cuts a document short, say so
in `pagesRead` and note that more existed: a thread read to page 5 of 12 is a partial read, and a
claim about how the argument ended is not supported by it.

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

A claim is this shape — `page-claims` in `../../../scripts/subagent_returns.json`, and your source's
file says what that source's material looks like:

```json
{
  "claim":      "one checkable statement, one line",
  "quote":      "the words the source used, verbatim",
  "handle":     "u/foo — who said it, where the source has accounts",
  "importance": "central | supporting | tangential",
  "kind":       "quantitative | qualitative",
  "value":      105,
  "unit":       "M USD raised"
}
```

- **`claim`** is a statement someone could go and check. "Pricing is confusing" is not one; "Mux
  charges $0.005 per minute of encoding" is.
- **`quote`** is verbatim and never yours. A claim you cannot quote is one you drop.
- **`handle`** — see below. Omitted on the open web and on the user's own documents.
- **`importance`** decides what the run spends its verification budget on, and on the four sourced
  platforms it also decides who gets vetted. `central` means a finding rests on it; `tangential`
  means the page mentioned it in passing. Be honest — marking everything `central` makes the field
  useless and the ranking random.
- **`kind`**, and `value` + `unit` **only** when it is `quantitative`. A number without its unit is
  not a measurement, so the checker refuses one.

**Record who said it.** Where your source has accounts — Reddit, Hacker News, Twitter, forums — every
claim carries the `handle` it came from, written as that source writes it: `u/foo`, `hn/foo`,
`x/foo`. The open web and the user's own documents have authors rather than accounts, so the field
is omitted there.

This is the only link between a claim and a person that exists anywhere in the run. Without it Vet
cannot tell whose words the report actually rests on, and ranks people by how often they turned up
instead of by what they said.

**`pageQuality` is defined in `../../page_quality.md`.** Read it before your first tag — the schema
gives you the allowed words and nothing else, and the difference between `primary-self` and
`secondary` decides how far up the verification ranking every claim on this page sits. It goes on the
claims file, not in what you hand back.

Your source's file in this directory says how its material maps onto those values — a forum post and a
vendor pricing page are not judged the same way.

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

**Nothing else comes back with you** — not the claims, not the page quality, not the page's date.
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
