# Anonymity

The research must not identify the user. Applies to every external request, regardless of source.

This is the user's research, run from the user's machine. What they are looking into is their business, and nothing in a request should let a third party work out who is asking.

## Rules

1. **Spoofed browser UA.** Rotate UA strings across the session. The pool lives in `scripts/fetch.mjs` as `BROWSER_USER_AGENTS`, accessed via `randomBrowserUa()`. Source scripts already use it; for any new HTTP call written ad-hoc by a sub-agent, set `User-Agent` from this pool.

2. **No identifying phrases in WebSearch queries.** Search the topic generically. Do not include the user's company or product names, internal codenames, customer names, or domain strings. "video API providers pricing" is fine. "compare to <the user's product> video pipeline" is not.

3. **No user-identifying terms in external request bodies / headers.** Includes `Referer`, custom auth headers, payload fields.

4. **Reddit and Twitter anonymity is the API's problem, not yours.** Those sources go through digmore's API, which owns whatever fetching discipline they need. The plugin sends a topic slug and a query; it never touches those sites directly.

## The UA pool

A small set of recent Chrome-on-Windows strings, five entries. **Read the pool from `scripts/fetch.mjs`, never from this file** — a list written here would drift out of date the moment the script rotated, and then it would be wrong in the one place someone would trust it.

The pool is small on purpose — large pools are themselves a fingerprint. If a source starts getting blocked, the fix is rotating the entries (replacing old Chrome versions with current) rather than expanding the pool. Don't grow the list past 6–8.

## Per-source nuance

- **WebSearch** — the harness's own tool; the UA isn't your concern.
- **`fetch.mjs`** — UA plus a browser header set including Accept-Language. Used for long-form pages that WebFetch can't handle.
- **Hacker News** — `hackernews.mjs` uses the same pool. Algolia doesn't care; the HN web page sees a normal Chrome string.
- **The user's own documents** — never leave the machine. See `sources/local.md`.

## When anonymity is broken

If you discover that a request leaked something identifying (a clarifying-question phrase that made it into a WebSearch query, say), the research run is not invalid, but:

- Name the leak in the run's Issues and record it in `audit.md`.
- Note which URLs were touched so the user can decide whether to discount them.
- Say plainly what leaked and where, so the user can judge the exposure themselves.
