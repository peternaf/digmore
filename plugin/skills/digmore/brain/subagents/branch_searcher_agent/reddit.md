# Branch Searcher — Reddit

Reddit is reached through digmore's API, never from this machine. You send a query and a topic slug
and get structured results back. No account, no OAuth.

**Needs an API key.** Without one `api.mjs` exits 4 and Reddit is unavailable — not a failure. Plan
builds no Reddit branches when there is no key, so if you were dispatched, there is one.

## The command

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" reddit search <query> --topic <slug> \
  [--subreddit <name>]... [--sort {relevance|new|top|comments|hot}] \
  [--time-window {hour|day|week|month|year|all}] [--limit 20] [--after-date YYYY-MM-DD]
```

`--topic <slug>` is mandatory; the script refuses to run without it. JSON on stdout, errors on
stderr.

On a failure the script says what happened on stderr — read that rather than decoding the exit code. Two change what you do: `4` means no API key, so this source is disabled rather than failed, and `3` means the source is temporarily unavailable. Anything else is a failure to report as one.

## NEVER use WebSearch for Reddit

**`WebSearch site:reddit.com …` is forbidden. `api.mjs reddit search` is the only way in.**

This has happened in real runs, which is why it is stated this hard. reddit.com blocks the harness's
WebSearch UA at robots.txt, so a `site:reddit.com` query returns zero or near-zero results whatever
the topic actually holds — **and it returns them without an error**. Nothing looks wrong. The run
then reports "Reddit is thin on this topic," which is not a finding, it is the search never having
happened.

If you catch yourself reaching for WebSearch here, the answer is the script above.

## Two searches, in this order

**Search site-wide first, then search the subreddits you judge relevant.** Both, every time. One
without the other is how a Reddit branch comes back thin for a reason nobody can see.

### 1. Site-wide

```
node "…/api.mjs" reddit search <query> --topic <slug> --time-window all --after-date <cutoff from your dispatch>
```

No `--subreddit` at all. It searches the whole site, so it cannot miss a community because you did
not think of it.

**These hits are candidates. Keep every one of them** — they are threads about your angle, ranked by
Reddit across the whole site, and they go into what you return exactly like the scoped pass's hits.
Nothing here is thrown away.

They do a second job as well: they show you where this topic actually gets discussed.
**Take the subreddit out of each result's `url`** — a result carries `url`, `title` and `relevance`,
with no subreddit field, so it comes from the `r/<name>` segment of the permalink:

```
https://old.reddit.com/r/LocalLLaMA/comments/1a2b3c/vram_for_70b/  →  LocalLLaMA
```

Count how often each sub appears across the hits. That count is what tells you where the topic lives,
and it feeds the pass below.

### 2. Scoped

Then run the same query again with `--subreddit`, choosing the subs yourself:

- **The subs the site-wide hits came from**, where they clustered.
- **Subs you know are relevant whether or not they surfaced** — the obvious home for this subject,
  the vendor's own sub, the adjacent community where the practitioners actually are. A quiet sub that
  site-wide ranking buried can still be the one place the question is answered properly.

The second list matters as much as the first. Site-wide ranks by Reddit's relevance across everything,
which favours large general subs — so a small specialist sub can be exactly right and never appear.
Your judgement is the point of this step, not a fallback for it.

**Name the subs you think are right, including ones you are not sure exist.** A wrong or non-existent
`--subreddit` costs nothing — it comes back empty, and because you ran site-wide first that emptiness
is readable rather than misleading: site-wide found plenty and your subs found little means the picks
were off, both thin means the topic really is thin on Reddit. Guessing wrong is cheap here; not
guessing at all is what loses the specialist sub nobody would have found.

### How multi-sub behaves

**Multi-sub is one request, merged on the API's side.** Three consequences:

- **Order carries meaning** — the first `--subreddit`'s hits rank above the second's. Reversing them
  is a different query, not the same one, so put the sub most likely to answer the angle first.
- `--limit` applies to the merged list, not per subreddit.
- `relevance` is rank *within* that merged list.

## The date window

`--time-window` defaults to `year`, Reddit's largest bounded window. For the two-year window in
`../../recency.md`, pass both:

```
--time-window all --after-date <the cutoff date in your dispatch>
```

**The date arrives in your task text — do not work it out.** `preflight.mjs` prints one cutoff at
the start of the run and the orchestrator passes it to every branch, so all of them filter on the
same day. Computed here it would be a different date in each of the six Reddit branches, and the
run would have no single window at all.

`--after-date` filters on post creation on top of the unbounded window. That pair is yours to pass
on every search — the default is a floor, not the rule.

## Empty means empty

The script tells you which of two things happened, and they get different sentences:

- **`{"results": []}` on exit 0** — the topic really is thin on Reddit, and you can say so. Only say
  it when the **site-wide** pass came back empty too; an empty scoped pass on its own says you chose
  the wrong subs, not that Reddit is quiet.
- **Exit 3** — the source was walled. Report it as unavailable. **Do not call the script again.**
  It already made four attempts and waited 5s, 15s then 45s between them; exit 3 is what is left
  after all of that. A second run of the command buys another 65 seconds of the same answer, and
  it is the branch's whole time budget spent on a source that is down.

You can trust that split because the API does the work: Reddit answers a blocked request with a
redirect to its login page, HTTP 200, which parses as zero results. The API spots that, retries on a
fresh connection, and reserves exit 3 for the case where every attempt was walled.

## What you write

The `branch-searcher` shape — `{"results":[{"url","title","relevance"}]}`, `relevance` rank-based.
Each search's output already matches it; what you hand back is **both searches merged and deduped on
URL**, per §"Two searches" above. A thread found by both is one candidate, keeping the higher
`relevance`. Say in your log which subs you chose.

## What lands on disk

**Two files per branch**, one per search: the site-wide pass names itself `sitewide`, the scoped pass
names itself after the first sub you chose, so they never collide.

`digmore/<slug>/cache/reddit/reddit-search-<scope>-<query-in-4-words>.json` — one file per request,
written by the script, named so the directory reads without opening anything. `<scope>` is the first
`--subreddit` in the order given, or `sitewide`; the four words are the query with its stopwords and
punctuation removed.

```
--subreddit LocalLLaMA --subreddit selfhosted, query "what are the vram requirements for local llm"
  → reddit-search-localllama-vram-requirements-local-llm.json
```

**The name is readable, so it is not unique.** Four words cannot carry the other subreddits, the
sort, the window or the rest of the query, so two different searches can land on one name. The script
handles it: the whole request is stored inside the file and compared on read — same request is a hit,
a different one probes `-2`, `-3` and so on until it finds its own file or a free slot. The match is
on the stored request and never on the number, so a repeated search finds its own file whichever
number it landed on first.

None of that is yours to manage. Run the command; the script decides where the answer goes and hands
you back what it fetched or what it already had.

Those two files are what this dispatch leaves behind. The threads behind the URLs belong to the Page
Analyst.
