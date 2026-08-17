# Recency

Every search across every source filters to the last 2 years. Older content is excluded.

The cutoff date is `today minus 2 years`. Compute it at run start; never hardcode.

## Per-source enforcement

- **WebSearch** — append `after:<YYYY-MM-DD>` to every query.
- **Reddit** — `api.mjs reddit search` filters results by `created_utc`. Thread fetches accept older URLs only if the thread itself has activity (comments) within the window.
- **HN Algolia** — pass `numericFilters=created_at_i>{epoch_2yrs_ago}` on every search call. `hackernews.mjs` does this on the recent-comment search. Its two counting calls are deliberately *not* filtered: they exist to read lifetime totals and the true date a person last posted, and filtering them would turn "comments this account has ever posted" into "comments in the last two years" and make anyone dormant longer than the window look as though they had never posted at all.
- **Forums** — sort by date, stop reading once items fall outside the window.
- **Twitter** — `since:<YYYY-MM-DD>` on every WebSearch query.
- **The user's own documents** — no window. The user chose the file; its age is their call. See `sources/local.md`.

## Why 2 years

Most of the topics digmore covers move fast: pricing, GTM, funding moves, recent feature launches, contrarian opinions on AI-era tooling. Older content is stale for the questions a `landscape` / `competitor` / `inquiry` / `gtm` run is trying to answer.

Hard rule, not advisory. If a known seminal source falls outside the window (e.g. a 5-year-old foundational paper), leave it out and name it in the run's Issues, so the user can decide whether to extend the window for that one source and re-run.
