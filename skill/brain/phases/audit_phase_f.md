# Audit

Eight sub-steps, each with its own progress marker — `[6.1/6]` through `[6.8/6]`
(`../reporting.md`).

**Synthesize wrote the report. This phase checks it and fixes it.** Nothing here fetches: every check
is against what the run already stored, and every repair goes back to evidence already on disk.

**Four of the eight are conditional** — the repair, the re-review and both redrafts run only when
something needs them, so `[6.1/6]` followed by `[6.4/6]` is a normal run. They get a marker when they
do run because they are the longest silence in the phase: rebuilding the raw report and rewriting the
summary, with nothing printed, reads as a run that has hung.

**Re-enter at the sub-step, not at the top.** This phase holds up to six dispatch groups and rewrites
the deliverable three times, so re-running it whole is not cheap. `run_log.log` names where it died
(`../resuming.md`).

| | Step | Who |
|---|---|---|
| `[6.1/6]` | **Review** — the draft against the request, the planned sections, the planned angles, and every claim carrying a source | the Final report reviewer |
| `[6.2/6]` | **Repair**, only where the reviewer found a closable gap | the Raw report writer, then the Final report writer |
| `[6.3/6]` | **Re-review**, only where a repair ran, and only over the items it was meant to close | the Final report reviewer |
| `[6.4/6]` | **Copy edit** — read cold, flag, then fix with the full context | the Final report copy editor |
| `[6.5/6]` | **Redraft · markers**, only where prose paragraphs came back unmarked | the Final report writer |
| `[6.6/6]` | **Fact check** — every rendered claim against the cached text it came from | the Claim Fact Checker, one dispatch per paragraph |
| `[6.7/6]` | **Redraft · claims removed**, only where the fact check found any | the Final report writer |
| `[6.8/6]` | **Record** — the Run footer, `audit.md`, and the run's own closing | you |

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

**Also send it the dropped-subject list** from the Raw report writer's receipt. Claims cut by the
verdict filter are gone from the raw report, so without it the reviewer's most confident finding is a
gap the run already found and deliberately discarded.

**Rule files: `../output.md`, and deliberately nothing else.** The command's reference file is
excluded on purpose — given the spec for what a report of this kind should contain, this agent would
check conformance to it, which is a different question and would bury the thing it exists to catch: a
report that answers a question nobody asked. `../sections.md` is out with it, for the same reason.

**Data files: the draft summary, and nothing else.** Not the raw report, which would tell it what the
run found rather than what it promised.

**No draft on disk is a stop, not a review of nothing.** An empty verdict set and a draft that answers
nothing look identical from here.

## `[6.2/6]` Repair — only where a gap can be closed

Two outcomes and no third:

| The gap | What happens |
|---|---|
| the evidence is on disk — in a per-source report, or in the raw report and unused | re-dispatch the Raw report writer with the gap list, then the Final report writer. **One pass** |
| nothing was ever gathered on it | recorded in `audit.md` under Unanswered and named in Issues. Never chased |

**Both on-disk cases go down one path, because you cannot tell them apart.** Deciding whether the
claim was in the raw report and the draft skipped it, or never reached the raw report at all, means
reading both documents, and you hold neither in detail. The Raw report writer answers it by looking,
since both are its own inputs. **It finding nothing to repair is a valid outcome, not a failed
dispatch** — it means the evidence was already in the aggregate and the fault was the draft's. The
redraft runs either way, over the sections the repair touched.

**Repaired claims keep their ids.** The Raw report writer appends to `claim_index.json`, continuing
the counter from the highest id already there rather than restarting. A repaired claim with no id is
one the writer cannot mark and the fact check never receives — the newest material in the report would
be the one part verification structurally could not reach.

**Nothing fetches during rework.** Closing a gap by searching would mean a Branch Searcher, then a
Page Analyst over what it found, then both writers again — a miniature Extract for one gap, late in the run, with
a new failure surface and a budget nothing bounds. The run says what it did not gather instead.

**One pass, then record and stop.** An unbounded validation-and-repair loop is a defect marker in its
own right, and one pass is the bound every other repair in this run carries.

## `[6.3/6]` Re-review — only where a repair ran

The same agent, once, **against the items it raised rather than the whole report**. Nothing else
verifies the repair, so a fix that missed is otherwise indistinguishable from one that worked.
Whatever is still unanswered is recorded rather than chased.

## `[6.4/6]` Copy edit

Dispatch ONE Final report copy editor. Its own file is
`../subagents/final_report_copy_editor_agent.md`. It returns the `final-report-copy-editor` shape.

**Two stages, and the order is the whole design.** It reads the summary cold and writes its flags to
`cache/_misc/copy-editor-flags.md` before opening anything else; only then does it read the raw report
and the CSVs and fix what it flagged. Detecting and fixing need opposite things — an agent with no
context is the right instrument for "I cannot follow this sentence" and the wrong one for "here is
what it should say instead".

**This pass changes which claims the report renders.** It deletes duplicate renderings as well as
rewriting what a reader could not follow, which is why everything after it keys off its output: the
editor's sentences are what the user reads, so they are the ones the fact check has to verify.

Its return records every removal by `claimId` — the only trace of a citation lost with a deleted
duplicate — and the two counts. Where flags raised and flags fixed differ, the summary still holds a
sentence nobody could follow. Check the return, then keep it for the record.

## `[6.5/6]` Redraft · markers — the backstop behind the writer's own check

**Read the finished summary in full first.** It is safe here — the tail of this phase is a redraft
dispatch, `audit.md` and the terminal output, so nothing long has to survive it — and the terminal
Answer block comes free from the same read.

**Then list every prose paragraph carrying no claim marker, and send them all back to the Final report
writer, once, before any fact-check dispatch is built.**

**An unmarked paragraph is invisible to the whole rest of the run.** The fact check never receives it,
because scope is what the markers say is there; and the reviewer passes it whenever it carries a link,
because the reviewer asks only whether a fact has a source. So nothing between them ever opens a page
to see whether that paragraph is true.

**Every unmarked prose paragraph goes back, not a suspicious subset.** Sending only those carrying a
link asks you to guess which paragraphs *should* have been marked, and it misses the worse shape — a
fabricated paragraph with no link and no marker, which reads as narration and asserts a fact.

**You detect; the writer judges.** Which paragraphs have markers is mechanical, and you already hold
the whole summary. Whether an unmarked paragraph *needed* one is a judgement about what the prose
asserts, and only the agent that wrote it can make that. Per paragraph it does one of three things:
add the marker it forgot, cut prose that has no claim behind it, or confirm the paragraph asserts
nothing and needs none. **The list is expected to be mostly innocent** — a section opener, a
transition, a caveats line — and that is fine: the cost of a wide list is one agent reading a few
short paragraphs, and the cost of a narrow one is a fabrication nobody sees.

**Prose paragraphs only.** Every row of an enumerable section is rendered from a finished CSV and
carries no marker, because a row is not a claim. Sweeping those in would fire on every row of every
`landscape` run.

**One pass**; anything still unmarked is recorded — `runlog.mjs finding paragraph-unmarked`, one call each — and left alone.

**It cannot run earlier or later.** A sweep before the copy edit would be invalidated by it — the copy
editor is what breaks a marker, rewriting paragraphs and deleting duplicates — and a sweep after the
fact check leaves the repaired paragraphs unchecked.

## `[6.6/6]` Fact check

**Every claim the summary renders is checked against the text the run stored.** No ranking, no
subset, no cap, and no fetching: the comparison is against `cache/<source>/`, written when Extract
read the page.

A live re-fetch would answer *does the page still say this*; the cached comparison answers *did we
read this correctly*. Only the second catches a fabricated quote, and fabrication is the failure that
matters. It also costs a file read rather than a request, which is what lets it run over everything
instead of a top-ranked few.

**How the dispatches are built:**

1. Take each paragraph and the ids its marker names. No splitting — which sentence renders which id is
   the agent's to work out.
2. A script joins each id to its row in `claim_index.json` for its citations.
3. **One dispatch per paragraph**, carrying that paragraph whole and, per distinct `cachedPage` its
   claims cite, the verbatim quotes drawn from that page with the claim each was drawn for. Two claims
   citing one page make one entry, not two.

**`claimId` and `status` do not cross the seam.** Nothing comes back keyed on an id, so an id in the
prompt is an accounting unit the agent cannot use; and `status` is the handle verdict, which decides
caveating and has no bearing on text against text.

**Every surviving citation, not the canonical one alone.** A merged claim can carry three, and the
canonical one is only the highest-quality page — not necessarily the one carrying the sentence in this
paragraph.

**Concurrency: the harness limit.** Every dispatch reads local files and nothing is rate-limited.

**A stale marker is skipped, not an error.** The copy editor can rewrite a paragraph and drop a
rendering without saying so, leaving an id with nothing to check. There is nothing to verify and
nothing to delete. Do not build an error path for it: an unrendered claim is out of scope by
definition, and the guarantee is about claims the reader can see.

**What comes back, and the two are different findings:**

- **Unsupported statements** — the pages were read and do not carry the sentence. Each is deleted from
  the report and named in `audit.md`. This is the run reporting its own defects.
- **Unreadable evidence** — none of that paragraph's cached pages could be read, so no statements come
  back at all. **The paragraph is still removed** — nothing unverified reaches the user — but it is
  removed as *we could not check this* and recorded apart from the statements the check found
  unsupported. A defect in us is never written down as a defect in the report.

**Append each one as it comes back, not at the end of the phase**, in the two categories that keep
them apart:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/runlog.mjs" finding statement-deleted \
  "¶<n>: \"<the sentence as the report had it>\" — <what the page actually said>" --topic <slug>

node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/runlog.mjs" finding \
  paragraph-unreadable-evidence "¶<n>: <which pages were not on disk>" --topic <slug>
```

**The reason names what the page actually said** — "the pricing page gives $0.01/min, the sentence
says $0.005" — which is what makes the line checkable. **The paragraph number is yours to stamp on**,
because you built that dispatch and the agent does not know its own position; from it a reader finds
the marker, the claims and every `cachedPage` behind them, all still in `claim_index.json`, which is
never edited after it is written.

Anything still unmarked after `[6.5/6]` goes in as `paragraph-unmarked` at that step, for the same
reason: it reached the reader unchecked, and nothing else in the run records that.

**Where most of the cache is absent**, stop rather than deleting everything it could not confirm: that
would ship an empty report that looks like a run which found nothing (`index.md` §"When the cache is
gone").

**It resumes per paragraph.** Each dispatch writes `cache/_returns/claim-fact-checker-<n>.json` as it
returns, a resumed run re-reads the same summary so the numbering is identical, and only the
paragraphs with no return file are re-dispatched.

## `[6.7/6]` Redraft · claims removed

One Final report writer dispatch over the sections holding the removed text, **naming the sentences to
leave out**. Do not cut them yourself: a `competitor` Verdict bullet keeps its conclusion after the
only claim supporting it has gone, and reads as confident as it did before. The writer re-composes the
section around the gap, which keeps one writer on the file.

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

**Getting text into a file is about which parser it crosses**, not about which tool is nicer:

- **Changing an existing file → the edit tool.** Only the changed region crosses, and no shell reads
  the content.
- **A heredoc always quotes its delimiter** — `<<'EOF'`. That quote is the whole difference between
  the footer being written and being run: an unquoted one made the shell execute the backticked
  filenames in the text, and it was one quote away from silently altering a 145 KB deliverable while
  the run reported success. The footer is full of backticked filenames and the summary is full of `$`
  and backticks, so this is the ordinary case rather than an unlucky one.
- **Never `node -e` with document text inline.** Shell, then JavaScript, both parsing prose.

**Rewriting the whole file is the expensive option, not the safe one.** The summary is 145 KB and the
harness reads a file before overwriting it, so a full rewrite pays for it twice. "Use the file tool"
is the obvious-sounding rule here and it is the wrong one.

**None of this touches the temp-file-then-rename rule**, which is unchanged: the summary is still
written as `.tmp` and renamed over the original, and the rename is a shell command either way. What
changes is that the document's text no longer passes through the shell to get there.

## `[6.8/6]` Record

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

**Then close the run:** append this run's entry to `research_plan.json.run_history`, write the closing
pair to `run_log.log`, and print the four terminal sections in `../reporting.md`.

## End of Audit

Audit is complete when the summary carries its Run footer, `audit.md` exists for this run, and every
paragraph of the summary that renders a claim has either been checked or been removed. No marker file.
