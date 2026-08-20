# Handle Vetter — Twitter (X)

The only source where the script cannot reach `legit` on its own, and where the judgement may fall to
you.

**Needs an API key.** Without one `api.mjs` exits 4 and Twitter is unavailable.

## The commands

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" twitter vet    <handle> --topic <slug> --posts <n>
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" twitter user   <handle> --topic <slug>
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" twitter tweets <handle> --topic <slug> [--limit 25]
```

`vet` is the one you normally run — `--posts` decides how deep it goes. `--topic <slug>` is
mandatory.

Exit codes: `0` success · `3` source temporarily unavailable · `4` no API key · `5` key rejected ·
`1` anything else.

## Two depths

| Depth | The call | What it reads |
|---|---|---|
| **profile** | `--posts 0` | the profile alone |
| **deep** | `--posts <n>` | the profile, plus the handle's `n` most recent posts |

**You do not choose which.** The orchestrator hands you the number, because choosing needs a
view of every handle at once and you can see one. It runs the profile pass over all of them
first, then dispatches the deep pass over the few worth it — so a handle that gets the deep
read reaches you twice, and the second dispatch is the one that does the real work
(`../../phases/vet_phase_c.md`).

The number itself is `twitter.postsPerDeepVet`, and how many handles get that far is
`twitter.handlesDeepVetted`. Both belong to the user; `preflight.mjs` prints the values this
run applies. Pass what you were given and never a default of your own.

Each depth caches under its own name, so the deep call fetches the deeper answer rather than
re-reading the profile already on disk.

## The heuristic floor never says `legit`

This is the thing that makes Twitter different. The script detects confident negatives and nothing
else:

- URL repetition ≥ 10 → `spammer`. 5–9, or a brand token 10+ → `promoter`.
- 50 tweets in a 2-hour window → `spammer`.
- New, with almost no followers and almost nothing posted → `throwaway`. All three together, never
  one alone.
- **Everything else → `unknown`.**

So an `unknown` here does not mean "suspicious". It means the floor found nothing disqualifying and
stopped, because follower counts and posting volume cannot tell an expert from a marketer.

## When the judgement is yours

**The response says so: `needs_llm_judgment: true`.**

Read the flag. Do not re-derive it from the verdict and the post count — the API owns that rule,
and reasoning your way back to it is a step that can go wrong. It is set when the verdict is
`unknown` and posts were actually sampled, which means you are on the deep pass.

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

Read the sampled posts against the research question. On the profile pass you have only a profile
and a bio, which is rarely enough for better than `medium` — say so in your `reason` rather than
guessing high.

## `last_active`

The `created_at` of the most recent tweet fetched, as `YYYY-MM-DD`.

## What lands on disk

`digmore/<slug>/cache/twitter/`:

- `twitter-vet-<handle>-<n>posts.json` — the verdict, one file per depth.
- `twitter-user-<handle>.json` — the profile.
- `twitter-tweets-<handle>-<N>.json` — the timeline, per limit.

## When the source is walled

Exit 3 means temporarily unavailable, and that is the whole of what to say about it. The causes are
the API's, not the user's, and not the user's to fix. Already-cached handles stay usable.

## In `--fast`

`twitter.handlesDeepVetted` is `0`, so there is no deep pass at all — every handle is
`--posts 0`. The voice judgement above goes with it, since it needs posts a profile call never
fetches. A fast run's Twitter verdicts are therefore confident negatives and `unknown`, nothing
else.
