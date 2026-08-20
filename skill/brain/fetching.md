# Getting a web page

**One URL, one file on disk.** This is how every agent in the run fetches a page, and it is the
whole of it: which tool, what to do when the site blocks you, and where the file lands.

Four agents are sent this file, because four agents fetch: the Page Analyst, the Expert Document
Analyst, the Player Profiler and the Claim Fact Checker. What each of them then *does* with the page
is its own business and is in its own file.

## The command

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/fetch.mjs" <url> --output-dir <directory>
```

**You are given the directory; the script decides the filename.** It derives the name from the URL,
writes the file, and prints the path it wrote. There is no way to pass a filename, deliberately: one
URL always produces one file, so two agents that reach the same page share it instead of writing two
copies under two names they each invented.

The directory is always under `digmore/<slug>/cache/`, and the script refuses any path outside it.
Which one is yours — your own file says.

Three things it does for you:

- **Already on disk → no request.** It answers `cached: true` with the path. Never check for the file
  yourself first; that was the old rule and it never worked, because the caller could not know the
  name.
- **The extension comes from the response.** Read the written name off the returned `path` rather
  than assuming the one you passed.
- **A failure hands back the filename it would have used**, as `filename_only`. That is what makes
  the fallback below work without a second call.

Reddit, Hacker News and Twitter do not go through `fetch.mjs` at all — each has its own script, and
the agent's own per-source file names it.

## When the site blocks you

`fetch.mjs` gets the whole page and is blocked by bot walls. WebFetch gets through walls and
**silently shortens long pages, never saying where it cut**. So they go in this order and no other:

1. **`fetch.mjs` first, always.**
2. **Blocked → WebFetch**, and save what it returns under the `filename_only` the failed call put in
   its error payload. The file then lands where the rest of the run will look for it.
3. **Say which tool got it.** A page taken by WebFetch may be missing a tail nobody can see, and
   anything drawn from it carries that risk. How you say it is your own file's business — a field on
   what you return, or a line in your notes.

**Blocked is not the same as gone.** The error payload carries the HTTP `status`, so read it before
reaching for WebFetch:

- **401, 403, 429** — a wall. WebFetch is worth trying.
- **404, 410** — the page is not there. No tool changes that. Report it as unreachable and do not
  spend a second request.

**What is not a fallback:** `curl`, third-party proxies, reader services, archive mirrors. Two tools,
in that order, and nothing else.

## The one exception

SimilarWeb is fetched with WebFetch directly and never with `fetch.mjs` — the WAF in front of it
blocks a plain HTTP client outright, and what is wanted off that page is a number near the top rather
than a long document. It is the only place in the run where the order above is reversed, it belongs
to the Player Profiler, and the detail is in `subagents/player_profiler_agent.md`.

## What this file does not cover

Following a document across several pages, merging them and stripping the result is a different job —
assembling a document rather than getting a page. It belongs to the agents that do it, in
`subagents/page_analyst_agent/index.md`.
