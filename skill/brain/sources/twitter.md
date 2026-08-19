# Twitter (X) source

Script: `api.mjs twitter`. Twitter is reached through digmore's API. Search discovery uses `WebSearch`, because there is no affordable historical search of x.com.

**This source needs an API key.** Without one, `api.mjs` exits 4 and the source is unavailable. That is not a failure: the run proceeds without Twitter and says so, in the summary and in the terminal output.

## CLI surface

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" twitter user   <handle>  --topic <slug>
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" twitter tweets <handle>  --topic <slug> [--limit 25]
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" twitter tweet  <id>...   --topic <slug>
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" twitter vet    <handle>  --topic <slug> --tier {1|2|3}
```

JSON on stdout. **`--topic <slug>` is mandatory on every call** and the script refuses to run without it.

Exit codes: `0` success · `3` the source is temporarily unavailable · `4` no API key, source disabled · `5` the key was rejected · `1` anything else, including a request blocked in transit.

## Search discovery (NOT via this script)

Canonical query for `WebSearch`:

```
(site:x.com OR site:twitter.com) "<topic phrase>"
```

Notes:
- Keep queries to 2–3 keywords. WebSearch's `site:` operator soft-fails when too few pages match all keywords at once — it silently falls back to results from OTHER domains instead of returning empty. A 5-keyword query like `cloudinary pricing expensive bill shocked` returns zero x.com URLs; the 2-keyword `cloudinary expensive` returns several. Narrow with one well-chosen noun, not a multi-word predicate.
- No `after:` filter. Empirically, `after:` on x.com results suppresses organic tweets and biases the top results toward indexed marketing accounts. Recency is recovered from per-tweet `created_at` after fetch, not from the query.
- OR both hosts — `twitter.com` retains older indexed content.
- Quote phrases for exact match; drop quotes if results are thin.

WebSearch returns URLs and thin titles only. **Tweet body text is NOT indexed**, because x.com renders its content client-side, so a crawler sees only the page title — roughly the first 15 words. This is the expected Search output, not a failure mode. From each result, harvest two things:

1. The author handle → fed into Vet vetting via `api.mjs twitter vet`.
2. The tweet ID (last path segment of `x.com/<handle>/status/<id>`) → fed into citation lookup via `api.mjs twitter tweet` when the tweet is quoted in the summary.

Synthesize expert-following uses `api.mjs twitter tweets` (the user's recent timeline).

## Tweet-body lookup (citation)

`api.mjs twitter tweet <id>...` fetches the actual body of specific tweets by ID, batching up to 100 per call and asking only for IDs not already cached. One cache file per ID (`tweet-<id>.json`), so re-quoting the same tweet across runs does not re-fetch it.

**Use it whenever a tweet is quoted.** Without it a Twitter citation is silently only the first 15 words of the tweet, which is not a quote — it is a preview that looks like one. Nothing errors when this verb is skipped, which is exactly why it has to be a habit.

Distinct from `api.mjs twitter tweets` (a user's recent timeline, for vetting) — `tweet` takes IDs, `tweets` takes a handle.

## Tiers — depth, not price

- Tier 0 — already in `experts.csv` from another source; treated as `legit`. No request at all.
- Tier 1 — profile only.
- Tier 2 — profile + 25 recent tweets.
- Tier 3 — profile + 100 recent tweets. Reserved for Synthesize anchor candidates.

Each tier caches separately, so escalating fetches the deeper data rather than re-reading the shallower answer.

## Tier rules

- Defer vetting until a handle appears at least twice across Extract's data.
- Escalate one tier at a time only when the current tier is ambiguous.
- Explicit limits on every call; never rely on defaults.

## Mode dispatch (cross-link to `../modes.md`)

- **Manual mode:** more than 20 handles at Tier 1 or Tier 2, or more than 5 at Tier 3 → surface the handle count and the tier, and prompt the user.
- **Auto mode:** same numbers as hard caps. Above the cap, stop. Don't ask. Record the cap-hit in the Run footer of the summary.

## Vetting layers

1. **Heuristic floor** — detects obvious spammers (URL repetition ≥10) and promoters (URL repetition 5–9, brand token 10+). Detects burst posting (50 tweets in 2h → spammer). Detects young + low-engagement (< 30 days + < 50 followers → `unknown`). Never returns `legit` — only confident negatives or `unknown`.
2. **LLM judgment** — for handles where the heuristic returns `unknown` AND tweets were fetched at Tier 2/3, dispatch a sub-agent that reads the cached tweets and classifies the voice: real expert / marketer / content-seller / agenda-pusher. Maps to the shared verdict schema (`legit` / `promoter` / drop).

## When the source is unavailable

Exit code 3 means this source is temporarily unavailable. That is all it means and all you should say about it — the API owns its own failures, and their causes are not the user's business and not the user's to fix.

- **Manual mode:** tell the user Twitter data is temporarily unavailable, and continue the run without it. Offer to re-run the source later; the cache means already-fetched handles are not re-fetched.
- **Auto mode:** halt at the Twitter source boundary, record it in `audit.md` and name it in the run's Issues. Resume picks up from cache.

Either way the summary and the terminal output name Twitter as a source the run could not fully reach.

## Cache layout

`digmore/<slug>/cache/twitter/`:
- `user-<handle>.json` — profile payload.
- `tweets-<handle>-<N>.json` — timeline payload, per limit.
- `tweet-<id>.json` — one per quoted tweet.
- `vet-<handle>-tier<N>.json` — the verdict, per tier.

## Anonymity

Nothing about the user reaches x.com: the request goes to digmore's API, which owns the credentials and the fetching. The plugin sends a handle or an ID and a topic slug.
