# Vetting (mandatory, per source)

Two independent dimensions are tagged per datapoint:
1. **Person credibility** — the commenter / author.
2. **Page quality** — the URL itself. In `page_quality.md`.

Both get tagged, and they feed different decisions. Credibility decides **how a quote is used** —
freely, caveated, labelled as promotion, or dropped — when the Raw report writer joins verdicts to
claims. Page quality decides **which citation is canonical** when several say the same thing, and
drops `unreliable` pages outright.

## Person credibility — the verdict

Verdicts:
1. `legit` — quote freely.
2. `unknown` — quote with the caveat "unvetted". The account was readable and nothing disqualifies
   it; there is simply not enough to call it either way.
3. `promoter` — only quote as a promotional signal, labeled.
4. `spammer` — drop. We read them, and they are not worth quoting.
5. `throwaway` — drop, and never spend a deeper read on them.

**A verdict other than `legit` changes how a quote is used, not usually whether it survives.** Only
`spammer` and `throwaway` are dropped. A handle reached vetting at all by ranking high on what it
contributed to the question, so discarding a defensible `unknown` loses evidence the run paid for and
already judged relevant.

**Not every quote carries a verdict, and that is normal.** `vet.handleCapPerSource` bounds how many
handles a source vets, and expert enrichment surfaces handles after Vet has finished. Those are
**`unvetted`** — no verdict exists — and they are quoted with the same caveat as `unknown`. An absent
verdict means nobody looked, never that somebody rejected them.

### `throwaway` is one action for three reasons

Named for **what we do**, not for what the account is, which is why one word covers three unlike
situations: in every one of them the material is dropped and no deeper read is spent. Which reason it
was goes in `verdictReason`, never in a second verdict word.

| `verdictReason` | What it is |
|---|---|
| `too-small` | new **and** tiny. **All conditions together, never one alone** — a new account can belong to someone who has just arrived, and a low follower count is not a lack of credibility. The thresholds differ per source and are in the code that applies them; `subagents/handle_vetter_agent/<source>.md` says which |
| `no-account` | the profile was read and there is nobody behind it: deleted, suspended, or private |
| `shadowbanned` | Hacker News kills the person's posts silently. The account can be a decade old with high karma — we drop it because nobody reads what they write, not because they are new |

A private ten-year-old account is not a "throwaway account", but it is one we throw away.

### Read it, or could not read it

The line is **whether the profile was read**, not whether it had anything in it. Both look like an
empty profile from the outside and they mean opposite things:

- **Read it, and it is gone** — deleted, suspended, private → `throwaway`, reason `no-account`. There
  is confirmed nothing behind the handle, and no deeper read would change that.
- **Could not read it** — the request failed, the host refused, the page would not parse →
  `unknown`. That is a gap in what the run could see, and says nothing about the person.

Verdict schema is shared across sources. Source-specific signals live in
`subagents/handle_vetter_agent/<source>.md`.

## Page quality (per URL, independent of commenter)

**In `page_quality.md`** — what each value means, their scores, and what the tag is
for. It is its own file because the agents that need it are not the agents that need the rest of this
one: the Page Analyst tags every page it reads and never vets a handle, so it gets that file and not
this one.

What matters here is only that the two dimensions are independent. A `legit` expert can link to a
content farm; a marketer can cite a regulatory filing. Tag both, separately.

## Confidence tag rule

Each finding in the summary gets a `high` / `medium` / `low` confidence tag:

- `high` — `primary-3p`, OR multi-source corroboration (different domain AND different source AND
  different expert — any 2 of 3 axes, counted from the citations that survived the verdict join, per
  `subagents/raw_report_writer_agent.md`).
- `medium` — single `primary-self` or `secondary` source, or split signal.
- `low` — blog/forum single source.

**Nothing downgrades a tag after it is written.** The verdicts that used to do it —
`manual-verify-required`, `low-confidence-unverified` — no longer exist: every rendered claim is
checked against the text the run stored, and one the evidence does not carry is deleted rather than
flagged (`subagents/claim_fact_checker_agent.md`). There is no state between confirmed and gone for a
tag to describe.

## Output marking

Output sections that cite a source must include the verdict next to the handle:

```
**u/<name>** [legit]    ← Reddit
**hn/<name>** [legit]   ← Hacker News
**x/<name>** [legit]    ← Twitter / X
```

`unknown` and `unvetted` are both marked **"unvetted"** — the claim is verified, the account behind
it is not. Two independent axes, two words: **verified** is the fact check's, **vetted** is this
file's. Never write "unverified" about a person; it says we shipped a claim we had not checked, which
is the one thing a run never does.

`promoter` is marked as a promotional signal. `spammer` and `throwaway` should not be in the output
at all — the quote was dropped.

## Curated experts (per topic)

`digmore/<topic-slug>/experts.csv`. Schema (column order is load-bearing):

```
real_name, reddit, hn, twitter, github, website, sources, notes, last_active, topical_relevance
```

- Only experts (legit verdict). Charlatans / promoters / spammers are not stored — they're dropped per-run.
- One row per person, spanning sources. Cross-source identity = filling more handle columns when known (e.g., an HN bio that links elsewhere).
- A row needs a `real_name` or at least one handle. An empty `real_name` is fine — plenty of experts are known only as `u/someone` — but a row with neither can never be matched again, and `experts.mjs` refuses it.
- `sources` = pipe-separated list of sources where this person is active.
- `github` holds a GitHub handle found through web search — worth recording wherever it turns up.
- During a run: any commenter / author whose handle matches a row is auto-promoted to `legit`, skipping behavioral vetting.
- Vet appends newly identified experts via `experts.mjs add`, which writes atomically.
- `last_active` = the user's real last post or comment (`YYYY-MM-DD`) — NOT the vetting run date. `—` when unknown. Reddit/HN: the most recent comment timestamp; Twitter: the latest tweet. When several sources report a date for one person, the latest wins: one person, one *last active anywhere*.
- `topical_relevance` = `high` / `medium` / `low`, the Handle Vetter's own reading from the topical-relevance check below. `high` — this topic is something they work on or return to; `medium` — they touch it credibly but it is not their subject; `low` — one or two on-topic posts and no more. Anyone scoring below that has zero recent on-topic activity, which demotes them to `unknown` and keeps them out of the file entirely. When several sources disagree, the strongest reading wins — squarely on-topic in one place and glancing in another is on-topic.

The CSV is the union of every legit person across the topic. `experts.mjs` enforces an idempotent
merge: re-merging the same row returns `no-op`; matching by `real_name` OR any handle column unions
sources and fills missing handle columns. Where a row matches more than one existing row by different
handles it refuses to merge, appending instead and flagging the ambiguity — exact equality only, never
a guess.

**One writer, so no lock.** The orchestrator writes this file, in the same batch pass that fills
`<source>-handles.json` — the Handle Vetters fan out one per handle and hand back one object each.
A fan-out writing to one shared file is what a lock would have been for, and there is no longer one.

### Identity is stated, never inferred

Two handles are one person when a profile **says so** — a bio pointing elsewhere, a handle naming
their own site, the same real name printed in two places. The Handle Vetter transcribes what a profile
prints into `stated_identifiers`; `experts.mjs` unions rows on exact overlap. Nothing anywhere works
out that `u/foo`, `hn/foo` and `@foo` are the same human from a matching username, a similar writing
style or the same avatar.

**What that costs, accepted rather than fixed:** someone who links nothing stays two or three rows.

## Inheritance on branched topics

When a topic is branched from a parent, the child inherits the parent's `experts.csv` by **copy at the moment of branching**. The child can diverge cleanly without affecting the parent. There is no chain-lookup.

## Per-source vetting signals

Behavioral signals live in `subagents/handle_vetter_agent/<source>.md`. Examples:
- Reddit: account age, karma split, URL repetition, sub concentration, burst posting.
- Hacker News: karma, account age, lifetime story / comment counts, recent comment sampling, and the `dead` flag on recent submissions.
- Twitter: a heuristic floor that never reaches `legit`, plus the expert/marketer call made from sampled posts where the run read any.
- WebSearch: domain authority + cross-reference against other sources' people.
- The user's own documents: no vetting — there is no handle to vet. See `subagents/page_analyst_agent/local.md`.

## Topical relevance — the Handle Vetter's

The source scripts' heuristics do NOT check topical relevance (the "does the commenter discuss similar
topics elsewhere" signal). The script doesn't know what the topic is.

**The Handle Vetter layers that check on top of the script's verdict**, inside the same dispatch,
using the recent activity the call already returned: on Reddit that is `recent_comments`, each object
carrying its own body and subreddit, and on other sources the equivalent field. It is given the
research question for exactly this. A handle the heuristic returns `legit` for is still demoted to
`unknown` if they have zero recent on-topic activity.

The reading is not just a filter — it comes back as `topical_relevance` and is written onto both
`<source>-handles.json` and the `experts.csv` row. It is the only place that judgement is made, and
`../reference/landscape.md`'s Hubs table reads the column back.
