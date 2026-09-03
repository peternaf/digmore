# Branch Searcher — Reddit

Reddit is reached through digmore's API, never from this machine. You send a query and a topic slug
and get structured results back. No account, no OAuth.

**Needs an API key.** Without one `api.mjs` exits 4 and Reddit is unavailable — not a failure. Plan
builds no Reddit branches when there is no key, so if you were dispatched, there is one.

## The command

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" reddit search \
  --branch <branch-label> --query "<query>" [--query "<query>" …] --topic <slug> \
  [--time-window {hour|day|week|month|year|all}] [--limit 20] [--after-date YYYY-MM-DD]
```

**One call, and every query you intend to run is in it.** `--branch` is the label you were
dispatched with — the same string your `_returns` and `_progress` files carry — and it is required.
So is at least one `--query`. There is no positional query.

`--topic <slug>` is mandatory; the script refuses to run without it. JSON on stdout, errors on
stderr. The result is keyed by query, plus `refused` — **anything listed there did not run.** Never
treat a refused query as a search that came back empty.

`--limit` is 1 to 20, and 20 is the default — one upstream call returns about that many. A larger
number is refused before the request, so asking for more is a failed command rather than a bigger
answer.

**There is no `--sort`.** The API accepts one for compatibility and ignores it; results always come
back ordered by descending relevance. Do not pass it.

On a failure the script says what happened on stderr — read that rather than decoding the exit code. Two change what you do: `4` means no API key, so this source is disabled rather than failed, and `3` means the source is temporarily unavailable. Anything else is a failure to report as one.

## NEVER use WebSearch for Reddit

**`WebSearch site:reddit.com …` is forbidden. `api.mjs reddit search` is the only way in.**

This has happened in real runs, which is why it is stated this hard. reddit.com blocks the harness's
WebSearch UA at robots.txt, so a `site:reddit.com` query returns zero or near-zero results whatever
the topic actually holds — **and it returns them without an error**. Nothing looks wrong. The run
then reports "Reddit is thin on this topic," which is not a finding, it is the search never having
happened.

If you catch yourself reaching for WebSearch here, the answer is the script above.

## Site-wide, and up to your budget

**The whole site, every time.** There is no subreddit restriction. Every result is a thread about
your angle, ranked across the whole of Reddit, and every one of them is a candidate you keep.

**How many queries you may run is `reddit.searchesPerBranch`**, which `preflight.mjs` printed for
this run. The script enforces it by counting the files your branch has already written, so it is not
a rule you can drift past — past the number, the surplus queries are refused and the ones that fit
still run.

**It is a ceiling, not a target, and not a quota to fill.** Spend it where the angle genuinely holds
several distinct questions, and leave it unspent where it does not. One good query is a finished
branch, not a branch that under-delivered.

**Every query has to be on this branch's own angle.** You are one angle paired with Reddit. A query
that would sit better under a different angle of the same topic belongs to that branch, not to you —
a run measured four LinkedIn queries on one angle, which was one question asked four ways.

**Rewordings are not distinct queries.** Reddit ranks site-wide on relevance, so a synonym pass
returns substantially the same threads for a second slot of the budget. Distinct means a different
question about the angle, never the same question in different words.

**Choose them all before the call.** One call is the whole allowance, so there is no second pass in
which to react to what came back. That has a cost, and it is the right one: a promising thread
cannot be chased with a narrower query, and following it is the Page Analyst's job when it reads the
thread — not another search.

**Before you search, look in `digmore/<slug>/cache/reddit/`.** A query already stored there has been
run, and asking for it again returns the stored answer rather than a new search. Cheap to check, and
the only way to avoid spending a slot on something the branch already has.

**If the script says the branch has already run its searches, read those files.** Do not search
again. That message means an earlier dispatch of this branch spent the budget and its results are
on disk waiting for you.

You may still find the subreddit useful for judging a result — it is the `r/<name>` segment of the
permalink, since a result carries `url`, `title` and `relevance` and no subreddit field:

```
https://www.reddit.com/r/LocalLLaMA/comments/1a2b3c/vram_for_70b/  →  LocalLLaMA
```

That is a reading aid for scoring relevance, not an instruction to search again. A sub that looks
right and did not surface is not a gap you can go and fill.

**What this costs, stated plainly:** a small specialist sub that site-wide ranking buries will not
appear, and nothing in this branch will find it. If the angle plainly lives in one community and the
results are all from elsewhere, say so in your log — that is a coverage note for the run, not a
second search to run.

## The date window

`--time-window` defaults to `year`. For the two-year window in `../../recency.md`, pass both:

```
--time-window all --after-date <the cutoff date in your dispatch>
```

**The date arrives in your task text — do not work it out.** `preflight.mjs` prints one cutoff at
the start of the run and the orchestrator passes it to every branch, so all of them filter on the
same day. Computed here it would be a different date in each of the Reddit branches, and the run
would have no single window at all.

**Both parameters are hints, not filters.** They are forwarded upstream and neither reliably
excludes older posts — a narrow window has been measured returning posts one and two years outside
it, and no publish date comes back per result to catch it. Pass them anyway, because they still skew
the results recent. Do not describe what comes back as recent on the strength of having asked.

## Empty means empty

The script tells you which of two things happened, and they get different sentences:

- **`{"results": []}` on exit 0** — the topic really is thin on Reddit, and you can say so. One
  search is the whole of what this branch does, so an empty result has nothing else to be.
- **Exit 3** — the source was walled. Report it as unavailable. **Do not call the script again.**
  It already made four attempts and waited 5s, 15s then 45s between them; exit 3 is what is left
  after all of that. A second run of the command buys another 65 seconds of the same answer, and
  it is the branch's whole time budget spent on a source that is down.

## What you write

The `branch-searcher` shape — `{"results":[{"url","title","relevance"}]}`, `relevance` rank-based.
The search's output already matches it: one search, one list, nothing to merge and nothing to
dedupe. Sort by your own `relevance` and cut to `extract.fetchesPerBranch` as `index.md` says.

## What lands on disk

**One file per query**, all of them under your branch's own prefix.

```
digmore/<slug>/cache/reddit/reddit-search-<branchhash5>-<queryhash5>.json
```

Two five-character hashes, written by the script — the branch, then the query. The name is not
readable, and that is the trade: it is exact instead. The branch half is what the cap counts, so
your files are the record of what you have spent; the query half means a repeat resolves to a file
that already exists, with no request made.

**`_request` inside each file says verbatim what was asked**, which is where the query text lives
now that the filename does not carry it.

None of that is yours to manage. Run the command; the script decides where each answer goes and
hands you back what it fetched, what it already had, and anything it refused.

That file is what this dispatch leaves behind. The threads behind the URLs belong to the Page
Analyst.
