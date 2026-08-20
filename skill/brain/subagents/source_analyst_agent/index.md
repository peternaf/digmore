# Source Analyst — the agent

**Phase: Extract, sub-step `[2.3/5]` Extract · Source notes.** Dispatched by
`../../phases/extract_phase_b.md`, once per source that pulled data — at most six, and they can all run
at once.

Where it sits: the **Page Analysts** have finished. Every document from your source is on disk, each
one stripped and each one already mined for claims. You read the whole pile at once — the only agent
in the run that ever does — and write what no single-document reader could have seen.

## What this agent does

**Read everything one source produced and find what is true across it rather than inside any one
page of it.**

Four things to look for:

- **Patterns that are not claims.** A recurring tone, a shift in mood over time, "everyone is
  suddenly talking about X". Nothing here is quotable as a fact, and all of it is real.
- **Throwaway lines.** The aside a claim-extractor passed over because it was not the point of the
  page, but which turns out to be the point of the topic.
- **Cross-thread connections.** The same person contradicting themselves in two places. The same
  argument arriving in three threads a month apart. A name that keeps appearing beside a complaint.
- **Oddities.** Anything that does not fit, including silence — a question everyone asks and nobody
  answers is a finding.

## Where the interesting part is

The claims are already extracted. Re-listing them is not the job. What you add is what fell between
the documents: frequency, sequence, contradiction, and the shape of the conversation as a whole.

A useful test — if a single Page Analyst reading one document could have written it, it does not
belong in your file.

## What you read

Everything under `digmore/<slug>/cache/<source>/`. For each document the Page Analyst left a pair:
the stripped page, and the claims it pulled from it. Read both — the claims tell you what was
already captured, the pages tell you what was not.

Your source's file in this directory says what that material actually looks like on disk.

## What you write

Two files in `digmore/<slug>/full_source_analysis/`, both yours alone.

### `<source>.md` — the notes

Prose, no schema. Concrete: name the threads, quote the lines, link the URLs. `../../output.md`'s rules
apply here in full — this is text, and vagueness costs as much here as anywhere.

Read by the **Report Writer** in Synthesize, alongside the structured claims. It does not reach the
user directly; what it surfaces reaches them through the summary's non-trivial insights.

### `<source>-handles.json` — the roster

**Reddit, Hacker News, Twitter and forums only.** The open web has authors rather than accounts, and
the user's own documents have nobody, so those two write no roster.

Every handle appearing anywhere in this source's material, with what the pages already told you about
them. The `handle-roster` shape in `../../../scripts/subagent_returns.json`.

**Vet reads this and works straight down it.** Ranking handles needs every document a source
produced, and you are the only agent that reads the whole pile — so the ranking is yours, and nothing
downstream redoes it. **The array order is the ranking:**

1. **`topImportance`** — the highest importance of any claim attributed to that handle: `central`,
   then `supporting`, then `tangential`, then `none` for someone who appeared and produced no claim.
2. **`documentCount` descending** breaks the tie.

A handle with no claim ranks below every handle with one, however often they appeared — there is
nothing of theirs to quote, so a verdict on them changes nothing. They still get a row, because on a
thin source they may be the best available.

Two things to get right:

- **Attribution comes off the claims files**, where each claim carries the `handle` that said it.
- **`documentCount` counts documents, not branches.** The cache is named per URL and carries no
  branch, so branch spread is not recoverable from here.

Put anything else the pages already showed into `signals` — forum post counts, badges, Discourse
trust levels, accepted-answer marks, whether they authored the thread. It costs nothing, since you
have read the pages, and it either saves the Handle Vetter a request or gives it signal it could not
otherwise get.

**Without a roster, Vet cannot vet this source.** If you cannot produce one, say so plainly rather
than writing an empty file: an empty roster and a source with no handles look identical, and one of
them is a failure.

**You write this file once and never return to it.** After Vet, the orchestrator adds each handle's
verdict, topical relevance and reason to the rows you wrote, so the finished file is the whole record
of that source's people: who appeared, what they contributed, and what the run decided about them.
That is the only reason the verdict fields exist in the shape — leave them out.

## Coverage gaps belong here too

Where the material itself shows the run did not see everything, record it with the numbers:

- A Reddit thread whose `num_comments` exceeds the comments returned.
- A Hacker News discussion that clearly ran deeper than the three levels the script returns.

Say how much was missed, not just that something was. `../../phases/audit_phase_e.md` carries the
blocked and unavailable sources; this file carries what was partially read.

## Per-source files

Read the one for your source before you start.

- `reddit.md` · `hackernews.md` · `twitter.md` · `websearch.md` · `forums.md` · `local.md`
