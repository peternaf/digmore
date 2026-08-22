# Source Analyst — the agent

| Field | |
|---|---|
| **Phase** | Extract `[2.3/6]`, and again in Enrichment `[4/6]` at its source-notes sub-step — see §"Enrichment mode" |
| **Purpose** | Read everything one source produced at once and catch what no single-page reader can see — the recurring tone, the argument running under several threads, the oddity — then write that source's report, its people and its entities |
| **Input text** | the source name · the output paths · the four things to look for · on the handle-bearing sources, the handles job. **In Enrichment**, the names of the new claims files and nothing else |
| **Input rule files** | `subagents/source_analyst_agent/index.md` · that agent's `<source>.md` · `output.md` |
| **Input data files** | every file under `cache/<source>/` — both halves of each pair, the stripped page and its claims. **In Enrichment**, only the new claims files the dispatch names, plus the three files you already wrote |
| **Runs** | no scripts, no network. It reads `cache/<source>/` and writes three files under `full_source_analysis/` — everything it needs is already on disk |
| **Settings that control it** | none it enforces, and none it is told. `extract.fetchesPerBranch`, `extract.maxPagesPerDocument` and `hackernews.commentDepth` shaped what is in the directory before this agent ran; it reads the result, never the number |
| **Held in its context** | every stripped page and every claims file that source produced — the largest read in the run, and the reason this is a sub-agent at all. None of it leaves |
| **Returns to main context** | `none` — no shape, and so no dispatch template. Its product is the three files it writes. The orchestrator checks them itself |
| **Writes to disk** | `full_source_analysis/<source>-raw-report.json` · `full_source_analysis/<source>-players.json` · `full_source_analysis/<source>-handles.json`, the last on the handle-bearing sources only |
| **Logs** | `cache/_progress/source-analyst-<source>.log` — `reading <n> documents from <source>` · `writing the raw report` · `writing the entities` · `writing the handles` (handle-bearing sources only) |
| **How it reports failure** | say plainly which file could not be produced, and why. **Never write an empty one** — an empty handles file and a source with nobody in it are indistinguishable on disk, and one of them is a failure |
| **One dispatch per** | one source that pulled data |
| **Run instances** | one per source that pulled data in Extract; one per source that gained expert material in Enrichment |
| **`--fast`** | the same in both modes — the reduction is in how much each one reads, not how many run |
| **Concurrency** | one per source, all of them at once. Not a scraping limit: each reads a different directory off disk and fetches nothing, so they contend with nothing |
| **Model tier** | placeholder, unused for now |

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

## What you read

Everything under `digmore/<slug>/cache/<source>/`. For each document the Page Analyst left a pair:
the stripped page, and the claims it pulled from it. Read both — the claims tell you what was
already captured, the pages tell you what was not.

Your source's file in this directory says what that material actually looks like on disk.

## What you write

Three files in `digmore/<slug>/full_source_analysis/`, all yours alone.

### `<source>-raw-report.json` — this source's whole report

Everything this source produced, in one file: its claims, and the observations that are not claims.

**Why it is yours and nobody else's.** You already read every page and every claims file this source
produced — you are the only agent that ever does, and it is bounded because it is one source. Writing
those claims out is a third view over material already in front of you: the marginal cost is the
write, not the read. The alternative was one agent opening every claims file in the run in a single
dispatch, which is the failure this split exists to remove.

**Two top-level keys, plus `source`.** The `source-raw-report` shape in
`../../../scripts/subagent_returns.json` is the definition; what follows is how to fill it.

**`claims` — one entry per surviving claim, deduplicated within this source only.** The same claim
made in three of this source's threads is one entry carrying three citations. Merging **across**
sources is not yours: the Raw report writer does that, because it is the only actor holding all six
of these files.

**A merged claim takes the highest of each.** Three records leave three `importance` readings and
three `pageQuality` tags. `importance` takes the highest, as `topImportance` already does in the
handles and entity files. `pageQuality` takes the canonical citation's — the highest — which is the
best-evidence selection the merge is already making. Both #4 and #7 deduplicate, so this could have
been got wrong in two places independently; it is one rule in both.

**Every citation carries its handle, its source URL and the `cachedPage` it was read from.**

- **`handle` and `url` are already in the claims file you are reading** — copy them across. The handle
  is there because Vet has not run when you write this in Extract mode, so you cannot filter by
  verdict; the same reason `<source>-players.json` records handles rather than judgements. The join
  happens later, **per citation**: one entry can hold three citations from three people with three
  different verdicts.
- **One `url` covers a whole document**, so the same value lands on every citation drawn from that
  file. Carry it even where that looks redundant. On reddit, hackernews and twitter the script named
  the file and the name encodes nothing about the URL, so a citation without it has no route back to
  the page on the web.
- **`cachedPage` is in no file — you work it out, and you are the only agent that can.** You are
  reading `cache/<source>/`, where the Page Analyst left every page and its `<stem>-claims.json` side
  by side, so the page is the sibling of the file you have open. **Record the page, not the claims
  file:** the claims file is always derivable from the page's stem, while the page is not derivable
  from the claims file, because its extension varies by source — `.md` on websearch and forums,
  `.json` on the three scripted ones.

  It is a path to someone else's file, not a file you write. Your three outputs are named for you and
  you choose none of them; this field points at a page that already exists —
  `cache/websearch/mux.com_pricing.md`, `cache/reddit/reddit-thread-1a2b3c.json`.

  **It is also the whole basis of verification.** Nothing in the run re-fetches to check a claim: the
  fact check reads this file and asks whether it carries the statement. A citation pointing at the
  wrong file is a claim checked against the wrong evidence.

**`observations` — a markdown string, everything the notes used to hold.** Patterns that are not
claims, throwaway lines, cross-thread connections, oddities, silences, and the coverage gaps this
source's own material revealed. `../../output.md`'s rules apply here in full — this is prose, and
vagueness costs as much here as anywhere. Be concrete: name the threads, quote the lines, link the
URLs.

**The "do not re-list the claims" rule governs `observations` alone.** It was written when the notes
were this agent's only output about content, and it does not forbid the `claims` array beside it. A
useful test for the prose half only — if a single Page Analyst reading one document could have
written it, it does not belong in `observations`.

**Why JSON and not markdown.** The verdict join, the citation filter and the scoring downstream are a
script's work, and a script parsing prose fails quietly — a citation written slightly differently
yields a dropped one, and a dropped citation looks exactly like a claim nobody made. Everything
adjacent is already JSON. The cost is that the file stops being pleasant to open by hand, and that is
the whole cost.

### `<source>-handles.json` — every handle this source produced

**Reddit, Hacker News, Twitter and forums only.** The open web has authors rather than accounts, and
the user's own documents have nobody, so those two write no handles file.

Every handle appearing anywhere in this source's material, with what the pages already told you about
them. The `source-handles` shape in `../../../scripts/subagent_returns.json`.

**Vet reads this and works straight down it.** Ranking handles needs every document a source
produced, and you are the only agent that reads the whole pile — so the ranking is yours, and nothing
downstream redoes it. **The array order is the ranking:**

1. **`topImportance`** — the highest importance of any claim attributed to that handle: `central`,
   then `supporting`, then `tangential`, then `none` for someone who appeared and produced no claim.
2. **`documentCount` descending** breaks the tie.

A handle with no claim ranks below every handle with one, however often they appeared — there is
nothing of theirs to quote, so a verdict on them changes nothing. They still get a row, because on a
thin source they may be the best available.

Three things to get right:

- **Attribution comes off the claims files**, where each claim carries the `handle` that said it.
- **`documentCount` counts documents, not branches.** The cache is named per URL and carries no
  branch, so branch spread is not recoverable from here.
- **`documents` names those files.** You know them already — you read the whole directory to build the
  count — and today the list would be thrown away with the count kept. Nowhere else can recover it: the
  cache is named per URL and says nothing about who posted in it. **The Handle Vetter needs it on
  forums**, where there is no vetting script and the cached pages are the only evidence there is;
  without the list its one option is to open every file in the directory and search for its own handle.
  Free here, unrecoverable anywhere else.

Put anything else the pages already showed into `signals` — forum post counts, badges, Discourse
trust levels, accepted-answer marks, whether they authored the thread. It costs nothing, since you
have read the pages, and it either saves the Handle Vetter a request or gives it signal it could not
otherwise get.

**Without this file, Vet cannot vet this source.** If you cannot produce it, say so plainly rather
than writing an empty one: an empty file and a source with no handles look identical, and one of
them is a failure.

**The shape carries five fields you leave empty** — `verdict`, `topicalRelevance`, `verdictReason`,
`inExperts` and `statedIdentifiers`. Vet fills them in later. In Extract mode you write this file once
and never return to it; Enrichment mode is the one exception, and it only adds rows.

### `<source>-players.json` — every entity this source named

**All six sources.** Unlike handles, there is no source without players, and the open web is usually
the richest. A player is a company, a project, a product or a service the material names — the things
the research is about, as opposed to the people talking about them.

One entry per entity:

| Field | What goes in it |
| --- | --- |
| `name` | as this source's material writes it |
| `aliases` | every other string you saw for the same entity here — `acme.com`, `Acme Video`, `ACME`. This is what the run merges the six sources on |
| `documentCount` | **how many of this source's documents named it.** One document, one count, however many times the name appears inside it |
| `claimCount` | how many claims are about it |
| `topImportance` | the highest importance of any claim about it: `central`, then `supporting`, then `tangential` |
| `relevance` | one line: how it showed up **in this source's conversation** |
| `claims` | one entry per claim about it — the claims file, which claim in it, and the **`handle`** that said it |

**`claims` carrying the handle is the point of the file.** Vet has not run when you write this, so
you cannot know whose word is worth anything yet. Recording who said what means the run can decide
later, once the verdicts exist, without re-reading every claims file to work out whose words a
company's evidence rests on. It is free for you and unrecoverable for anyone else.

**`relevance` is about the conversation, not the company.** "Named as the incumbent people are
migrating off", "raised constantly as the cheap option that breaks at scale", "mentioned once in
passing as a dependency" — what this source's material *did* with the name. What the company actually
is gets looked up live later, by an agent that visits its site. Do not write "video streaming API";
that would read identically in any topic and tells the run nothing.

**No URL.** You will usually not have one — a link is in the material only sometimes, and "everyone
moved off Acme" carries none. Finding the real domain is a later job, done live, so a guess here would
only be something to un-guess.

**Include everything named, and let the count decide.** Do not pre-filter to the entities you think
matter: the threshold is applied across all six sources at once, and a company named twice here and
three times elsewhere clears it while neither source could have known. An entity that appears once,
with one claim, still gets a row.

**Nobody reads this file directly.** Enrichment's script merges all six, joins each claim's handle to
its verdict, filters, recounts and applies the floor.

## Coverage gaps belong in `observations` too

Where the material itself shows the run did not see everything, record it with the numbers:

- A Reddit thread whose `num_comments` exceeds the comments returned.
- A Hacker News discussion that clearly ran deeper than the levels the script returns.

Say how much was missed, not just that something was. `../../phases/audit_phase_f.md` carries the
blocked and unavailable sources; you carry what was partially read.

## Enrichment mode

**One dispatch per source that gained expert material.** After Vet, the run follows each vetted expert
into what they wrote elsewhere, and the new claims land in `cache/<source>/` beside Extract's. You
append to the three files you already wrote, rather than rebuilding them.

**You are given the new claims files by name, and they are all you read.** The orchestrator dispatched
every Page Analyst in that step and holds every receipt, so it knows exactly which files are new. No
directory diffing, and no re-reading of Extract's material to find what changed.

What you append, per file:

| File | What is added |
|---|---|
| `<source>-raw-report.json` | new entries in `claims`, deduplicated against the ones already there; `observations` extended where the new material supports one |
| `<source>-players.json` | entities the expert material named, merged into existing entries by name or alias |
| `<source>-handles.json` | handles seen for the first time in the expert material |

**Three rules on the append:**

1. **Never touch a verdict.** By now Vet has written `verdict`, `topicalRelevance`, `verdictReason`,
   `inExperts` and `statedIdentifiers` into `<source>-handles.json`. Add rows; rewrite none.
2. **A new handle arrives with no verdict, and that is accepted.** Vet has finished, and nothing goes
   back for it. Those handles are `unvetted` and their claims are quoted with a caveat.
3. **Do not re-rank.** The array order was Vet's input and Vet is over. Append new rows at the end.

**Observations are the one thing this pass cannot do fully, and that is a stated cost.** Appending to
`claims` and to the two lists needs nothing but the new documents, because each entry belongs to one
document. An observation is a statement about the *set* — everyone started complaining about latency
in March, this person contradicts themselves, twelve threads ask a question nobody answers — and a
pattern spanning Extract's material and the expert material can only be seen by a pass holding both.
Handing you the whole pile again is the largest read in the run paid a second time, for those patterns
and nothing else. So **your observations here are about the expert material alone**, and a
contradiction between an expert's post and a thread Extract read is not written down by anybody.

## Per-source files

Read the one for your source before you start.

- `reddit.md` · `hackernews.md` · `twitter.md` · `websearch.md` · `forums.md` · `local.md`
