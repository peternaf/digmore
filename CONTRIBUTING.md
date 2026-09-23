# Contributing

## Where things live

- `skill/` is the source. `plugin/` is generated from it — never edit `plugin/` by hand.
- `skill/brain/` owns how a run executes. `skill/reference/*.md` owns what is specific to one
  command, and never repeats a brain rule.
- `AGENTS.md` holds the working rules. Read it before changing anything.

## Before you start

Open an issue first and say what you want to change and why. Wait for a maintainer to agree with
the direction before writing code — a change to `skill/brain/` can look right and still be wrong,
and no test will tell you.

## Before you open a PR

1. `npm test` — every test passes, and any script or shape you changed has a test.
2. `npm run build` — commit the regenerated `plugin/` with your change; CI compares the two.
3. No real network in tests. Stub the API and every third party.

## Rules that are not negotiable

- Every number a run applies lives in `~/.digmore/settings.json` and is read by a script — never
  hard-coded in prose or a brain file.
- One place defines a thing; everywhere else points at it.
- Every file a run writes has exactly one writer. No locks.
- A new sub-agent or phase step says how it behaves in all four run kinds: `--auto` or not,
  `--fast` or not.
- Full variable names. No single letters, no aliases.
- New outbound requests to third parties set `User-Agent` from `BROWSER_USER_AGENTS` in
  `skill/scripts/fetch.mjs` and send nothing that identifies the user.
- A source that fails is named in the report. Never silently.

## Adding a sub-agent or a phase step

- The agent's file under `skill/brain/subagents/` opens with the summary table `AGENTS.md`
  specifies — one row per field, `n/a` where a field does not apply, never a dropped row. The
  table is the definition; the prose below it explains how and why and never restates it.
- The `--fast` row names the configuration, never its number: the user may have changed it, and
  `preflight.mjs` prints what a run actually applies.
- The model tier goes in the roster in `skill/brain/index.md`, not in the agent's file. Drop a
  tier only where the agent's judgement is mechanical or something downstream checks its work.
- Anything that writes a file is added to `skill/brain/phases/index.md` §"Where a run writes".

## Commits

Small, one change each, in plain words. Say what changed and why, not how.

## Legal

Contributing creates no employment, contractor, partnership or agency relationship between you and
digmore. You contribute voluntarily, unpaid, on your own time and equipment, and you confirm the
work is yours to give — not owned by an employer or bound by any agreement of yours. Your
contribution is licensed under the repo's Apache 2.0 licence, with no other rights promised or
implied.
