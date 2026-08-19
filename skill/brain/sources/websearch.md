# Web search source

Claude Code's `WebSearch` tool. Free, no key — this source runs whether or not digmore's API is configured, and it is the backbone of a run without one. Used for:
- Generic web discovery on every angle in Search.
- `site:`-filtered discovery for sources that don't have native search (Hacker News, Twitter, forums).
- One-off fact-checks in Audit.

## Query conventions

Every WebSearch query:
- Includes the recency token: `... after:<YYYY-MM-DD>`. Cutoff = today minus 2 years. See `../recency.md`.
- Quotes multi-word phrases for exact match. Drop quotes if results are too thin.

## When to use WebSearch alone vs. WebSearch + fetch

WebSearch returns titles + short snippets + URLs. For a deeper read:
- If the page is short or a snippet is sufficient → use the WebSearch result alone.
- If the page is long-form (article, doc, long thread) → dispatch a Source extractor sub-agent that calls `fetch.mjs` against the URL, then reads the cached file. See `../long-form.md`.

## The session cap

Claude Code caps web searches per session. A deep run can reach it. When it does, the run does not fail — tell the user to start a new session and re-run the same command, and resume picks up from the cache. See `../phases/index.md`.

Spend the budget deliberately: several angle-specific queries beat one broad query re-run with small variations.

## Vetting (source quality on URL)

WebSearch doesn't tell you who posted a page — there's no "commenter" to vet. The source-quality tag (`primary-3p` / `primary-self` / `secondary` / `blog` / `forum` / `unreliable`) is decided by the Source extractor sub-agent based on the domain and content shape.

- Domain authority signals: well-known publisher domain → `secondary`. Vendor's own domain → `primary-self`. Government / academic → `primary-3p`. Personal blog → `blog`. Anything obviously content-farm or AI-generated → `unreliable`.
- Cross-reference: if the page author's name surfaces elsewhere as a Reddit / HN / Twitter handle, that's evidence to consider for `experts.csv` (treat as a person to vet via that source's `vet_user`).

## Site-filter recipes

Per-source discovery uses WebSearch with `site:` filters. Each source's file has the canonical query — link references:

- Hacker News: `site:news.ycombinator.com <query> after:<date>`. See `hackernews.md`.
- Twitter: `(site:x.com OR site:twitter.com) "<phrase>"`. See `twitter.md`.
- Specific forums: `site:<forum-domain> <query>` then `fetch.mjs` for long threads. See `forums.md`.
- Reddit: **not** via WebSearch — the harness's UA is blocked. See `reddit.md`.

A `site:` filter on a host with no dedicated source tool is ordinary web search and is fine. That includes code hosts and Q&A sites: their content reaches the report through plain search, without the signals a dedicated source would add.

## Website traffic (per-player, Synthesize)

Enforced by `../phases/synthesize_phase_d.md` §3.5.

1. Identify the marketing domain. `url` is a hint — open-source projects with a code-host `url` may also have a marketing site (Frigate → `frigate.video`). Check the project's front page first.
2. **SimilarWeb via WebFetch**: `https://www.similarweb.com/website/<domain>/`. Returns visits, countries, sources, bounce rate, rank. Use `WebFetch`, not `fetch.mjs`.
3. Subdomains → try the parent.
4. Other free estimators: blocked, skip.

### `monthly_visits` encoding

| Situation | Cell |
| --- | --- |
| SimilarWeb returns data | numeric (e.g. `1.4M`) |
| Only a code-host URL, no marketing site | `github-only` |
| Domain not indexed / captcha / subdomain unhelpful | `UNAVAILABLE — <reason>` |

## Known gaps

1. WebSearch can't see behind paywalls. Paywalled URLs surface as low-content results; pair with `forum` / `secondary` quotes about the same content where possible.
2. WebSearch returns at most a few dozen results per query. For broad topics, run multiple angle-specific queries rather than one big query.
3. WebSearch's `after:` filter is approximate — some older content slips through. Cross-check publish date when extracting claims.
