# Long-form content handling

For any URL likely to be long-form (articles, docs, long forum threads, multi-thousand-word posts):

- Do NOT use `WebFetch`. It truncates and the truncation point is invisible to you.
- Use `node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/fetch.mjs" <url> --output digmore/<topic-slug>/cache/<source>/<name>`. The script anonymously streams the page to a local cache file.
- For HTML pages where only specific sections matter, dispatch a sub-agent that reads the cached local file and returns the matched sections.

`fetch.mjs` is the canonical fetch path across the project. The one documented exception is SimilarWeb — see `sources/websearch.md` §"Website traffic", where `WebFetch` works because the harness's network path reaches pages a plain HTTP client cannot.

## How to decide

| URL pattern | Tool |
| --- | --- |
| Article, blog post, docs page, long forum thread, anything > ~3k words | `fetch.mjs` |
| Short search-result snippet, summary card | `WebSearch` result alone may suffice |
| Reddit thread | `api.mjs reddit thread` (not `fetch.mjs`) — it parses comments |
| HN story + comments | `hackernews.mjs story` (not `fetch.mjs`) — Algolia returns structured trees |
| SimilarWeb domain page | `WebFetch` (the one exception) |
| A file the user handed over | read it directly; it is already local. See `sources/local.md` |

## Follow the document to its end

A long thread or article is often split across pages, and the first page is the least interesting one — the resolution, the correction and the "this worked" reply are at the end. Read the whole document, not the part that happened to be linked.

After the sub-agent reads a cached page, it looks in that page for the link to the next one and fetches it the same way, repeating until the document runs out:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/fetch.mjs" <next-url> --output digmore/<topic-slug>/cache/<source>/<name>-p2
```

What counts as a next-page link, in the order worth trying: a `rel="next"` link, a numbered pager where the current page is not the last, or a "Next" / "Older" / "»" control. Query-string (`?page=2`) and path-segment (`/page/2/`) forms are both common. A page with none of these is the last page, and that is the normal way to stop.

**There is no separate page budget — every page is a fetch, spending the branch's `fetchesPerBranch`.** A branch can read 20 single-page URLs, or one 20-page thread, or any mix. When the budget runs out mid-document, stop and record the shortfall like any other cap.

Three rules keep this from going wrong:

- **Each page is its own cache file**, suffixed `-p2`, `-p3` and so on, so a resumed run re-reads what it already has instead of re-fetching.
- **Stop when the link stops moving.** A pager that returns the same URL, or a page whose content repeats the previous one, is the end of the document dressed up as another page. Two identical pages in a row means stop.
- **A truncated document is disclosed, never silent.** Hitting the ceiling is recorded like any other cap — see `phases/extract_phase_b.md` — with the page count reached and the fact that more existed.

This is the whole of "pagination past page 1" as digmore does it. It does not reach Reddit comment trees, which page behind the API on `--limit`, and it does not reach WebSearch, whose results have no page 2 to ask for — there, more coverage means more angle-specific queries.

## Caching

`fetch.mjs` writes the raw page bytes to the path you pass via `--output`. **The `--output` path must resolve under `digmore/<topic-slug>/cache/<source>/<safe-filename>`.** The script enforces this and refuses any other path, so a run cannot write outside its own topic.

If the cached file already exists, the sub-agent reading it can skip the re-fetch. Source scripts implement this cache check themselves; `fetch.mjs` does not (it overwrites). When chaining fetches, check existence before calling.
