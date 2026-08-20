# Recency

Every search across every source filters to the last 2 years. Older content is excluded.

The cutoff date is `today minus 2 years`. Compute it at run start; never hardcode.

## The window is applied by the scripts, not by the query

**Only the sources that can filter by date properly do it, and they do it in their own scripts.** A
search operator is not one of those places: `after:` is approximate on the open web, and on x.com it
actively suppresses organic results in favour of indexed marketing accounts — a date filter that
changes *which* results you get, not just how old they are.

So no branch query carries a date operator. Where a source cannot filter, the date is read off the
page when it is read.

- **Reddit** — `api.mjs reddit search --time-window all --after-date <today-minus-2y>`, passed by the caller on every search. Thread fetches accept older URLs only if the thread itself has activity (comments) within the window.
- **HN Algolia** — `numericFilters=created_at_i>{epoch_2yrs_ago}`. `hackernews.mjs` does this on the recent-comment search. Its two counting calls are deliberately *not* filtered: they exist to read lifetime totals and the true date a person last posted, and filtering them would turn "comments this account has ever posted" into "comments in the last two years" and make anyone dormant longer than the window look as though they had never posted at all.
- **Twitter** — no filter on the search. The window is applied after the fetch, from each tweet's own `created_at`.
- **The open web** — no filter on the search. Judge the date when the page is read, from the date on the page; `subagents/page_analyst_agent/websearch.md` records that published dates are unreliable, so a claim that turns on how recent something is gets checked against the page itself.
- **Forums** — no filter on the search. Sort by date where the forum allows it, and stop reading once items fall outside the window.
- **The user's own documents** — no window at all. The user chose the file; its age is their call. See `subagents/page_analyst_agent/local.md`.

## Why 2 years

Most of the topics digmore covers move fast: pricing, GTM, funding moves, recent feature launches, contrarian opinions on AI-era tooling. Older content is stale for the questions a `landscape` / `competitor` / `inquiry` / `gtm` run is trying to answer.

Hard rule, not advisory. If a known seminal source falls outside the window (e.g. a 5-year-old foundational paper), leave it out and name it in the run's Issues, so the user can decide whether to extend the window for that one source and re-run.
