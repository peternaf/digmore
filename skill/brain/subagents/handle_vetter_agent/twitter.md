# Handle Vetter — Twitter (X)

The only source where the script cannot reach `legit` on its own, and where the judgement may fall to
you.

**Needs an API key.** Without one `api.mjs` exits 4 and Twitter is unavailable.

## The commands

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" twitter vet    <handle> --topic <slug> --tier {1|2|3}
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" twitter user   <handle> --topic <slug>
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" twitter tweets <handle> --topic <slug> [--limit 25]
```

`vet` is the one you normally run — the tier decides how deep it goes. `--topic <slug>` is mandatory.

Exit codes: `0` success · `3` source temporarily unavailable · `4` no API key · `5` key rejected ·
`1` anything else.

## Tiers — depth, not price

| Tier | What it reads |
|---|---|
| 0 | already in `experts.csv` from another source → treated as `legit`, **no request at all** |
| 1 | profile only |
| 2 | profile + 25 recent tweets |
| 3 | profile + 100 recent tweets — reserved for Synthesize anchor candidates |

Each tier caches separately, so escalating fetches the deeper data rather than re-reading the
shallower answer.

**Escalate one tier at a time, and only when the current tier is genuinely ambiguous.** Explicit
limits on every call; never rely on a default.

## The heuristic floor never says `legit`

This is the thing that makes Twitter different. The script detects confident negatives and nothing
else:

- URL repetition ≥ 10 → `spammer`. 5–9, or a brand token 10+ → `promoter`.
- 50 tweets in a 2-hour window → `spammer`.
- Under 30 days old with under 50 followers → `unknown`.
- **Everything else → `unknown`.**

So an `unknown` here does not mean "suspicious". It means the floor found nothing disqualifying and
stopped, because follower counts and posting volume cannot tell an expert from a marketer.

## When the judgement is yours

**The response says so: `needs_llm_judgment: true`.**

Read the flag. Do not re-derive it from the verdict and the tier — the API owns that rule, and
reasoning your way back to it is a step that can go wrong. It is set when the verdict is `unknown`
and tweets were actually sampled, which means Tier 2 or 3.

When it is set, read the cached tweets and classify the voice:

| What you see | Verdict |
|---|---|
| **real expert** — works in this, talks about the work, disagrees with people | `legit` |
| **marketer** — every post routes to one product or one funnel | `promoter` |
| **content-seller** — the subject is a vehicle for a course, a newsletter, a cohort | `promoter` |
| **agenda-pusher** — the position never moves regardless of evidence | `unknown` |

This judgement is always the plugin's to make. Nothing upstream makes it, and nothing downstream
checks it.

## Your part — topical relevance

Read the sampled tweets against the research question. At Tier 1 you have only a profile and a bio,
which is rarely enough for better than `medium` — say so in your `reason` rather than guessing high.

## `last_active`

The `created_at` of the most recent tweet fetched, as `YYYY-MM-DD`.

## What lands on disk

`digmore/<slug>/cache/twitter/`:

- `twitter-vet-<handle>-tier<N>.json` — the verdict, per tier.
- `twitter-user-<handle>.json` — the profile.
- `twitter-tweets-<handle>-<N>.json` — the timeline, per limit.

## When the source is walled

Exit 3 means temporarily unavailable, and that is the whole of what to say about it. The causes are
the API's, not the user's, and not the user's to fix. Already-cached handles stay usable.

## In `--fast`

Tier 1 only, five handles maximum. Tiers 2 and 3 are skipped, and with them the voice judgement
above — it needs tweet payloads that a Tier 1 call never fetches. A fast run's Twitter verdicts are
therefore confident negatives and `unknown`, nothing else.
