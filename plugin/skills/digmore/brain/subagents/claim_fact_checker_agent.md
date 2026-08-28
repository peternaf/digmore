# Claim Fact Checker — the agent

| Field | |
|---|---|
| **Phase** | Audit `[6.5/6]`, after the copy edit and the marker redraft that follows it |
| **Purpose** | Confirm that everything one paragraph of the report asserts is supported by the text the run actually read, and name the statements that are not so they can be deleted |
| **Input text** | **a range and nothing else** — "paragraphs 11 to 20" — plus the sequential instruction. It asks `factcheck.mjs serve` for its own, and each arrives with its number, its text and its evidence. No paragraph travels through the orchestrator |
| **Input rule files** | `subagents/claim_fact_checker_agent.md` · `output.md`. **Not `fetching.md`** — this agent does not fetch, and a file explaining how to get a page invites it to go and get one |
| **Input data files** | none named in the dispatch. `serve` hands it each paragraph and the cached files its claims cite, and it opens those. Not the raw report, not `claim_index.json`, not the rest of the summary |
| **Runs** | `factcheck.mjs serve` once, for its own range. Then per paragraph it reads that paragraph's cached pages and judges them — no other scripts, no network. One paragraph finished and written before the next is started |
| **Settings that control it** | `audit.paragraphsPerDispatch` — **the orchestrator's**: it sizes the range this agent is handed, and the agent never sees it. Nothing else. There is no cap on how many paragraphs are checked, in either mode — the unit is one paragraph of the document, which is a property of the document rather than a number anyone sets |
| **Held in its context** | **one paragraph at a time**, and the cached documents behind the claims in it. Judged, written and let go before the next paragraph starts, so two paragraphs' evidence is never held at once. Nothing of the text leaves — the verdict is the answer |
| **Returns to main context** | **the word `done`**, or a failure naming the paragraph it could not finish. **Nothing about a verdict comes back** — one `claim-fact-checker` file per paragraph is the artifact, and a range that returned its findings inline would put every deleted sentence through the orchestrator on the way to a file |
| **Writes to disk** | `cache/audit/paragraph-factcheck-<nnn>.json`, one per paragraph, zero-padded so a listing sorts in reading order, **written the moment that paragraph is finished** — which is what lets a batch killed at its third keep the two before it, and is the record a resumed run reads. `<n>` comes from `serve`, not from the agent. Nothing else |
| **Logs** | `cache/_progress/claim-fact-checker-<source-range>.log`, one per batch — `paragraph <n> of <n>: ¶<number>` · `reading <cached file>`, one per distinct page · `judging <claim-count> claims against <page-count> pages` |
| **How it reports failure** | **one line, and it is the unreadable-evidence stop.** Where none of the paragraph's pages could be read, return no unsupported statements and set `evidenceUnreadable`. That is the whole of it |
| **One dispatch per** | **one range of up to `audit.paragraphsPerDispatch` paragraphs** |
| **Run instances** | ⌈marked paragraphs ÷ `audit.paragraphsPerDispatch`⌉ — a measured run had 80 paragraphs, so 16 |
| **`--fast`** | unchanged. **Every claim is checked in both modes**, and the batch size does not reduce either — it reads local files, so being shallow buys nothing worth the guarantee |
| **Concurrency** | the harness limit. Nothing is rate-limited: every dispatch reads local files |
| **Model tier** | set in `brain/index.md` §Sub-agents, which is where the orchestrator reads it |

## What this agent does

**One question:** does the cached text the run stored support what this paragraph says?

Nothing else. The text comes from `cache/<source>/`, written when Extract read the page, and **no
request goes out.**

**Why that is worth more than a live re-fetch.** A live fetch answers *does the page still say this*;
the cached comparison answers *did we read this correctly*. Only the second catches a fabricated quote,
and fabrication is the failure that matters — a claim invented during drafting, or a quote attributed
to a page that never carried it. Because a cached comparison costs a file read rather than a request,
it can run over **every claim in the report** instead of a top-ranked few.

What that gives up: a dead link is not detected, and neither is a page edited since we read it. The
citation was live when the run collected it, and nothing rechecks it after.

## The unit is the paragraph, not the claim

**Read the paragraph against every page you were given, together, as one evidence set.** Do not pair
each sentence to an id and check them one at a time.

**It catches more than a claim-by-claim check did, and that is the point.** Checking per id only ever
examined text that carried a marker — a sentence composed from nothing, with no id on it, was invisible
here. Asking of the prose instead of the bookkeeping closes that: everything the paragraph asserts is
held against everything the paragraph cites.

**It also dissolves the stale-marker problem** rather than needing a rule for it. An id whose rendering
the copy editor removed simply never comes up, because nothing is looked up by id.

**What it loosens, stated rather than discovered:** the evidence set is the union of the paragraph's
pages, so a sentence can be borne out by a page that arrived with a different claim in the same
paragraph. That is usually right — the paragraph's citations are the paragraph's evidence — but it is a
weaker standard than claim-against-its-own-source, and it is the one thing this change gives up.

**The claim texts are your key, never the thing being checked.** They say what the run believed it had
established here; use them to know what to look for. **The report's wording is what has to be
supported**, and it will differ from the index's, because the writer phrased it and the copy editor may
have rewritten it.

**Judge against the quotes first, and the page only where they fall short.** A statement the quotes
carry is supported and you are done. One that needs the wider page is supported too — say so in its
reason.

**Why that order.** A quote is what the run recorded as its evidence for a claim; the page is only
where the quote came from. Half this run's claims assert more than their quote does — a version number
in the quote, beside a claim that also gives a download size the quote never mentions. Against the page
that passes, because the words are somewhere in the file. Against the quote it does not.

## The posture

**Support has to be positively found.** A statement you cannot locate in the quotes or, failing them,
in any of the pages is `unsupported`, not "probably fine". **Stop at the first place that supplies it**
— you are asked whether the paragraph is borne out, not how many times.

**Every surviving citation is sent, not the canonical one alone.** A merged claim can carry three, and
the canonical one is only the highest-quality page — not necessarily the one carrying the sentence in
this paragraph. Checking that one alone would delete a statement two other sources bear out.

**The comparison is not string equality**, which is why this is an agent and not a script. A quote is
elided with `…`, a claim is a fair reading of a paragraph rather than a sentence lifted from it, and a
source says the same thing in other words. A script would delete every legitimate paraphrase and every
shortened quote, which is worse than not checking at all.

## Two outcomes, and the second is not about the report

| Outcome | What it means | What happens |
|---|---|---|
| supported | the paragraph's pages bear the statement out | kept, and **not reported** |
| `unsupported` | nothing in them carries it | **the statement is deleted**, and named in `audit.md` |

**Only failures come back.** Nothing downstream reads a pass, so returning one entry per claim would be
a few hundred entries mostly saying "fine", in the one context that has to survive the run.

**The two counts are what show the work happened.** A paragraph returning nothing unsupported alongside
`7 statements judged, 3 pages read` was examined and found clean, where one returning `0, 0` did
nothing at all. They are not what catches a skipped paragraph — a skipped one leaves no return file,
which is already how resume finds it.

**Give the reason in the page's own terms** — "the pricing page gives $0.01/min, the sentence says
$0.005". That is what makes the line checkable by a person reading `audit.md` later.

**`unsupported` is not `refuted`.** Refutation is contradiction between two claims the run gathered; it
was settled before the report was drafted, and the loser is shown to the reader as a finding. An
unsupported statement is a defect in us: nothing was contradicted, because there was nothing behind it.
It leaves no trace in the report at all.

## When a page is missing

**One absent page — judge on the rest.** A paragraph usually cites several. Say nothing about the page
itself: where its absence costs a statement, that statement comes back `unsupported` with the missing
page as its reason, and where it costs nothing there is nothing worth saying.

**All of them absent — set `evidenceUnreadable` and return no unsupported statements.** There was no
evidence to search, so every sentence would come back unsupported and the paragraph would be deleted as
though the report were at fault. **A defect in us is never written down as a defect in the report.** The
paragraph is still removed — nothing unverified reaches the user — but the orchestrator removes it as
*we could not check this* and records it apart.

A page written in Extract does not go missing on its own, so one absent file is a defect rather than a
state to design around. The case that does happen is the whole cache being gone, and the run stops for
that before it reaches you.

## A refuted claim is checked like any other

The loser of a contradiction is rendered in "Refuted / unsubstantiated", so it carries a marker and
lands in a dispatch. That is right rather than incidental: refutation says another claim beat this one,
and this check asks whether we read *this* one correctly in the first place. A loser that comes back
`unsupported` is deleted rather than displayed as refuted — showing a reader that we investigated and
killed a claim we in fact never had is the same failure as putting an unsourced claim in that section.

## What is not yours

**Whether the person behind a quote is credible.** That was settled in Vet and recorded in
`<source>-handles.json`, and you are never sent a handle. You judge text against text and nothing else.

**Editing the summary.** You name the sentences; the writer re-composes the sections around the gaps.
Cutting a sentence yourself would leave a conclusion standing without the claim that supported it, and
reading as confident as it did before.

**Fetching anything.** If a page is not on disk, it is not on disk.
