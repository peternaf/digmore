# Handle Vetter — specialty forums

**No script, and the weakest signals of any source.** There is no vetting command for a generic forum
— every forum exposes something different, and most expose nothing. You make the whole judgement
yourself, from what is already on disk.

## What you have to work with

Your row's **`documents` array**, which names the cached files this handle appears in — the stripped
page and its claims file, under `digmore/<slug>/cache/forums/`. Open those. There is no profile to
fetch and no verdict to inherit.

**The array is the whole reason this is workable.** Those files are named per URL and carry nothing
about who posted in them, so without the list your only option would be to open every file in the
directory and search for your handle. The Source Analyst read the whole pile to build the row and
recorded which documents each handle turned up in, so the pointer is free here and unrecoverable
anywhere else.

A `documents` entry that is not on disk is not a reason to stop: judge on the files that are there,
and say in your `reason` which one was missing.

## The floor, in order of preference

**1. Reputation the forum publishes.** Where it exists, use it:

- post count and join date
- badges, or a Discourse trust level
- accepted-answer status on the thread you are vetting them from
- moderator or staff marking

Any of these, plus on-topic activity, is enough for `legit`.

**2. A link the profile or the post states outright.** Where the forum publishes no reputation, the
only thing left is what the person says about themselves — a signature or profile line naming their
site, their GitHub, or an account on another source. Where that named account is already in
`experts.csv` with a `legit` verdict, that carries; say which source it came from, and put the stated
link in the labelled field that fits it — `website`, `github`, `reddit`, `hn`, `twitter`, or
`otherIdentifiers` for anything else (`../index.md` §"One verdict per handle, one source per batch").

**A matching display name is not that link.** The same name on a forum and on Reddit is not evidence
of one person, and treating it as such is exactly the inference `../index.md` §"One handle, one
dispatch, one source" forbids. Read the link off the page or do not claim it.

**3. Otherwise `unknown`.** A forum handle with no reputation signal and no presence elsewhere is
`unknown`, and that is the honest answer rather than a failure.

`unknown` is an honest answer here and it does not kill the quote — the claim is kept and marked
**"unvetted"** (`../../vetting.md` §"Output marking"). The handle reached you by ranking
high on what they contributed to the question, and that is worth keeping even when the forum tells
you nothing about who they are. What your verdict changes is how much weight the reader gives them,
not whether they appear.

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
