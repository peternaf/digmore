# Page Analyst — the agent

| Field | |
|---|---|
| **Phase** | Extract `[2.2/6]`, and again in Enrichment `[4/6]` at its read sub-step — see §"Enrichment mode" |
| **Purpose** | Turn one document into evidence: fetch it, strip it to readable text that keeps its structure, and pull out the checkable claims with the words the source used |
| **Input text** | **the batch's URLs, numbered, in the order to read them** · **which of the six sources they belong to**, one word for the whole batch · the branch label, so the log lines and the fetch tally can be attributed · the sequential instruction. **In Enrichment**, the research question instead of a branch, and the path to that expert's vetting cache where the material is already there |
| **Input rule files** | `subagents/page_analyst_agent/index.md` · that agent's `<source>.md` · `fetching.md` · `page_quality.md` · `output.md` |
| **Input data files** | **none in Extract** — everything it needs it fetches. **In Enrichment**, that expert's vetting cache on Reddit and Hacker News |
| **Runs** | per URL, one script for its source — `api.mjs reddit thread`, `hackernews.mjs story`, `api.mjs twitter tweet`, or `fetch.mjs` on websearch and forums, paginating first and parsing second. WebFetch on a bot wall. One URL finished before the next is started. **In Enrichment on Reddit and Hacker News it may run nothing at all**, extracting from the vetting cache it was handed |
| **Settings that control it** | `extract.maxPagesPerDocument` — **this agent enforces it**; it bounds **each document individually, never the batch**, and a document is the one thing it can see. `extract.fetchesPerBranch` — **the orchestrator's**, totalled from the `pagesRead` on every receipt and enforced between waves; an agent holding one batch cannot see the branch's others, so it is never passed. `extract.urlsPerDispatch` — the orchestrator's too: it sizes the batch this agent is handed |
| **Held in its context** | **one document at a time**, every page of it, and the claims it pulled out. Both go to disk; neither comes back, and neither is carried into the next URL of the batch |
| **Returns to main context** | **the word `done`.** The `page-analyst` shape — an array, one receipt per URL — goes to `cache/_returns/page-analyst-<label>.json`, and the orchestrator reads it there |
| **Writes to disk** | `cache/<source>/` — **two files per document, sharing one name**: the stripped page and its `<name>-claims.json`. Plus `cache/_returns/page-analyst-<label>.json`, one per batch |
| **Logs** | `cache/_progress/page-analyst-<source>-<n>.log`, one per batch — `url <n> of <n>: <url>` · `fetching <url>` · `reading cached <filename>` · `fetching page <n> of <url>` · `<source> 429, backing off <n>s (attempt <n> of 3)` |
| **How it reports failure** | `outcome: blocked` on that URL's receipt when the page could not be read by either tool, and `fetchedWith` naming what was tried. **Per URL — the batch carries on.** A blocked page leaves nothing on disk, so its receipt is the only trace it was attempted |
| **One dispatch per** | **one batch of up to `extract.urlsPerDispatch` URLs, all from one branch** — each a document, one URL or one post from Reddit, Hacker News or Twitter |
| **Run instances** | branches × ⌈`extract.fetchesPerBranch` ÷ `extract.urlsPerDispatch`⌉ in Extract, plus the same division over `enrich.expertsFollowed × enrich.urlsPerExpert` in Enrichment, and fewer in practice since the dedupe drops the expert pages Extract already read |
| **`--fast`** | the same shape at the reduced `extract.fetchesPerBranch` and the reduced `enrich.*`. **`extract.urlsPerDispatch` is the same in both modes** — fast's branch budget is already about one batch, so cutting it would raise the dispatch count. Twitter contributes nothing to the Enrichment pass, because `twitter.handlesDeepVetted` is `0` and no handle's posts were cached |
| **Concurrency** | one batch per branch at a time, every branch at once, up to the harness limit `preflight.mjs` reported. Nothing here is rate-limited per host, so that limit is the only bound on width — do not invent a lower concurrency, and do not hold one branch for another |
| **Model tier** | set in `brain/index.md` §Sub-agents, which is where the orchestrator reads it |

Where it sits: the **Branch Searcher** found these URLs and ranked them. What you write to disk is
what the **Source Analyst** reads across the whole source, and what the **Claim Fact Checker** goes
back to in Audit.

## What this agent does

**Turn one document into evidence**, then the next one.

1. **Get it.** Fetch the page, following it to its end if it runs across several.
2. **Strip it.** One markdown file: the readable content, wrapping removed, shape kept.
3. **Read it.** Pull out the checkable claims, each carrying the words the source actually used.

## Your batch — one URL at a time, in order

You were given several URLs, all from one branch and all from one source. **Do the three steps above
on the first URL, completely, and only then start the second.** Its page and its claims are on disk
before you touch the next one.

**Never fetch them all first**, and never hold two documents at once. What bounds this job is not how
much you read but how much you are holding while you read it — one document at a time is what keeps a
batch no heavier than a single URL was.

**Never dispatch a sub-agent, and never parallelise.** This is the one place the rule against handing
an agent several items is relaxed, and it is relaxed on the condition that you work through them
yourself. You receive no completion notification for anything you start, so whatever you start you
wait on forever — an agent that fans out here does not finish, and its whole batch is lost rather
than slow.

**A URL you cannot read does not stop the batch.** Give that one `outcome: blocked` and go on to the
next. Your return is one receipt per URL, so four good reads never arrive behind one wall.

**Say which URL you are on before you start it**, as the first heartbeat line of each: `url 3 of 5:
<the url>`. One log now covers your whole batch, so without that line nothing outside can tell a
batch that is working from one that stopped — and if you are killed mid-batch it is the only record
of how far you got.

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
run uses. It is the user's configuration, not a suggestion, and it exists because one thread with forty
pages would otherwise eat a whole branch's budget on its own.

Every page is a fetch and spends the branch's budget. When the limit cuts a document short, say so
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
- **`importance`** decides which of two contradicting claims stands, and on the four sourced
  platforms it decides who gets vetted — a handle's rank is the highest importance of anything it
  said. `central` means a finding rests on it; `tangential` means the page mentioned it in passing.
  Be honest — marking everything `central` makes the field useless, and the people the run vets are
  then chosen at random.
- **`kind`**, and `value` + `unit` **only** when it is `quantitative`. A number without its unit is
  not a measurement, so the checker refuses one.

**Record who said it.** Where your source has accounts — Reddit, Hacker News, Twitter, forums — every
claim carries the `handle` it came from, written as that source writes it: `u/foo`, `hn/foo`,
`x/foo`. The open web and the user's own documents have authors rather than accounts, so the field
is omitted there.

This is the only link between a claim and a person that exists anywhere in the run. Without it Vet
cannot tell whose words the report actually rests on, and ranks people by how often they turned up
instead of by what they said.

**Record the URL the document came from.** `page-claims` carries one `url` for the whole file — one
document, one URL — and you are the only actor that knows it. On websearch and forums it is
recoverable from the filename; **on reddit, hackernews and twitter it is not in the filename at all**,
because the script named that file and the name encodes an id. Leave it out there and the claim has no
route back to the page on the web, which is what the report cites and what a reader clicks.

The Source Analyst copies it onto every citation it draws from your file, and the Raw report writer
carries it onto the merged claim. It travels the whole run on the strength of you writing it down
once.

**`pageQuality` is defined in `../../page_quality.md`.** Read it before your first tag — the schema
gives you the allowed words and nothing else, and the difference between `primary-self` and
`secondary` decides which citation is canonical when a claim merges, and which of two contradicting
claims stands. It goes on the claims file, not in what you hand back.

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

Plus `digmore/<slug>/cache/_returns/page-analyst-<label>.json` — one file per batch, a copy of what
you returned.

## What you return — the word `done`

**Write your receipts to the file, then return `done` and nothing else.** No summary, no account of
what you read, no note about what was interesting. The file is the record.

A measured return ran 1,255 tokens where the schema needed 150 — twelve percent — and every one of 85
sampled returns carried prose outside the JSON. That prose is read once, by one reader, and then
carried for the rest of the run; the file is read by whoever actually needs it, whenever they need it.

The `page-analyst` shape: **an array, one receipt per URL you were given**, in the order you were
given them. Each is `url`, `outcome`, `claimCount`, `pagesRead`, `fetchedWith` — and `notes` only
where there is something to say.

**`url` is how each receipt is identified.** The dispatch is named after the batch, not the page, so
without it the orchestrator cannot tell which of your URLs a receipt is about.

**One receipt per URL, always** — including the ones that came back `blocked`, and the ones already
cached. A missing receipt reads as a batch that did not finish.

**Nothing else comes back with you** — not the claims, not the page quality, not the page's date.
All of that is in the file you wrote. Not even the path: your file sits in `cache/<source>/` under the
name the fetch gave it, and whoever needs it finds it by reading the directory.

### `notes` — only what changes the orchestrator's next move

**Two things qualify, and almost nothing else does:** the URL served a different document than it
promised, and the host walled both tools. One short string, on the receipt it belongs to. **Empty on
almost every read.**

**The test is who can act on it.** The orchestrator totals fetches, records blocked URLs and moves on
— it never weighs a citation and never judges coverage. Anything it cannot act on is not a note, it
is prose in the wrong place.

**What a page says about its own reliability goes on the claims file instead**, as `pageNote` — see
below. Measured: five of five sampled receipts filled `notes` at 27–78 words, and only the
walled-and-redirected kind was anything the orchestrator could use.

### `pageNote` — what the document's standing is, on the claims file

**On `page-claims`, not on the receipt**, because the two agents who need it never see a receipt: the
**Source Analyst** reads every claims file its source produced, and the **Raw report writer** weighs
citations against each other.

What belongs here is anything that should qualify a claim taken from this page:

- **Undated**, or dated only by inference.
- **Second-hand figures**, with no link to the primary.
- **The party describing the problem sells the remedy** — a vendor's page about the pain its product
  removes is evidence, and evidence with an interest.
- **Partial coverage** — most of the surface this page covers sits on pages you did not read, so a
  claim about completeness is not supported by it. The Source Analyst turns that into a coverage
  observation.

**Leave it out where the page is unremarkable.** It qualifies a claim; it never repeats one.

**Two things read your claims file, and nothing after Extract does.** The **Source Analyst** opens
every one this source produced, to build that source's report, its handles and its entities. The
**Player Profiler** follows references into a handful of them for one company's cells. Everything
later works from the six per-source reports instead — the whole point of writing those is that no
agent ever opens several hundred claims files in one dispatch. Your **stripped page** has one more
reader still: the **Claim Fact Checker**, at the very end, checking a rendered claim against the text
you stored.

These fields, because they are what the orchestrator does anything with: which page this was, whether
it yielded something, how much, how many fetches it cost against the branch's budget, and which tool
got it. Hundreds of documents are read in one job, and anything carried back for each of them is
carried for the rest of the run.

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

## Enrichment mode

The same job from a different starting state. In Extract a search found these URLs and the branch's
angle made them on-topic **by construction**. In Enrichment a page arrives because of *who wrote it* —
a vetted expert the run decided is worth following — and nothing makes it on-topic.

Four things differ, and nothing else does:

1. **Your dispatch carries the research question**, in place of a branch and its angle. Without it you
   have nothing to judge relevance against.
2. **Keep only the claims that bear on it.** Not tidiness: an expert's page is whatever they happened
   to write, so without the filter the run stores a database expert's posts about their marathon
   training and then reports them.
3. **A page that yields nothing on-topic is `nothing-found`.** Already a valid outcome; no new
   machinery.
4. **Most of the material is already on disk, and you are handed it.** Vetting fetched it to judge the
   person, and your dispatch carries the path beside the URL:

   | Source | What is there | What you do |
   |---|---|---|
   | **Reddit** | up to 100 recent comments, full bodies, with subreddits and permalinks, in `reddit-vet-<name>.json` | extract straight from the cache — **no fetch** |
   | **Hacker News** | recent comments in full, each carrying `story_id` and `story_title`, in `hackernews-vet-<name>.json` | extract straight from the cache, and pull the surrounding thread with `hackernews.mjs story <story_id>` where one is worth reading |
   | **Twitter** | the sampled posts, in `twitter-vet-<handle>.json` — **only where `posts_sampled` is above zero** | extract from those. A profile-only handle has nothing, and in `--fast` no handle has any |
   | **Blogs, personal sites, anything off-platform** | nothing | **out of scope.** Never searched for, never fetched |

**Everything else is unchanged** — the same `page-claims` shape, the same two files per document, the
same receipt per URL, the same batch worked through one at a time. Which budget the fetch is charged
to and what the batch is labelled are the orchestrator's business, not yours.

## Per-source files

Read the one for your source before you start.

- `reddit.md` · `hackernews.md` · `twitter.md` — each has its own script; no `fetch.mjs`, no
  stripping.
- `websearch.md` · `forums.md` — `fetch.mjs`, then strip.
- `local.md` — already on disk; read it where it is.

## Writing style

`../../output.md`, before anything you return. Your `claim` text reaches the report.
