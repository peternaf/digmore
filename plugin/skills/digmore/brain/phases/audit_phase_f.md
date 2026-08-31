# Audit

Seven sub-steps, each with its own progress marker — `[6.1/6]` through `[6.7/6]`
(`../reporting.md`).

**Synthesize wrote the report. This phase checks it and fixes it.** Nothing here fetches: every check
is against what the run already stored, and every repair goes back to evidence already on disk.

**Three of the seven are conditional** — the repair and both redrafts run only when something needs
them, so `[6.1/6]` followed by `[6.3/6]` is a normal run. They get a marker when they
do run because they are the longest silence in the phase: rebuilding the section rows and rewriting the
summary, with nothing printed, reads as a run that has hung.

**Re-enter at the sub-step, not at the top.** This phase holds up to five dispatch groups and rewrites
the deliverable three times, so re-running it whole is not cheap. `run_log.log` names where it died
(`../resuming.md`).

| | Step | Who |
|---|---|---|
| `[6.1/6]` | **Review** — the draft against the request, the planned sections, the planned angles, and every claim carrying a source | the Final report reviewer |
| `[6.2/6]` | **Repair**, only where the reviewer found a closable gap | the Source aggregator, then the Final report writer |
| `[6.3/6]` | **Copy edit** — read cold, flag, then fix with the full context | the Final report copy editor |
| `[6.4/6]` | **Redraft · markers**, only where prose paragraphs came back unmarked | the Final report writer |
| `[6.5/6]` | **Fact check** — every rendered claim against the cached text it came from | the Claim Fact Checker, one dispatch per range of paragraphs |
| `[6.6/6]` | **Redraft · claims removed**, only where the fact check found any | the Final report writer |
| `[6.7/6]` | **Record** — the Run footer, `audit.md`, and the run's own closing | you |

## `[6.1/6]` Review

Dispatch ONE Final report reviewer, per `../subagents/dispatch_structured_subagent.md` — which is
also where the rule that every dispatch in this phase **names the path to the agent's own file**
lives, §"Send the agent its own files". Here that file is
`../subagents/final_report_reviewer_agent.md`. It returns the `final-report-reviewer` shape; name the
shape rather than pasting it, and the agent prints its own.

**Task text — three lists, and one question asked of every item on them:**

1. **What the user asked for** — `research_plan.json.originating_prompt`, verbatim.
2. **What the summary was meant to contain** — `scope.deliverables`, every section, in order.
3. **What the run set out to answer** — `scope.angles`, each angle's `label` and `rationale`.

The question: is it here, and is it usable as asked — quoting the part of the draft that serves it.
An angle is a question the run committed to, so one the summary reflects nowhere is a gap as real as a
missing section, and no other pass is positioned to notice: everything upstream works one branch at a
time and never looks at the set.

**Then a fourth pass over the draft itself:** read it for facts the report cannot back, and return
each as a gap. Judged per paragraph, never per sentence — `../output.md` puts the citation at the end
of the sentence **or** the paragraph, so a correctly cited three-sentence paragraph read sentence by
sentence comes back with two false flags every time.

**Also send it the dropped-subject list** from the Source aggregator's receipt. Claims cut by the
verdict filter are gone from the index, so without it the reviewer's most confident finding is a
gap the run already found and deliberately discarded.

**Rule files: `../output.md`, and deliberately nothing else.** The command's reference file is
excluded on purpose — given the spec for what a report of this kind should contain, this agent would
check conformance to it, which is a different question and would bury the thing it exists to catch: a
report that answers a question nobody asked. `../sections.md` is out with it, for the same reason.

**Data files: the draft summary, and nothing else.** Not the claim set, which would tell it what the
run found rather than what it promised.

**No draft on disk is a stop, not a review of nothing.** An empty verdict set and a draft that answers
nothing look identical from here.

## `[6.2/6]` Repair — three outcomes, decided by a lookup

There is one document between the aggregator and the writer now, so which of them owns a gap is
answerable rather than guessed at.

| The gap | What happens |
|---|---|
| **a claim in `claim_index.json`** the draft skipped | re-dispatch the **Final report writer** over the sections it touches. The aggregator is not dispatched |
| **a claim not in `claim_index.json`** | **dropped.** One `runlog.mjs finding claim-unused` line naming the gap and the terms searched. **Nothing in the report** — not Issues, not Unanswered |
| **a missing or wrong row** in an invented section CSV or `promoter_network.csv` | re-dispatch the **Source aggregator**, CSV work only. **One pass** |

**The aggregator is never re-dispatched for a claim.** It used to be, because nobody could tell
whether the claim had reached the aggregate or the draft had skipped it — and by the step's own
account the second was the common case, so most repairs paid for a full re-read of every source to
discover nothing needed doing.

**The test is a search, not a membership check — and say so.** The reviewer describes a gap in prose;
the Final report writer turns that into `read_claims_for_report --match` terms and runs it **once**.
So *"not in `claim_index.json`"* means *"one search, with the terms the writer chose, found nothing"*.

That fails differently from the other search in this phase, and the worse case has the quieter trace:

| | a miss means | trace |
|---|---|---|
| `[6.4/6]` | a legitimate paragraph is cut | `paragraph-unmarked` records it |
| `[6.2/6]` | **a gap the reviewer actually found is erased** | one `audit.md` line, and nothing in the report |

That is the accepted trade. What makes it survivable is that the `audit.md` line **names the terms
that were searched**, so the drop can be reconstructed rather than merely counted.

**The repair introduces no claim.** It rebuilds rows from claims already indexed, so nothing re-runs
`synthesis.mjs index` — there is no `--append` and the index is never added to after it is written.

**Three things the repair settles, which used to be left to the agent:**

- **Contradictions are not re-settled.** §3's judgement stands; a repair rebuilds rows, it does not
  reopen which of two claims won.
- **An enumerable CSV is rewritten whole**, from the claims the `--match` returned plus the rows
  already in it. The aggregator is that file's only writer, so there is no one else's row to lose.
- **Only the gap is re-read.** Steps 1 to 3 do not re-run; the merge is done and indexed.

**Nothing fetches during rework.** Closing a gap by searching would mean a Branch Searcher, then a
Page Analyst over what it found, then both writers again — a miniature Extract for one gap, late in the run, with
a new failure surface and a budget nothing bounds. The run says what it did not gather instead.

**One pass, then record and stop.** An unbounded validation-and-repair loop is a defect marker in its
own right, and one pass is the bound every other repair in this run carries.

**`[6.2/6]` and `[6.4/6]` are not merged, and the copy edit between them is why.** `[6.4/6]` runs
`factcheck.mjs prepare` on the **copy-edited** summary, because the copy editor rewrites prose and can
lose a marker while doing it. Merging the two would mean moving the repair after the copy edit — and
then the writer's additions would be the only un-copy-edited prose in the report.

## `[6.3/6]` Copy edit

Dispatch ONE Final report copy editor. Its own file is
`../subagents/final_report_copy_editor_agent.md`. It returns the `final-report-copy-editor` shape.

**Two stages, and the order is the whole design.** It reads the summary cold and writes its flags to
`cache/_misc/copy-editor-flags.md` before opening anything else; only then does it read the claim listing
and the CSVs and fix what it flagged. Detecting and fixing need opposite things — an agent with no
context is the right instrument for "I cannot follow this sentence" and the wrong one for "here is
what it should say instead".

**This pass changes which claims the report renders.** It deletes duplicate renderings as well as
rewriting what a reader could not follow, which is why everything after it keys off its output: the
editor's sentences are what the user reads, so they are the ones the fact check has to verify.

Its return records every removal by `claimId` — the only trace of a citation lost with a deleted
duplicate — and the two counts. Where flags raised and flags fixed differ, the summary still holds a
sentence nobody could follow. Keep the return for the record; the agent checked it before handing it back.

## `[6.4/6]` Redraft · markers — the backstop behind the writer's own check

**A script splits the summary. You never read it here:**

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/factcheck.mjs" prepare --topic <slug>
```

Back come three numbers and two paths: `paragraphs`, the marked ones, frozen and numbered into
`cache/audit/worklist.json` · `unmarked`, the prose carrying no marker, written to
`cache/audit/unmarked.md` with the section each sits under · `staleIds`, markers naming a claim the
index does not have.

**Then send the writer the unmarked file, by path, once.** Its own file says what to do with each
paragraph. **Name the path; do not paste the paragraphs** — that is the whole reason a script wrote
them out.

**It matches on the paragraphs' own distinctive words.** There is no gap description to search with
here, but the writer composed those paragraphs from claims, so their wording overlaps: one
`read_claims_for_report --match` call for the whole batch, with terms drawn from every paragraph in
it. One call, as everywhere else — so the terms have to be generous.

**Most of the list needs no search at all.** It is expected to be mostly innocent, and "this asserts
nothing" is judged from the prose alone. What changes is that *"no claim behind it"* is now a
judgement about what the search returned, which is the same trade `[6.2/6]` makes and fails the same
safe way: a good paragraph is cut, nothing false ships, and `paragraph-unmarked` records it.

**An unmarked paragraph is invisible to the whole rest of the run.** The fact check never receives it,
because scope is what the markers say is there; and the reviewer passes it whenever it carries a link,
because the reviewer asks only whether a fact has a source. So nothing between them ever opens a page
to see whether that paragraph is true.

**Every unmarked prose paragraph goes back, not a suspicious subset.** Sending only those carrying a
link asks you to guess which paragraphs *should* have been marked, and it misses the worse shape — a
fabricated paragraph with no link and no marker, which reads as narration and asserts a fact.

**The script detects; the writer judges.** Which paragraphs have markers is mechanical. Whether an
unmarked one *needed* a marker is a judgement about what the prose asserts, and only the agent that
wrote it can make that. Per paragraph it does one of three things: add the marker it forgot, cut prose
that has no claim behind it, or confirm the paragraph asserts nothing and needs none. **The list is
expected to be mostly innocent** — a section opener, a transition, a caveats line — and that is fine:
the cost of a wide list is one agent reading a few short paragraphs, and the cost of a narrow one is a
fabrication nobody sees.

**Prose paragraphs only, and the script applies that.** Headings, table rows and a bullet list with no
marker anywhere in it are rendered from finished CSVs, and a row is not a claim. Sweeping those in
would fire on every row of every `landscape` run.

**Then run `prepare` again.** The writer has just changed the summary, so the first work list is
stale — the numbering it froze no longer matches the document. The second run's list is the one the
fact check works from, and its `paragraphs` count is what you split into ranges.

**One pass**; anything still unmarked after it is recorded — `runlog.mjs finding paragraph-unmarked`,
one call each — and left alone.

**It cannot run earlier or later.** A sweep before the copy edit would be invalidated by it — the copy
editor is what breaks a marker, rewriting paragraphs and deleting duplicates — and a sweep after the
fact check leaves the repaired paragraphs unchecked.

## `[6.5/6]` Fact check

**Every claim the summary renders is checked against the text the run stored.** No ranking, no
subset, no cap, and no fetching: the comparison is against `cache/<source>/`, written when Extract
read the page.

A live re-fetch would answer *does the page still say this*; the cached comparison answers *did we
read this correctly*. Only the second catches a fabricated quote, and fabrication is the failure that
matters. It also costs a file read rather than a request, which is what lets it run over everything
instead of a top-ranked few.

**How the dispatches are built:** you split the count `prepare` returned into ranges of
`audit.paragraphsPerDispatch` — `preflight.mjs` prints the number this run uses — and dispatch one
Claim Fact Checker per range. **"Paragraphs 11 to 20", and nothing else.** The agent asks
`factcheck.mjs serve` for its own, and each arrives with its number, its text and, per distinct
`cachedPage` its claims cite, the verbatim quotes drawn from that page with the claim each was drawn
for. Two claims citing one page make one entry, not two.

**You hold a count and a range, and never a paragraph.** Composing eighty prompts out of a 116 KB
document you were carrying is what this replaces — and the paragraph's number, which used to be yours
to stamp because the agent could not know its own position, now travels from the work list.

**`claimId` and `status` do not cross the seam.** Nothing comes back keyed on an id, so an id in the
prompt is an accounting unit the agent cannot use; and `status` is the handle verdict, which decides
caveating and has no bearing on text against text.

**Every surviving citation, not the canonical one alone.** A merged claim can carry three, and the
canonical one is only the highest-quality page — not necessarily the one carrying the sentence in this
paragraph.

**The range is worked sequentially, and the dispatch has to say so.** A batch would otherwise invite
the fan-out `index.md` §"What a sub-agent is" forbids. Put this in verbatim:

```
Check these one at a time, in the order given. Finish each paragraph completely — read its
pages, reach your verdict, write its file — before you start the next one. Do not dispatch
sub-agents. Do not parallelise. You receive no completion notification for anything you
start, so whatever you start you wait on forever.
```

**Concurrency: the harness limit.** Every dispatch reads local files and nothing is rate-limited.

**A stale marker is skipped, not an error.** The copy editor can rewrite a paragraph and drop a
rendering without saying so, leaving an id with nothing to check — `prepare` counts those as
`staleIds` and leaves them out. There is nothing to verify and nothing to delete, and an unrendered
claim is out of scope by definition: the guarantee is about claims the reader can see.


**What comes back, and the two are different findings:**

- **Unsupported statements** — the pages were read and do not carry the sentence. Each is deleted from
  the report and named in `audit.md`. This is the run reporting its own defects.
- **Unreadable evidence** — none of that paragraph's cached pages could be read, so no statements come
  back at all. **The paragraph is still removed** — nothing unverified reaches the user — but it is
  removed as *we could not check this* and recorded apart from the statements the check found
  unsupported. A defect in us is never written down as a defect in the report.

**Append them per batch as each dispatch returns**, in the two categories that keep them apart —
**one call per category, every statement an argument**, not one call per statement. A measured run
deleted 28, and a call each is 28 process starts for lines identical either way:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/runlog.mjs" finding statement-deleted \
  "¶<n>: \"<the sentence as the report had it>\" — <what the page actually said>" \
  "¶<n>: \"<the next one>\" — <what that page said>" --topic <slug>

node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/runlog.mjs" finding \
  paragraph-unreadable-evidence "¶<n>: <which pages were not on disk>" --topic <slug>
```

**The reason names what the page actually said** — "the pricing page gives $0.01/min, the sentence
says $0.005" — which is what makes the line checkable. **The paragraph number comes back on the
return**, which `serve` gave the agent; from it a reader finds
the marker, the claims and every `cachedPage` behind them, all still in `claim_index.json`, which is
never edited after it is written.

Anything still unmarked after `[6.4/6]` goes in as `paragraph-unmarked` at that step, for the same
reason: it reached the reader unchecked, and nothing else in the run records that.

**Where most of the cache is absent**, stop rather than deleting everything it could not confirm: that
would ship an empty report that looks like a run which found nothing (`index.md` §"When the cache is
gone").

**It resumes per paragraph, not per dispatch.** Each agent writes
`cache/audit/paragraph-factcheck-<nnn>.json` the moment that paragraph is finished, so a batch killed at its third keeps the two before it. A resumed run
re-runs `prepare` on the same summary and gets the same numbering, then dispatches ranges covering
only the numbers with no file.

## `[6.6/6]` Redraft · claims removed

One Final report writer dispatch over the sections holding the removed text. Do not cut the sentences
yourself: a `competitor` Verdict bullet keeps its conclusion after the only claim supporting it has
gone, and reads as confident as it did before. The writer re-composes the section around the gap,
which keeps one writer on the file.

**The dispatch carries the path to `cache/audit/`, and the sections. Not the sentences.** The writer
lists that directory itself: every `paragraph-factcheck-*.json` with a non-empty `unsupported` array
is one it has to act on, and `worklist.json` beside them turns each file's number into the paragraph
and section it judged — a verdict file carries neither. **Do not name the file numbers**; it does not
need them, and working them out would mean opening the files you are trying not to read. This is
`factcheck.mjs serve`'s own shape — the agent fetches its own work — and the writer is being
dispatched either way.

**You read those files for the section names alone**, through `worklist.json`, so you know which
sections this dispatch covers. **Never the `unsupported` text.** The Claim Fact Checker already returns the
word `done` for exactly this reason, *"a range that returned its findings inline would put every
deleted sentence through the orchestrator on the way to a file"* — and reading them back here to
compose the prompt would put them through anyway, at the end of the run, when your context is
fullest. A measured run had 28 of them.

**This redraft is never copy edited, and that is accepted.** The copy editor runs before the fact check
by necessity, because the fact check needs a claim set that has stopped changing. So these sections are
the least edited prose in the report. It goes in as `runlog.mjs finding section-not-copy-edited` and **not** in Issues — telling the user a
passage was not copy edited invites them to distrust text that is probably fine.

## How you write, in this phase

**Two rules, and they are here rather than only in `index.md` because that file was read thirty-odd
hours ago.** Both come from one step of one real run — this one.

**Scratch goes inside the topic.** `digmore/<slug>/cache/_misc/<step>-<what>.md`, named for the step
that wrote it. Never `/tmp`: a run did exactly that here, and Windows is the only reason anybody
noticed — Node resolved it to `C:\tmp`, the read failed, and the file was moved back inside. On macOS
it would have written there silently, and run material would have sat outside the topic subtree with
nothing reporting it.

**Getting text into a file** is `index.md` §"Getting text into a file" — the edit tool, never a
heredoc, never `node -e`. It is stated there because you write files from Plan onwards, and it was
here alone while the first failure it describes happened in Plan.

**Why it bites hardest in this phase.** The summary is 145 KB, so a whole-file rewrite pays for
itself twice over — change the region. And the footer is full of backticked filenames while the
summary is full of `$` and backticks, so an unquoted heredoc here does not merely fail: one made the
shell execute the filenames in the text, one quote away from silently altering the deliverable while
the run reported success.

**None of this touches the temp-file-then-rename rule**, which is unchanged: the summary is still
written as `.tmp` and renamed over the original, and the rename is a shell command either way. What
changes is that the document's text no longer passes through the shell to get there.

## `[6.7/6]` Record

**First, record what the report did not use.**

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/factcheck.mjs" unused_claims --topic <slug>
```

It reads the finished summary's markers against `claim_index.json` and names every claim no paragraph
renders. Put the count and the ids in with `runlog.mjs finding claim-unused`.

**Why a script and not the writer's own list.** Every other actor records its discards — Enrichment
names each excluded player, Vet keeps rejections in `<source>-handles.json`, Extract logs
dropped-for-budget URLs — and the writer used to hand back its own. It read curated prose then; it
reads the whole claim set now, so the list is computed from files that outlive the run rather than
recalled from a context that does not.

**Read the finished summary in full, here and nowhere earlier.** Two things need it and both are in
this step: the terminal Answer block, and the follow-up ideas drawn from the summary's complaints and
adjacent-spaces sections. It used to be read at `[6.4/6]` to list the unmarked paragraphs; `factcheck.mjs
prepare` does that now, so the document enters your context after the fact check rather than being
carried through it.

**Append the Run footer to the summary**, per `../reporting.md`. It is yours, written last, after every
agent has finished with the file — and it is **not** a deliverable: everything in it is your own
bookkeeping, so listed in `scope.deliverables` it would be a section the writer is told to produce and
cannot fill, and one the reviewer reports missing on every run. Temp file, renamed over the original,
like every other write to that file — and appended with the edit tool, per the two rules above.

**Then append Unanswered, and nothing else.** `audit.md` is already complete: every other finding was
written to it by `runlog.mjs finding` at the moment the run made it, and `runlog.mjs header`
truncated last run's file before Plan started.

- **Unanswered** — what the request, the planned sections or the planned angles asked for that the
  report does not deliver. One line each: what was asked, what is there instead, and why it was not
  closed. Empty is the expected state; an entry here is the run telling the user it fell short of its
  own brief.

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/runlog.mjs" finding unanswered \
  "<what was asked> — <what is there instead>, <why it was not closed>" --topic <slug>
```

**It is the only thing that cannot be written before the end**, which is why it is the only thing
left here. Everything else is known at the moment it happens — a blocked page in Extract, a handle
count in Vet, an excluded player in Enrichment, a deleted statement in the fact check — and each was
appended there. This step used to compose fifteen headed sections in one go from six phases of notes
held in your head, and a run killed during it lost every one of them.

**What "verified" means is not in this file.** It is the same in every run, it follows from the design
rather than from anything this run did, and it is stated once in the README. A disclaimer repeated
every run costs the reader confidence to describe a failure they cannot act on.

**Then close the run:** fill in `phases_completed` on this run's `run_history` entry — **the entry
itself was appended in Plan**, and a second one here would put this run in the history twice and make
a resume read the wrong configurations (`plan_phase_a.md` §`run_history`). Then check the file, as
its writer:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/validate.mjs" research-plan \
  digmore/<slug>/research_plan.json
```

Then write the closing pair to `run_log.log`, and print the four terminal sections in
`../reporting.md`.

## End of Audit

Audit is complete when the summary carries its Run footer, `audit.md` exists for this run, and every
paragraph of the summary that renders a claim has either been checked or been removed. No marker file.
