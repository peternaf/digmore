# Synthesize

Two sub-steps, each with its own progress marker — `[5.1/6] Synthesize · Raw report` and
`[5.2/6] Synthesize · Draft` (`../reporting.md`).

**Evidence becomes documents here, and nothing is checked here.** Synthesize writes the report; Audit
checks it and fixes it. That is the whole seam, and it is why this phase holds two dispatches and no
review passes: everything that examines the draft is in `audit_phase_f.md`, where a finding can still
be acted on.

Two agents, in order. The **Raw report writer** decides what survives and builds the evidence record;
the **Final report writer** turns that record into the summary. They were one agent, which read every
claims file *and* wrote the summary in a single dispatch — so a dispatch that died took the reading
with it, and nothing bounded either half. Splitting them pays the expensive read once and leaves it
on disk.

Re-read `../output.md` before any dispatch.

**Scratch you write in this phase goes inside the topic** — `digmore/<slug>/cache/_misc/<step>-<what>.md`,
named for the step that wrote it, never `/tmp`. The rule is in `index.md` §"Where a run writes", which
you read at the start of the run and are a long way from by now; `audit_phase_f.md` §"How you write"
carries it too, along with the rule about getting text into a file without a shell parsing it.

## `[5.1/6]` The raw report

### First, join the verdicts — a script

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/synthesis.mjs" join --topic <slug>
```

Each Source Analyst wrote `full_source_analysis/<source>-raw-report.json` with every claim carrying
the handles that said it; Vet then produced a verdict per handle. This is the join between them, and
the filter that follows: a `status` on every citation, `spammer` and `throwaway` citations dropped,
`unreliable` pages dropped, and any claim left with nothing behind it dropped with them. It writes
`<source>-joined.json` beside each report and leaves the reports untouched.

**A script rather than the agent**, because none of it is judgement — a join, a lookup and a filter
give the same answer every run, and an agent handed arithmetic drifts off it. What genuinely needs the
agent is everything after: the semantic merge across sources, the claim ids, the contradictions and
the writing.

Its output names every claim it deleted for carrying **no URL at all**. Those are not the verdict
filter working — cite-or-drop means such a claim cannot legitimately exist, so each one was invented
somewhere upstream. They travel on the agent's receipt and into `audit.md`, and they must never reach
the summary's "Refuted / unsubstantiated" section: refuted means a claim had a source and lost an
argument, which a reader learns from; unsourced is a defect in us.

### Then dispatch ONE Raw report writer

Per `../subagents/dispatch_structured_subagent.md`, which is also where the rule that the dispatch
**names the path to the agent's own file** lives — §"Send the agent its own files". Here that file is
`../subagents/raw_report_writer_agent.md`. It returns the `raw-report-writer` shape; name the shape
rather than pasting it, and the agent prints its own.

**Task text:** the topic, the research question, and the spec for every enumerable section this run
declared — `row_is`, fields, sort and render, from `research_plan.json.scope.sections`.

**Rule files:** `../output.md` · `../sections.md` · `../page_quality.md`, for the rank order alone,
which is what "pick the canonical citation by best evidence" means in the merge. **Not
`../vetting.md`** — the verdict rules are the script's, and an agent sent them would be a second place
they could be applied differently.

**Data files:** every `full_source_analysis/<source>-joined.json` · `players.csv`, finished. On `gtm`
runs only, also the four `<source>-handles.json`, which `promoter_network.csv` needs for its
`person_verdict` column and for the labelled identifiers its identity join rests on.

**It writes, in this order:** each declared enumerable section's CSV, then `<slug>-raw-report.md` and
`claim_index.json` together at the end. The order is the partial-progress path — **either of those two
missing means the pass did not finish** — and it is also the right order for the work: filling a table
forces a structured pass over the evidence with a specific question, which settles sequence and
completeness that a prose pass blurs.

**Check what comes back**, then read the receipt for the two things only it can carry: the claims it
deleted for having no URL, and the short list of subjects the filter dropped with reasons. Keep both.
The first goes into `audit.md`; the second travels into the reviewer's dispatch in Audit, so it does
not report a gap the run already found and deliberately discarded.

`players.csv` is not written here. Enrichment chose the rows and filled them before this phase
started, which is what makes rendering possible at all: an enumerable section is rendered from a
finished file, and the agent rendering it cannot also be the one writing it.

## `[5.2/6]` The draft

Dispatch ONE Final report writer, per the same file. Its own file is
`../subagents/final_report_writer_agent.md`. It returns the `final-report-writer` shape.

**Task text — `scope.deliverables` first, the whole section list, in order, exactly as Plan settled
it.** That list is the report's structure and this agent does not get to reopen it: a section it drops
or invents at drafting time was never planned, never confirmed with the user in manual mode, and has
no CSV behind it if it enumerates. It is also the standard the reviewer measures the finished summary
against, so a writer working from anything else guarantees a mismatch nobody intended.

Then **the format spec for each of those sections, inlined verbatim** — for a predefined section from
the command's reference file, for an invented one its render rule from `scope.sections`. A sub-agent
pointed at a file instead of given the spec defaults to the shortest plausible content.

**Rule files:** `../output.md` · `../sections.md` · `../vetting.md`, for the confidence tag.

**Data files:** the aggregate raw report, and every CSV it must render an enumerable section from —
`players.csv`, `experts.csv`, and any invented one. **Not the six per-source reports**: their
observations are already merged into the aggregate, and the whole point of the split was that this
agent reads one file instead of several hundred.

**It writes the summary to a temp file and renames it over the original** — never in place, per
`index.md` §"Where a run writes". **Every paragraph that renders a claim carries the ids it renders**,
as one comment at its end: `<!-- claims: 001, 004, 009 -->`. That marker is the only link between the
report and the evidence behind it, and three things read it — the fact check's scope, the copy
editor's removals, and the redraft that follows either.

**Check what comes back**, then keep the receipt's drop list: every claim it read in the raw report
and chose not to use, with the reason. Nothing else records those. Every other actor writes down what
it discarded — Enrichment names each excluded player, Vet keeps rejections in `<source>-handles.json`,
Extract logs dropped-for-budget URLs — and without this, drafting is the one place in the run where
evidence disappears silently.

Its `sectionsWithNoVettedVoice` goes in the run's Issues as well as in `audit.md`.

## What used to be here

Every pass that examined the draft has moved to Audit, where a finding can still be acted on: the
critic pass and the brief review are now one reviewer, the readability lint split between the copy
editor and the writer's own closing check, and the dedup pass is the copy editor's. The expert
expansion moved the other way, into Enrichment, because its claims have to exist before the candidate
count and the raw report are taken.

## End of Synthesize

Synthesize is complete when `<slug>-raw-report.md` and `claim_index.json` both exist, every declared
enumerable section has its CSV, and the summary exists with every section in `scope.deliverables`
drafted. There is no incomplete-marker comment: every pass renames a complete file over the original,
so a draft that stopped early never replaced anything and the state is unambiguous either way.

No marker file. Resume infers state from these artifacts.
