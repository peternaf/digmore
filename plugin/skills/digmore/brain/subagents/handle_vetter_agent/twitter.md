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

On a failure the script says what happened on stderr — read that rather than decoding the exit code. Two change what you do: `4` means no API key, so this source is disabled rather than failed, and `3` means the source is temporarily unavailable. Anything else is a failure to report as one.

## Two depths, one dispatch

| Depth | The call | What it reads |
|---|---|---|
| **profile** | `--posts 0` | the profile alone |
| **deep** | `--posts <n>` | the profile, plus the handle's `n` most recent posts |

**You do not choose which, and you are dispatched once either way.** The orchestrator decides the
depth before anything runs, from each handle's rank in `<source>-handles.json`: the top
`twitter.handlesDeepVetted` get `--posts <twitter.postsPerDeepVet>`, everyone else `--posts 0`
(`../../phases/vet_phase_c.md`). Choosing needs a view of every handle at once, and you can see one.

There used to be two waves — a profile pass over everyone, then a deep pass over whichever came back
`unknown` — because nothing knew who was `unknown` until the cheap verdict arrived. That reason is
gone: the ranking exists before Vet starts, so the deep set is picked on what each handle actually
contributed rather than on a verdict that has to be bought first. If you find a file, a plan or a
habit that expects a second dispatch, it is out of date.

Both numbers belong to the user; `preflight.mjs` prints the values this run applies. Pass what you
were given and never a default of your own.

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
`unknown` and posts were actually sampled, which means you were dispatched at a deep `--posts`.

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

**One file per handle**, written by the script:
`digmore/<slug>/cache/twitter/twitter-vet-<handle>.json` — the profile, the sampled posts and the
verdict, together, however many times the handle is vetted. It used to carry the depth in its name,
because a handle could be vetted twice; it cannot any more.

**The file records the depth it was fetched at, as `posts_sampled`, and the cache check compares it.**
A call is a hit only when `posts_sampled` is **at least** what this call asked for — deeper supersedes
shallower, never the other way round. That is what stops a re-run that raised
`twitter.postsPerDeepVet`, or a handle that moved up into the deep set, opening a profile-only file and
returning it having never read the posts it was dispatched for.

The other two verbs — `twitter user` and `twitter tweets` — write their own files, and this agent runs
neither.

## When the source is walled

Exit 3 means temporarily unavailable, and that is the whole of what to say about it. The causes are
the API's, not the user's, and not the user's to fix. Already-cached handles stay usable.

## In `--fast`

`twitter.handlesDeepVetted` is `0`, so every handle arrives at `--posts 0`. The voice judgement above
goes with it, since it needs posts a profile call never fetches. A fast run's Twitter verdicts are
therefore confident negatives and `unknown`, nothing else.

Two things follow, and both are accepted rather than worked around. Every Twitter quote in a fast run
is marked "unvetted", and a summary section resting entirely on them opens by saying nobody behind it
could be vetted. And Enrichment finds no Twitter posts cached to expand from, because nothing sampled
any.
