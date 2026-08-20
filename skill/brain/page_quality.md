# Page quality

**One tag per URL, describing the page rather than the person who posted it.**

Every document a run reads gets one, written onto its claims file by whoever read it. It is judged
from what the page *is* — who published it, and why — and never from who linked to it or how good the
claim on it sounds.

This is the other half of vetting. `vetting.md` judges the **person** behind a quote; this file judges
the **page** it came from, and the two are independent: a `legit` expert can post a link to a content
farm, and a marketer can cite a regulatory filing. Both get tagged, and they feed different decisions.

## What it is for

Two things, and nothing else:

- **Ranking claims for verification.** Audit checks the top `synthesize.claimsFactChecked` claims by
  `importance × page-quality`, so this tag decides which claims are worth going back to the source
  for (`phases/audit_phase_e.md` §1).
- **The confidence label** on each finding in the summary — see `vetting.md` §"Confidence tag rule".

It is **not** a filter on its own, with one exception: `unreliable` claims are dropped in Synthesize
§1. Everything else survives and carries its tag.

## The values

| Tag | What the page is | Score |
|---|---|---|
| `primary-3p` | Independent primary source: analyst report, regulatory filing, third-party benchmark, academic paper, government data | 5 |
| `primary-self` | The subject speaking for itself: vendor docs, pricing pages, changelogs, first-party benchmarks, a company or founder account announcing something | 4 |
| `secondary` | An established outlet or a well-known engineering blog — TechCrunch, the Stripe blog, Smashing Magazine | 3 |
| `blog` | An individual's blog: Medium, Substack, a personal site | 2 |
| `forum` | Community discussion: Reddit, Hacker News, Discord, specialty forums | 1 |
| `unreliable` | Content farm, obviously generated filler, marketing collateral, dead link, paywalled with no cached text | 0 |
| `internal` | A document or text the user handed over | 4, and outside the ranking — see below |

Rank order: `primary-3p` > `primary-self` > `secondary` > `blog` > `forum` > `unreliable`.

The scores are what `importance × page-quality` multiplies. They exist here rather than in the audit
phase so that the word and the number cannot drift apart.

## Two that need care

**`primary-self` is high and biased at the same time.** A vendor's own pricing page is the most
accurate source in the world for that vendor's prices, and worthless on whether the product is any
good. Never take a marketing claim at face value because the tag is near the top of the table.

**`internal` sits outside the ranking on purpose.** It is first-hand and usually the most accurate
account of the user's own business that exists anywhere, and at the same time unverifiable by anyone
else — possibly an early draft, a stale number, or one colleague's opinion written down. It scores 4
only so a claim from the user's own files can be ranked into the checked set rather than dropping out
of the audit entirely. Three rules travel with it, in
`subagents/page_analyst_agent/local.md`: an internal claim is never external corroboration, it never
satisfies multi-source corroboration on its own, and where it disagrees with a public source both are
surfaced.

## Choosing one

The venue decides it, not the content. A brilliant, well-evidenced comment on Hacker News is still
`forum`; a thin press release on a vendor's own site is still `primary-self`. Where someone's standing
matters — the author of the thing being discussed answering for it in a thread — note who they are on
the claim rather than promoting the tag.

Your source's file in `subagents/page_analyst_agent/` says how its material maps onto this table:
`websearch.md` carries a page-shape-to-tag table, and the scripted sources each name their default and
their one exception.
