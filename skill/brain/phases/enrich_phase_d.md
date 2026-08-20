# Enrichment

Print `[4/6] Enrichment` when this phase starts (`../reporting.md`).

Extract collected the material. Vet judged the people behind it. This phase works out **who the
research is about** — which companies, projects and products the run will report on — and gathers
everything it will say about each one.

It sits here and nowhere else. It cannot run inside Extract: deciding which voices to listen to needs
the verdicts, and those do not exist until Vet finishes. It cannot run inside Synthesize: the Report
Writer renders every list from a finished file, so it cannot be the thing that writes it.

Nothing before this phase ever decided who the run's subjects were. That is what this phase adds.

## 1. Filter the candidates — the script decides this, not you

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/players.mjs" candidates --topic <slug>
```

Each Source Analyst wrote `full_source_analysis/<source>-players.json` in Extract: every entity that
source's material named, how many of its documents named it, and one entry per claim with the handle
that said it. Six files, one per source, and none of them has been read by anybody yet.

The script reads all six, joins every claim's handle to its verdict in `<source>-handles.json`, drops
what the run does not listen to, merges the six lists into one, recounts, and applies the floor. It
writes `digmore/<topic-slug>/player_candidates.json` and prints a summary.

**A player is a candidate at five or more documents across all sources**, counted after the claim
filter. One document that names a player counts once, however many times the name appears inside it —
a single long thread repeating a name forty times is one document, not forty mentions.

Which claims count toward that number:

| Handle verdict | Claims reach the report | Count toward the five |
| --- | --- | --- |
| `legit` | yes | yes |
| `unknown` | yes, caveated | yes |
| never vetted — below `vet.handleCapPerSource` | yes, caveated | yes |
| `promoter` | yes, labelled as a promotional signal | **no** |
| `spammer`, `throwaway` | no | no |
| no handle at all — the open web, the user's own documents | yes, filtered on page quality | yes |

Three of those rows are worth understanding rather than just obeying:

- **An absent verdict means never vetted, not rejected.** The cap stops at
  `vet.handleCapPerSource` per source, so on a busy topic most handles have no verdict at all.
  Treating them as rejected would throw away nearly everything, and on Twitter — where the heuristic
  floor never returns `legit` — no player could ever be counted from that source.
- **A `promoter`'s claims are kept and not counted.** A founder posting about their own product
  across six threads is how a promoter manufactures a player. The quotes still reach the report,
  labelled; they cannot create a row on their own.
- **Claims with no handle count.** A page has an author rather than an account, so most of what is
  said about a company — vendor pages, comparisons, reviews — carries no handle. `unreliable` pages
  are dropped and the rest count, which is the same rule `synthesize_phase_e.md` §1 applies to every
  other claim.

The candidates come back ordered: highest claim importance first, then document count. That order is
the only ranking `players.csv` has ever had, and step 2 reads it.

**`possibleDuplicates` is for you to settle.** The script merges entities only where a name or alias
matches exactly, because guessing folds a one-word product name into any longer name that contains
it as readily as it joins `Acme` to `ACME Video`. Where two entries look like one player under two
names it says so instead —
with both document counts, their combined total, and whether merging them would clear the floor.
That last flag is the one that matters: two halves of one company can each sit below five while
together they clear it, and without the flag the run loses a player without ever knowing. Decide
each pair in step 2, and record what you decided.

## 2. Decide which players this run needs — yours

The script produced candidates. **Which of them become rows is your decision, taken once, per run.**

You hold what that needs and no sub-agent does: `research_plan.json.scope.deliverables` — every
section this summary will have — the command's reference file, and the ordered candidate list.

**First, whether the run needs players at all.** Read the deliverables. If no declared section is
about companies, this phase stops here: no rows, no profiling, and say so in the run's Issues.
`gtm` writes no `players.csv` unless the topic is chained from a landscape parent, and `ask` has an
explicit "no players in scope" path — both are ordinary outcomes, not failures.

**Then which candidates become rows.** The commands differ and their reference files say how:
`landscape` wants the market, `competitor` wants its subject plus the three to five nearest peers,
`ask` wants whatever the question actually turns on. Read the command's "Who counts as a player"
test and apply it to the ordered list.

Three bounds on that judgement:

1. **You may cut from the candidate list. You may never add below the floor.** A company that did
   not reach five documents did not earn a row, whatever you know about it from elsewhere.
2. **Every exclusion is recorded in `audit.md`**, naming the entity and the reason. A candidate that
   qualified and was left out is a decision the run made, and a reader is entitled to see it.
3. **Say what you did**, in one line, before moving on: how many candidates qualified, how many
   became rows.

The reason for the bounds: a selection made freshly each time produces a different set on every run
of the same topic, with nothing recording why. That is the failure the run ceilings already
document — a number obeyed differently twice, and nothing flagging it.

## 3. Write the rows

Write `digmore/<topic-slug>/players.csv` now, with the columns the command's reference file requires:
one row per selected player, carrying its `name` and anything else already known. **Every cell that
needs fetching stays empty.**

Rows first, cells later — not one write at the end. If the run stops during this phase, the file
already holds the selection, so a resumed run can see which rows still have no profile rather than
redoing the choosing.

**You are the only writer of this file.** The Player Profilers return cells; you write them. The
Report Writer only reads it.

What does **not** go in it: the candidates' aliases, their document counts and the Source Analysts'
per-source relevance notes. Those stay in `player_candidates.json` and reach the Player Profiler
through its dispatch.

## 4. Profile — one sub-agent per row

Dispatch **one Player Profiler per row**, per `../subagents/dispatch_structured_subagent.md`. Its own
file is `../subagents/player_profiler_agent.md`, and it is also sent `../fetching.md`.

Each dispatch carries one player's name, the topic, the columns this run's `players.csv` holds, and
**the path to `player_candidates.json`**. The agent finds its own entry there, follows the claim
references — which claims file, which claim, and the handle — and reads the text itself.

**Name the file; do not paste its contents.** You hold names, counts and the relevance notes you read
in §2, and nothing more. Copying each player's references into its dispatch would put every
reference for every candidate through your context on the way — the exact payload this design keeps
on disk. Same rule as Extract's claims: a step that needs the material is given the path.

**Concurrency 5**, not the harness limit. Every dispatch fetches SimilarWeb, and running wider gets
the run captcha'd there — after which no row gets its traffic number. Full reasoning in the agent's
own file.

**There is no cap on how many rows are profiled**, in either mode. The five-document floor and the
claim filter are the bound, and unlike a fixed number they scale with what the run actually found.

**When a profile fails**, the agent returns `fetch_failed` rather than writing a cell that hides it.
In manual mode, ask once per wave of five, for all the failed rows together: retry, skip, or abort.
In auto mode, re-dispatch each failed row once, then skip it and record the skip in `audit.md`. Never
one prompt per failed player — that interrupts the run as many times as the topic happens to have
awkward companies in it.

## 5. Fill the cells

As each wave returns, write its cells into the rows already in `players.csv`.

A row that comes back with no identifiable presence at all is a research error: record it in
`audit.md` and name it in the run's Issues. A bare `UNAVAILABLE` in a cell is never acceptable — it
carries its reason or it is `—`.

## Incremental persistence

`player_candidates.json` is written by the script and `players.csv` by you, both before any profiling
starts. If the phase is interrupted, a resumed run reads both, works out which rows still have empty
fetched cells, and dispatches only those. It does not re-run the script and does not re-choose: the
selection is a decision this run already made and recorded.

## End of Enrichment

Enrichment is complete when either the run needed no players and said so, or `players.csv` exists
with a row per selected player and every row has been profiled or recorded as skipped. No marker
file — resume infers state from the two files.
