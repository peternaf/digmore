# Handle Vetter — Reddit

## The command

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" reddit user <name> --topic <slug>
```

`--topic <slug>` is mandatory.

On a failure the script says what happened on stderr — read that rather than decoding the exit code. Two change what you do: `4` means no API key, so this source is disabled rather than failed, and `3` means the source is temporarily unavailable. Anything else is a failure to report as one.

## One call gives you everything

**The verdict and the evidence for your own judgement arrive together.** Vetting is computation over
comments the request already fetched, so it rides along at no extra cost.

What comes back:

- `name`, `link_karma`, `comment_karma`, `created_utc` — the profile.
- `verdict`, `signals`, `reason` — the script's heuristic result.
- **`recent_comments`** — up to 100, Reddit's page cap. **One object per comment**: body, subreddit,
  created_utc, permalink, score.

`recent_comments` is what you read for topical relevance. Each comment carries its own subreddit and
timestamp — read them off the object. Never pair separate lists by position.

A comment on a profile post shows its subreddit as `u_<name>`; that is Reddit's own naming, not an
error.

## The signals behind the verdict

In the order the script applies them:

1. New account with low karma → `throwaway`. Both together, never one alone.
2. Same URL host 5+ times across recent comments → `promoter`. 10+ → `spammer`.
3. Same brand-shaped token (`acme.com`-style) 5+ times → `promoter`.
4. 80%+ of recent comments in one subreddit, with at least 10 comments → `unknown`, the fanboy case.
5. Age ≥ 730 days, total karma ≥ 100, comment karma ≥ 1000 → `legit`.
6. 50 comments inside a 2-hour window → `spammer`.

Knowing which rule fired matters when you disagree with the result. Rule 4 in particular fires on
genuine specialists — someone who only posts in one subreddit because that is where their subject
lives is a fanboy by this rule and an expert in fact. Your topical-relevance read is what tells the
two apart.

## Your part — topical relevance

Read `recent_comments` against the research question.

Reddit makes this easier than the other sources, because each comment names its subreddit. Someone
whose recent activity spans four subreddits around your topic is `high` without needing close
reading; someone whose one on-topic comment sits among ninety about something else is `low`.

Score `high` / `medium` / `low`, and remember that zero recent on-topic activity demotes the verdict
to `unknown` no matter what the heuristics returned.

## `last_active`

The `created_utc` of the most recent entry in `recent_comments`, as `YYYY-MM-DD`.

## What lands on disk

**One file per handle**, written by that one call:
`digmore/<slug>/cache/reddit/reddit-vet-<name>.json` — the profile, the recent comments and the
verdict, together. It used to be three, because the brain it came from made two requests and cached
the verdict in a third; one response means one file, and three files meant three reads that all had
to hit before the cache counted as warm.

If it already exists the script returns it without re-fetching. **You do no checking to make that
true** — run the command and let it answer from disk or from the network.

## Known gap

Reddit caps user history in its own UI, so for a very old or very active account you are seeing a
recent slice, not a career. A thin-looking history on a high-karma account usually means the cap,
not inactivity.
