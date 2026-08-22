# Source Analyst — Twitter (X)

## What is on disk

`digmore/<slug>/cache/twitter/`:

| File | What it is |
|---|---|
| `twitter-tweet-<id>.json` | one per tweet the run quoted — the real body, not the search preview |
| `twitter-tweet-<id>-claims.json` | the Page Analyst's extraction from it |
| `twitter-vet-<handle>.json` | one per vetted handle, if Vet has already run: the profile, the sampled posts and the verdict together. `posts_sampled` says how many posts it holds — `0` on a handle that got the profile alone, and on every handle in a `--fast` run |

**This source is thinner than the others by design.** Discovery is WebSearch, which cannot see tweet
text, so only tweets the run decided to quote were ever fetched in full. What is on disk is a
selection, not a sample — read it that way.

## What Twitter gives you that a single tweet cannot

- **Who is talking, versus who is being heard.** Follower counts and engagement sit in the profile
  and timeline files. A view repeated by three small accounts and one large one is not four
  independent signals.
- **Company accounts against individual ones.** A vendor account announcing and a named employee
  explaining are different sources on the same fact, and the gap between the two framings is often
  the finding.
- **Timeline shape.** Where a handle's timeline was pulled for vetting, the cadence is visible:
  steady, bursty, or dormant-then-loud around a launch.
- **What did not travel.** A tweet with a strong claim and no engagement is evidence the claim is not
  contested, or that nobody saw it. Say which you think it is.

## Coverage, honestly

Three limits worth stating plainly in your file, because they bias everything this source produced:

- **Survivorship.** Search finds what is indexed. Deleted tweets, protected accounts and quote-tweet
  chains are absent, and their absence is not visible.
- **Accumulation.** Engagement counts were read at fetch time, not at post time. An older tweet has
  had longer to gather them, so comparing a 2024 tweet's likes to a 2026 tweet's is comparing two
  different things.
- **No impressions.** X does not expose them, so "reach" here means likes, retweets and replies, and
  nothing else.

## The handles — `full_source_analysis/twitter-handles.json`

The thinnest handle list of the four, and the one where ranking matters most — Twitter is the only source
with a second, deeper vetting pass, and this file decides who gets it.

- **The handle form is `x/<name>`.**
- **Only tweets the run actually quoted were ever fetched in full**, so `documentCount` here counts a
  selection rather than a sample. Two handles with one document each are not comparable the way they
  would be on Reddit — lean on `topImportance`.
- **`signals` worth carrying:** follower count and timeline shape where a profile was already pulled
  for vetting. Record them as facts, not as a ranking input: a view repeated by three
  small accounts and one large one is not four independent signals, and reach is not expertise.

**Your order decides who is read deeply.** Twitter is the one source where the depth of vetting is
chosen from this file before a single dispatch goes out — the top `twitter.handlesDeepVetted` by your
ranking get their posts read, everyone else gets the profile alone. On the other sources a bad order
costs a slot; here it also costs the only evidence that could ever have produced a `legit`, because
the heuristic floor on this source never returns one on its own.

## The players — `full_source_analysis/twitter-players.json`

The thinnest player list of the four, for the same reason the handle list is thin: only tweets the
run decided to quote were ever fetched, so this is a selection rather than a sample.

- **A company account is a player and a handle at once.** `@AcmeHQ` belongs in this file as the
  entity Acme and in `<source>-handles.json` as an account. They are different rows in different
  files and neither replaces the other.
- **A vendor's own announcement is one document.** A launch tweet quoted by the run counts once for
  that company, whatever its engagement numbers — reach is not mentions.
- **`aliases` matter here** because a handle and a product name are often not the same string:
  `@perplexity_ai` and "Perplexity" are one entity.

## Known gaps — they go in `observations`

- The selection bias above, in one line, every run.
- Any handle whose timeline was capped at 100 posts — the API's ceiling — where the topic clearly
  predates that window.
