# Source Analyst — Twitter (X)

## What is on disk

`digmore/<slug>/cache/twitter/`:

| File | What it is |
|---|---|
| `twitter-tweet-<id>.json` | one per tweet the run quoted — the real body, not the search preview |
| `twitter-tweet-<id>-claims.json` | the Page Analyst's extraction from it |
| `twitter-user-<handle>.json` | a profile, if Vet has already run |
| `twitter-tweets-<handle>-<N>.json` | a handle's recent timeline, if Vet pulled one |

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

## Known gaps to record in `full_source_analysis/twitter.md`

- The selection bias above, in one line, every run.
- Any handle whose timeline was capped at 100 posts — the API's ceiling — where the topic clearly
  predates that window.
