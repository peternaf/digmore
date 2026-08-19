# Handle Vetter — specialty forums

**No script, and the weakest signals of any source.** There is no `vet_user` for a generic forum —
every forum exposes something different, and most expose nothing.

## What you have to work with

Whatever the Page Analyst recorded from the thread, in
`digmore/<slug>/cache/forums/<name>.md` and its claims file. There is no profile to fetch and no
verdict to inherit.

## The floor, in order of preference

**1. Reputation the forum publishes.** Where it exists, use it:

- post count and join date
- badges, or a Discourse trust level
- accepted-answer status on the thread you are vetting them from
- moderator or staff marking

Any of these, plus on-topic activity, is enough for `legit`.

**2. Cross-source corroboration.** Where the forum publishes nothing, the only real signal left is
whether this person exists elsewhere. If the same name is already in `experts.csv` from Reddit,
Hacker News or Twitter with a `legit` verdict, that carries — say which source it came from.

**3. Otherwise `unknown`.** A forum handle with no reputation signal and no presence elsewhere is
`unknown`, and that is the honest answer rather than a failure.

`unknown` has a real cost here, and it is worth knowing as you decide: **Synthesize drops `forum`
sources from `unknown` handles entirely** (`../../phases/synthesize_phase_d.md` §1). On this source the
verdict is not a caveat, it is whether the quote survives.

## Your part — topical relevance

The same judgement as everywhere, on much less evidence. Usually you have one thread. Where that
thread is squarely the subject and the person is answering rather than asking, `medium` is defensible;
`high` needs more than one appearance.

## `last_active`

The date of their post in the thread, as `YYYY-MM-DD`, where the forum shows one. `—` otherwise.

## What lands on disk

Nothing. There is no script and no cache file for this source's vetting — your return is the whole
record.

## Known gaps

- **Anonymised posts.** Forums that scrub attribution after an account closes leave the words and
  remove the person. Not vettable, and not quotable to anyone.
- **Display names are not identities.** The same display name on two forums is not evidence of one
  person. Do not merge them.
