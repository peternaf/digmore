# Branch Searcher — Reddit

Reddit is reached through digmore's API, never from this machine. You send a query and a topic slug
and get structured results back. No account, no OAuth.

**Needs an API key.** Without one `api.mjs` exits 4 and Reddit is unavailable — not a failure. Plan
builds no Reddit branches when there is no key, so if you were dispatched, there is one.

## The command

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" reddit search <query> --topic <slug> \
  [--time-window {hour|day|week|month|year|all}] [--limit 20] [--after-date YYYY-MM-DD]
```

`--topic <slug>` is mandatory; the script refuses to run without it. JSON on stdout, errors on
stderr.

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

## One search, site-wide

**One query, the whole site, once.** There is no subreddit restriction and no second pass. Every
result is a thread about your angle, ranked across the whole of Reddit, and every one of them is a
candidate you keep.

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

**One file per branch**, because there is one search.

`digmore/<slug>/cache/reddit/reddit-search-<query-in-4-words>.json` — written by the script, named so
the directory reads without opening anything. The four words are the query with its stopwords and
punctuation removed.

```
query "what are the vram requirements for local llm"
  → reddit-search-vram-requirements-local-llm.json
```

**The name is readable, so it is not unique.** Four words cannot carry the window, the limit or the
rest of the query, so two different searches can land on one name. The script handles it: the whole
request is stored inside the file and compared on read — same request is a hit, a different one
probes `-2`, `-3` and so on until it finds its own file or a free slot. The match is on the stored
request and never on the number, so a repeated search finds its own file whichever number it landed
on first.

None of that is yours to manage. Run the command; the script decides where the answer goes and hands
you back what it fetched or what it already had.

That file is what this dispatch leaves behind. The threads behind the URLs belong to the Page
Analyst.
