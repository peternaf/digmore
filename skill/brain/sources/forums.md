# Specialty forums source

Generic catch-all for online forums that don't have a dedicated source script. Examples: ProductHunt, IndieHackers, niche subforums (Doom9, Hydrogenaudio, video-engineering specific forums), Discord public threads exposed via web.

Free, no key — this source runs whether or not digmore's API is configured.

## Search — Discovery

Use `WebSearch site:<forum-domain> <query>` per the recency rule (`../recency.md`). The Branch searcher harvests thread URLs.

If you don't know which forums to search, start with `WebSearch <topic phrase> forum discussion after:<date>` and let surfaced domains tell you what's active. Add the ones that recur to the run's `source_notes/forums.md`.

## Search — Fetch

For thread URLs, use:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/fetch.mjs" <url> --output digmore/<slug>/cache/forums/<safe-name>
```

The script streams the page to a local file. Why not WebFetch: long threads truncate, and the truncation point is invisible to you. `fetch.mjs` is the canonical fetch path for long-form content. See `../long-form.md`.

Then dispatch a Source extractor sub-agent that reads the cached file and emits structured claims.

**Forum threads are usually paginated, and the useful part is at the end** — the accepted fix, the correction, the "this worked". The sub-agent follows the thread to its last page, spending the branch's fetch budget as it goes. See `../long-form.md` §"Follow the document to its end".

## Vetting

Forum vetting is the weakest of the sources:
- If the forum exposes reputation signals (post count, badges, trust levels on Discourse, accepted-answer status), use them as the legit floor.
- Otherwise, only quote a handle if they show up across other sources too (cross-source corroboration via `experts.csv`).
- Sources tagged `forum` from `unknown` handles are dropped in Synthesize (see `../phases/synthesize_phase_d.md`).

## Source quality

Forum content is almost always tagged `forum`. Exception: a forum's own pinned moderator post explaining a policy → `primary-self`. Otherwise the page is community discussion.

## Anonymity

Standard browser UA via `fetch.mjs`'s headers. Many forums fingerprint UA — if a forum returns 403 / 429 consistently, log it in `source_notes/forums.md` and skip rather than escalating to logged-in scraping.

## Known gaps

1. Some forums require JavaScript rendering for content; `fetch.mjs` is HTTP-only. Surface unreadable forums in `source_notes/forums.md` and move on.
2. Discord public threads exposed via web are partial — only the visible message slice loads. Treat as supporting evidence only, not primary.
3. Quote attribution can be ambiguous on forums that anonymize posts after deletion / account closure. Same handling as Reddit `[deleted]` / `[removed]`: body invisible, attribution lost.
