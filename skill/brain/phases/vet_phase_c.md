# Vet

Print `[3/6] Vet` when this phase starts (`../reporting.md`).

**Who is worth quoting, and how much of this topic they actually work on.** One Handle Vetter per range of handles, on every source that has handles. The judging is theirs — the verdict vocabulary, the topical-relevance read, the per-source signals and the Twitter voice rubric all live in `../subagents/handle_vetter_agent/`, and this file does not restate any of it.

What is left here is the orchestrator's own work, and there is less of it than there was: **`handle_vetting.mjs` decides who gets judged and how deeply, the agent decides what the answer is, and you decide how many dispatches that takes and wait on them.** Both files this phase produces are written by scripts — the roster by the aggregation, `experts.csv` by `experts.mjs build` — so nothing here fans out onto a shared file and nothing needs a lock.

**This phase is a long queue of small identical jobs, so say how big it is once and then count.** State the count on the marker, then reprint it with a running count. A phase that goes quiet reads as a hang.

**Every source is vetted beside every other.** Reddit and Twitter go through digmore's API; Hacker News goes to Algolia and Firebase. They share no limit, so run them together rather than in sequence. **Enrichment cannot be brought forward** — it filters claims by the verdicts this phase is still producing, so it has nothing to work from until Vet is done (`enrich_phase_d.md`).

## The handle cap — one ranked list per source

Extract surfaces far more handles than a run can vet — thousands on a busy topic.

**The cap is per source, not per run.** Reddit, Hacker News, Twitter and forums each get their own `vet.handleCapPerSource`, and each is ranked on its own. Ranking across sources would mean comparing Hacker News karma against Twitter followers against Reddit upvotes, which is not a comparison — and it would let one busy source spend the whole budget while another went unvetted.

The bound is applied **after ranking, never by taking whatever came first** — and the ranking is already done. Extract's Source Analyst wrote `full_source_analysis/<source>-handles.json` for each handle-bearing source, ordered by what each handle actually contributed: highest claim importance first, then how many of that source's documents they appear in.

That ranking is not yours to redo. It needs every document a source produced, and only the Source Analyst reads the whole pile (`../subagents/source_analyst_agent/index.md`).

**A source missing this file cannot be vetted** — `prepare` reports it as `missing` at step 1 below, and Extract already re-dispatched its Source Analyst once (`extract_phase_b.md` §"When a Source Analyst fails"). A source that produced no handles at all is different and is not a failure: no file is the right outcome, and there is nobody to vet.

The file also saves requests: whatever the pages already showed about a handle — forum post counts, badges, trust levels, accepted-answer marks — is in its `pageSignals`, and the Handle Vetter gets it without paying for it. Its `documents` array names the cached files that handle appears in, which is very nearly everything a forums vetter has to work from.

**You do not apply the cap yourself, and do not need to read the file to know what it holds.** `prepare` takes the cut and prints the count; `preflight.mjs` prints the `vet.handleCapPerSource` that bounds it, fast-mode reduction already worked out (`../modes.md`).

## Flow

**You write neither `<source>-handles.json` nor `experts.csv` in this phase.** Scripts do both, and
your work is deciding how many dispatches go out and waiting on them. Everything below is per source,
and the four run beside each other.

1. **Prepare the source.**

   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/handle_vetting.mjs" prepare \
     --topic <slug> --source <source> [--fast]
   ```

   It reads the ranked roster, takes the top `vet.handleCapPerSource`, writes the `experts.csv`
   auto-promotions straight in as `legit`, drops everything already answered, decides Twitter's
   depth over what is left, freezes the remainder to `cache/<source>/vetting-worklist.json`, and
   prints the count. **The count is the only thing you keep.**

   It reads the configurations from settings itself rather than taking them from you — `prepare`
   needs three at once, and three flags is three chances to pass a stale one. Pass `--fast` when the
   run is fast, and nothing else.

   **`missing: true` means the source has no roster and cannot be vetted.** Extract already
   re-dispatched its Source Analyst once. Record it — `runlog.mjs finding source-unavailable` — name it in the run's Issues, and
   carry on. Do not rank by hand off whatever is in context — you no longer hold the claims, so any
   ranking you built would be by frequency alone, which is the thing the file exists to replace.

2. **Dispatch one Handle Vetter per range**, per `../subagents/dispatch_structured_subagent.md`.
   Split the count into ranges of `vet.handlesPerDispatch` — `twitter.handlesPerDispatch` on Twitter,
   which is lower because a deep vet reads that source's posts and the same count carries far more
   material. `preflight.mjs` prints both numbers this run uses.

   **Each dispatch carries a range, the source and the research question — and no handle names.**
   "Handles 11 to 20 on reddit". The agent asks `handle_vetting.mjs serve` for its own, and the row,
   the signals and the `--posts` count travel from the work list rather than through you. **You hold
   a count and a range per dispatch and never learn a handle's name**, which also removes the
   transcription step that put 26 wrong-typed rows into one run's roster.

   **Send it its own files**, as every dispatch does (`../subagents/dispatch_structured_subagent.md`
   §"Send the agent its own files") — its `index.md`, its `<source>.md`, and `../vetting.md`. This
   phase deliberately holds none of the judgement itself, so a vetter dispatched without those paths
   is judging against nothing and returns verdicts that look exactly like judged ones.

   **One source per range**, because the agent is sent one `<source>.md` and runs one source's
   script: a range spanning two sources leaves it guessing at half of them.

   **No waves, unlike Extract's readers.** The work list is frozen before the first dispatch, so the
   whole set is known and the cap cannot be overshot — and a range addresses a fixed position in a
   file that does not move underneath it. Recompute the list per request instead and "handles 11 to
   20" would address what used to be 21 to 30 once the first batch finished, leaving the original ten
   vetted by nobody. Send every range of a source at once, up to the concurrent sub-agent limit
   `preflight.mjs` reported. **Nothing here is serialised any more** — Hacker News moved to Firebase
   and Algolia, neither of which is throttled, so it fans out like the rest.

   **The range is worked sequentially, and the dispatch has to say so.** A batch would otherwise
   invite the fan-out `index.md` §"What a sub-agent is" forbids, and a sub-agent that dispatches work
   cannot await it. Put this in verbatim:

   ```
   Vet these one at a time, in the order given. Finish each handle completely — run its
   call, read what came back, reach your verdict, write its file — before you start the
   next one. Do not dispatch sub-agents. Do not parallelise. You receive no completion
   notification for anything you start, so whatever you start you wait on forever.
   ```

   **Every vetter returns the word `done`.** Nothing about a handle comes back, and there is nothing
   to parse or transcribe.

3. **Aggregate, once that source's vetters have all stopped.**

   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/handle_vetting.mjs" aggregate \
     --topic <slug> --source <source>
   ```

   It validates each `cache/<source>/handles/*.json`, discards the malformed, and merges the rest
   into `<source>-handles.json` by joining on `handle`. **It never rebuilds that file** — the roster,
   the ranking and the `documents` lists are the Source Analyst's and predate this phase.

   **Stopped is not succeeded.** A vetter that returns a failure, or one the stuck-agent check kills,
   is finished — it just produced no file. Waiting for every dispatch to succeed would let one dead
   agent hold a source open indefinitely.

   **There is no separate validation step, and no repair dispatch.** The vetter checked its own file
   before moving on and the aggregation checks it again before merging, so a bad row never reaches
   the shared file — which is what the old post-write gate could only catch after the fact.

   **Record its gap report — `runlog.mjs finding vetting-gap`**: `noFile` is the handles the run dispatched and has no
   verdict for, `discarded` is the files that failed their shape check with the reason.

4. **Build `experts.csv`, once — after every source has been aggregated.**

   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/experts.mjs" build <slug>
   ```

   It reads the merged rosters, takes the `legit` rows and folds each through the same merge
   `experts.mjs` has always used — exact equality on a real name or a handle column, ambiguity
   flagged rather than guessed. One bad row is recorded in its `skipped` list and the rest still
   land; `experts.mjs add` once threw on the second handle of a loop and took 48 verdicts with it.

   **It cannot run per source.** Enrichment round-robins the expert budget across sources and counts
   the five-document floor across all of them, so there is no early start to buy.

5. **Record the four sources in one `runlog.mjs finding handle-counts` call**, an argument each: how many handles that roster held, how many were vetted, and
   that the rest were below the cut. A run that vetted 50 of 3,000 has not surveyed the community,
   and the summary must not read as though it had.

6. **Keep the user informed** — the marker and its running count, in the shape `../reporting.md`
   §Progress gives, and nothing beyond it.

There is nothing to vet on the local source or the open web: a page has an author rather than an account. See `../subagents/page_analyst_agent/local.md`.

## What a verdict costs downstream

`legit` is quoted freely · `unknown` is kept and marked "unvetted" · `promoter` is kept only as a promotional signal, labelled · `spammer` and `throwaway` are dropped. **A verdict other than `legit` changes how a quote is used, not whether it survives.**

Every handle that reached vetting got there by ranking high on what it contributed to the question, so dropping it loses evidence the run paid for and already judged relevant. It matters most on Twitter, where the floor never returns `legit`: under a drop-everything-but-`legit` rule a `--fast` run would produce zero usable Twitter quotes.

The full definitions are in `../vetting.md`, which the Handle Vetter is sent.

## Why the verdict does not live in the cache

`cache/` holds what was *fetched* and is disposable; `<source>-handles.json` holds what was *concluded* and is the output. Two things follow. Resume reads the cache — a handle with a cached verdict costs no request — so clearing it costs requests and nothing else. And `<source>-handles.json` is the run's only record of a **rejection**: `experts.csv` keeps `legit` people only, so without it a `promoter` verdict is computed, used to drop a quote, and thrown away, and the next run on the topic pays to compute it again.

The finished file is therefore one source's whole record of its people — who appeared and what they contributed, from Extract; what the run decided about them, from here — sitting beside that source's own report.

## When a source is unavailable

If Reddit or Twitter has no API key, there are no handles from those sources to vet, and that is not a failure. Record the sources that were unavailable so the summary and the terminal output can name them.

## End of Vet

**Vet is complete when every source has been aggregated** — `handle_vetting.mjs aggregate` has run on each source that had a roster, and `experts.mjs build` has run once after the last of them.

That is the end condition rather than "every handle has a verdict", because a handle can legitimately end the phase without one: its vetter died, or its file failed its shape check twice. Those are in the aggregation's gap report and in `audit.md`, and they are recorded rather than retried. Handles below a cut were never pending work either. No marker file.
