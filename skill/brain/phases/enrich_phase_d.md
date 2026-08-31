# Enrichment

Five sub-steps, each with its own progress marker — `[4.1/6]` through `[4.5/6]` (`../reporting.md`).

Extract collected the material. Vet judged the people behind it. This phase works out **who the
research is about** — which companies, projects and products the run will report on — and gathers
everything it will say about each one. Before that it follows the people Vet cleared, because what
they wrote changes the answer.

It sits here and nowhere else. It cannot run inside Extract: deciding which voices to listen to needs
the verdicts, and those do not exist until Vet finishes. It cannot run inside Synthesize: every
enumerable section is rendered from a finished file, so the phase that writes those files cannot be
the phase that renders them.

Nothing before this phase ever decided who the run's subjects were. That is what this phase adds.

**If `cache/` is gone, stop here.** Everything below reads it. A cleared cache leaves the topic root
intact, so a run that works against an empty directory looks complete having found nothing — say so
and offer to start the research over (`../resuming.md` §"When the cache is gone").

## The expert step — `[4.1/6]` to `[4.3/6]`

A search finds pages that match the query. This finds whatever a person worth listening to has
written, whether or not it matches anything the run thought to ask.

**It runs first, and that is a real dependency rather than tidiness.** It changes the claim set, and
both the candidate count below and the merge in the phase after count what it added. Run it
later and its claims land after the count and after the report, in a directory nothing reads again —
they would reach no report at all.

### Who gets followed — a script decides this, not you

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/expert_selection.mjs" select \
  --topic <slug> [--fast]
```

Back comes the handles the run follows, each with its source, its branch label and the path to its
vetting cache. **That list is the whole of what you keep** — you never open a roster here.

The rule it applies: `legit` **and** on-topic only, in each source's `<source>-handles.json` order —
that order is what each handle contributed, and it was settled a phase ago — round-robining across
the sources so one busy source cannot spend the whole budget, stopping at `enrich.expertsFollowed`.

**A script rather than you, for two reasons.** Four rosters read to choose ten handles is ~190 rows
of `pageSignals`, `documents` and `vettingSignals` read and thrown away, in the one context that has
to survive the run. And a model round-robining four lists by hand returns a different ten on a
re-run, which would make *which experts the run follows* unreproducible.

### `[4.1/6]` Expert search — one Branch Searcher per expert

**An expert is a branch**, and its source is implied by the handle rather than paired with it:
`u/foo` is Reddit's by construction. One dispatch per expert, in the Branch Searcher's Enrichment
mode (`../subagents/branch_searcher_agent/index.md`).

There is no query. The material is already on disk — vetting fetched it to judge the person — so the
agent reads that handle's vetting cache, ranks what it finds against the research question rather
than against an angle, and returns a URL list. It opens nothing and writes nothing.

What each source has to offer differs, and the agent's own file says so: Reddit and Hacker News
cached comments in full, Twitter has posts only for handles that got the deep pass, forums cached
nothing at all, and websearch and local have no handles and so no experts.

### Dedupe before dispatching a single reader — the same script

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/expert_selection.mjs" dedupe \
  --topic <slug> [--fast]
```

It reads each expert's URL list from `cache/_returns/branch-searcher-expert-<handle>.json` — the
searchers returned `done` and wrote them there, so **no URL list enters your context either** — and
hands back the pages worth a reader, with counts for what it dropped.

Two overlaps, and only one of them is a choice:

| Case | What happens |
|---|---|
| the same URL in two experts' lists | keep one copy, dispatch one reader, charge the fetch to whichever expert came first in `select`'s order |
| **a URL Extract already read** | **dropped entirely** — no reader, no budget charged. The page and its claims are on disk and already in that source's report |

**The tie is broken by round-robin order, never by relevance.** In Extract every score inside a
branch comes from one searcher, so "highest wins" compares like with like. Here each expert has its
own searcher scoring independently against the research question, so 0.8 from one and 0.7 from
another is a coin flip wearing a ranking.

Its `alreadyRead` and `duplicates` counts go in as one `runlog.mjs finding url-duplicate`. `listsMissing` names any expert whose
searcher wrote no file — a dispatch that failed, not an expert with nothing to say.

### `[4.2/6]` Expert read — one Page Analyst per batch of surviving pages

In the Page Analyst's Enrichment mode (`../subagents/page_analyst_agent/index.md`). The dispatch
carries the research question and the path to that expert's vetting cache, and **only claims that
bear on the research question are kept** — Extract's pages are on-topic by construction because a
query built on an angle returned them, and an expert's page is not, so without the filter the run
stores a database expert's posts about their marathon training.

**Batched exactly as Extract's readers are** (`extract_phase_b.md` §"How a batch is formed"): up to
`extract.urlsPerDispatch` pages per dispatch, worked through one at a time, returning one receipt per
page. **An expert is the branch here**, so a batch is one expert's pages and never two experts'.

`enrich.urlsPerExpert` bounds what is read per expert; it is that branch's whole fetch budget. Count
it off the `pagesRead` on every receipt and send an expert its next batch only while the budget
holds — the same wave, for the same reason, as Extract counts `extract.fetchesPerBranch`.

### `[4.3/6]` Source append — one Source Analyst per source that gained material

In the Source Analyst's Enrichment mode (`../subagents/source_analyst_agent/index.md`). It appends to
the three files it already wrote rather than rebuilding them.

**Name the new claims files.** You dispatched every Page Analyst above and hold every receipt, so you
know exactly which are new. No directory diffing, and no re-reading of Extract's material to find
what changed.

**Handles first seen in expert material arrive with no verdict, and that is accepted.** They are
appended and quoted as unvetted. Vet has finished and is not re-opened.

**This must finish before the candidate filter below.** The document floor is counted across the
appended files, so a company named only in expert material can reach it. Run the append after the
count and it cannot.

## `[4.4/6]` Filter the candidates — the script decides this, not you

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/players.mjs" candidates --topic <slug> [--fast]
```

Each Source Analyst wrote `full_source_analysis/<source>-players.json`: every entity that source's
material named, how many of its documents named it, and one entry per claim with the handle that said
it. Six files, and none of them has been read by anybody yet.

The script reads every one, joins every claim's handle to its verdict in `<source>-handles.json`, drops
what the run does not listen to, merges them into one, recounts, and applies the floor. It
writes `digmore/<topic-slug>/player_candidates.json` and prints a summary.

**A player is a candidate at `enrich.minPlayerDocuments` or more documents across all sources**,
counted after the claim filter. `preflight.mjs` prints the value this run applies, and it is lower in
`--fast` because a fast run gathers far less material for an entity to be named in. One document that
names a player counts once, however many times the name appears inside it — a single long thread
repeating a name forty times is one document, not forty mentions.

Which claims count toward that number:

| Handle verdict | Claims reach the report | Count toward the five |
| --- | --- | --- |
| `legit` | yes | yes |
| `unknown` | yes, caveated | yes |
| `unvetted` — no verdict exists | yes, caveated | yes |
| `promoter` | yes, labelled as a promotional signal | **no** |
| `spammer`, `throwaway` | no | no |
| no handle at all — the open web, the user's own documents | yes, filtered on page quality | yes |

Three of those rows are worth understanding rather than just obeying:

- **`unvetted` means nobody looked, not that somebody rejected them.** A handle is unvetted for either
  of two reasons: it fell below `vet.handleCapPerSource`, or it was first seen in expert material
  after Vet had finished. Treating either as a rejection would throw away nearly everything, and on
  Twitter — where the heuristic floor never returns `legit` — no player could ever be counted from
  that source.
- **A `promoter`'s claims are kept and not counted.** A founder posting about their own product
  across six threads is how a promoter manufactures a player. The quotes still reach the report,
  labelled; they cannot create a row on their own.
- **Claims with no handle count.** A page has an author rather than an account, so most of what is
  said about a company — vendor pages, comparisons, reviews — carries no handle. `unreliable` pages
  are dropped and the rest count, which is the same rule the verdict join applies to every other
  claim.

The candidates come back ordered: highest claim importance first, then document count. That order is
the only ranking `players.csv` has ever had, and the selection below reads it.

**`possibleDuplicates` is for you to settle.** The script merges entities only where a name or alias
matches exactly, because guessing folds a one-word product name into any longer name that contains
it as readily as it joins `Acme` to `ACME Video`. Where two entries look like one player under two
names it says so instead — with both document counts, their combined total, and whether merging them
would clear the floor. That last flag is the one that matters: two halves of one company can each sit
below five while together they clear it, and without the flag the run loses a player without ever
knowing. Decide each pair now, and record what you decided.

## Carryover from a parent topic — before any row is written

Only when `research_plan.json.parent_slug` is set. Both rules are yours: they are about the parent
topic's CSVs, which are small and which you do hold.

**Carryover revalidation.** Every player or expert pulled from the parent must re-pass the new topic's
inclusion test — see the command's "Who counts as a player". Players that fail revalidation do not
stay as rows: they move into whichever section actually fits them, which the command's reference file
names.

**Player numeric carryover.** A player that survives revalidation and enters the child keeps the
parent's `monthly_visits`, `funding_stage` and `funding_raised_usd` — copy them across, no re-fetch.
If any is missing on the parent row, the parent was incomplete: fix the parent first, then re-copy.
`UNAVAILABLE` in the child because the parent did not have it is not acceptable.

This runs here rather than in Synthesize because it decides what the rows are, and by Synthesize they
are already written.

## Decide which players this run needs — yours

The script produced candidates. **Which of them become rows is your decision, taken once, per run.**

You hold what that needs and no sub-agent does: `research_plan.json.scope.deliverables` — every
section this summary will have — the command's reference file, and the ordered candidate list.

**First, whether the run needs players at all.** Read the deliverables. If no declared section is
about companies, this phase stops here: no rows, no profiling, and say so in the run's Issues.
`gtm` writes no `players.csv` unless the topic is chained from a landscape parent, and `ask` has an
explicit "no players in scope" path — both are ordinary outcomes, not failures.

**Then which candidates become rows.** The commands differ and their reference files say how. Read the
command's "Who counts as a player" test and apply it to the ordered list.

Three bounds on that judgement:

1. **You may cut from the candidate list. You may never add below the floor.** A company that did
   not reach the floor did not earn a row, whatever you know about it from elsewhere.
2. **Every exclusion is recorded — `runlog.mjs finding excluded-player`, all of them in one call**, each argument naming the entity and the reason. A candidate that
   qualified and was left out is a decision the run made, and a reader is entitled to see it.
3. **Say what you did**, in one line, before moving on: how many candidates qualified, how many
   became rows.

The reason for the bounds: a selection made freshly each time produces a different set on every run
of the same topic, with nothing recording why. That is the failure the run configurations already
document — a number obeyed differently twice, and nothing flagging the difference.

## Write the rows

Write `digmore/<topic-slug>/players.csv` now, with the columns the command's reference file requires:
one row per selected player, carrying its `name` and anything else already known. **Every cell that
needs fetching stays empty.**

Rows first, cells later — not one write at the end. If the run stops during this phase, the file
already holds the selection, so a resumed run can see which rows still have no profile rather than
redoing the choosing.

**You are the only writer of this file.** The Player Profilers return cells; you write them. Everyone
after this phase only reads it.

What does **not** go in it: the candidates' aliases, their document counts and the Source Analysts'
per-source relevance notes. Those stay in `player_candidates.json` and reach the Player Profiler
through its dispatch.

## `[4.5/6]` Profile — one sub-agent per row

Dispatch **one Player Profiler per row**, per `../subagents/dispatch_structured_subagent.md` — which
is also where the rule that the dispatch **names the path to the agent's own file** lives,
§"Send the agent its own files". Here those are `../subagents/player_profiler_agent.md`,
`../fetching.md`, and the command's reference file.

Each dispatch carries one player's name, the topic, the columns this run's `players.csv` holds, and
**the path to `player_candidates.json`**. The agent finds its own entry there, follows the claim
references — which claims file, which claim, and the handle — and reads the text itself.

**Name the file; do not paste its contents.** You hold names, counts and the relevance notes you read
during the selection, and nothing more. Copying each player's references into its dispatch would put
every reference for every candidate through your context on the way — the exact payload this design
keeps on disk.

**Concurrency `min(20, the harness limit)`**, and **keep it full: dispatch the next row the moment one
returns, rather than sending a group and waiting for all of it.** A group runs at its slowest member's
pace — a company argued about in six places takes three times what a quiet one does, and in groups the
other nineteen agents wait for it. Rows are independent; nothing here needs a barrier.

It was a hard 5, to keep SimilarWeb from captcha'ing the run. That risk is now carried in the output
instead: a blocked traffic fetch writes `UNAVAILABLE — similarweb-blocked` into that one cell and the
profile stands, so a throttled run says so in `players.csv` rather than quietly returning rows with no
traffic number. Full reasoning in the agent's own file.

**Each dispatch carries `extract.fetchesPerBranch` as the pages that profiler may open**, across all
six of its steps. `preflight.mjs` prints the number this run uses.

**There is no cap on how many rows are profiled**, in either mode. The document floor and the
claim filter are the bound, and unlike a fixed number they scale with what the run actually found.

**When a profile fails**, the agent returns `fetch_failed` rather than writing a cell that hides it.
In auto mode, re-dispatch each failed row once, then skip it and record the skip — `runlog.mjs finding known-gap`. In
manual mode, collect the failures and ask once — retry, skip, or abort — when the last row has
returned, not as they arrive. Never one prompt per failed player: that interrupts the run as many
times as the topic happens to have awkward companies in it, and with rows now dispatched
continuously there is no group boundary to gather them at.

**Count the rows down on the marker** — `[4.5/6] Enrichment · Profile · 18/47` — reprinted as they
return, and one run-log pair for the sub-step as a whole. It is the longest stretch of this phase and
the only one where the user can see progress in units they recognise. **The marker is the whole
message**, and the next one follows it in the same turn (`../reporting.md`).

**Read that number off disk; never keep a tally.** One `ls` of
`cache/_returns/player-profiler-*.json` is how many have returned, and the step is finished when
every dispatched row has a file there or a recorded skip. **A count you maintain in your head is
wrong by the end of this step**: completion notifications arrive several to a message, and a run that
writes three rows in one turn and advances the count by one is then short by two for the rest of the
phase. That is not a hypothetical — a run reported `14 of 16` with all sixteen returns on disk, then
waited on two agents that had finished an hour earlier.

**Waiting is unchanged, and is not the thing that goes wrong.** Dispatch, refill as each returns, wait
for the rest. What changes is that the answer to *is this step done* comes from looking rather than
from arithmetic — which is how Extract's readers and Audit's fact check already work, and why neither
has this failure. A row dispatched with no return file and no skip is named with
`runlog.mjs finding known-gap` rather than waited on.

## Fill the cells

As each row returns, write its cells into the row already in `players.csv`. One return, one write —
not a batch held until the end, which is what a run killed mid-phase then loses.

A row that comes back with no identifiable presence at all is a research error: record it in
`audit.md` and name it in the run's Issues. A bare `UNAVAILABLE` in a cell is never acceptable — it
carries its reason or it is `—`.

**These cells never become claims.** The Player Profiler turns pricing pages and funding
announcements into facts that exist nowhere else in the run, and they carry citations that nothing
verifies — the fact check works on claims. That boundary is deliberate and is recorded in `audit.md`
rather than left to be discovered.

## Incremental persistence

`player_candidates.json` is written by the script and `players.csv` by you, both before any profiling
starts. If the phase is interrupted, a resumed run reads both, works out which rows still have empty
fetched cells, and dispatches only those. It does not re-run the script and does not re-choose: the
selection is a decision this run already made and recorded.

## End of Enrichment

Enrichment is complete when the expert step has finished appending, and either the run needed no
players and said so, or `players.csv` exists with a row per selected player and every row has been
profiled or recorded as skipped. No marker file — resume infers state from the files.
