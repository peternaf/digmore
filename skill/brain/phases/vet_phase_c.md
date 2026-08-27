# Vet

Print `[3/6] Vet` when this phase starts (`../reporting.md`).

**Who is worth quoting, and how much of this topic they actually work on.** One Handle Vetter per handle, on every source that has handles. The judging is theirs — the verdict vocabulary, the topical-relevance read, the per-source signals and the Twitter voice rubric all live in `../subagents/handle_vetter_agent/`, and this file does not restate any of it.

What is left here is the orchestrator's own work, and it is the whole phase: **you decide who gets judged and how deeply; the agent decides what the answer is.** Everything below needs a view of every handle at once, or the user, or the disk — which is exactly why none of it is the agent's.

**This phase is a long queue of small identical jobs, so say how big it is once and then count.** State the count on the marker, then reprint it with a running count. A phase that goes quiet reads as a hang.

**Every source is vetted beside every other.** Reddit and Twitter go through digmore's API; Hacker News goes to Algolia and Firebase. They share no limit, so run them together rather than in sequence. **Enrichment cannot be brought forward** — it filters claims by the verdicts this phase is still producing, so it has nothing to work from until Vet is done (`enrich_phase_d.md`).

## The handle cap — one ranked list per source

Extract surfaces far more handles than a run can vet — thousands on a busy topic.

**The cap is per source, not per run.** Reddit, Hacker News, Twitter and forums each get their own `vet.handleCapPerSource`, and each is ranked on its own. Ranking across sources would mean comparing Hacker News karma against Twitter followers against Reddit upvotes, which is not a comparison — and it would let one busy source spend the whole budget while another went unvetted.

The bound is applied **after ranking, never by taking whatever came first** — and the ranking is already done. Extract's Source Analyst wrote `full_source_analysis/<source>-handles.json` for each handle-bearing source, ordered by what each handle actually contributed: highest claim importance first, then how many of that source's documents they appear in.

That ranking is not yours to redo. It needs every document a source produced, and only the Source Analyst reads the whole pile (`../subagents/source_analyst_agent/index.md`).

**A source missing this file cannot be vetted.** Extract already re-dispatched its Source Analyst once and it still produced nothing (`extract_phase_b.md` §"When a Source Analyst fails"), so there is nothing left to try here. Do not fall back to ranking by hand off whatever is in context — you no longer hold the claims, so any ranking you built would be by frequency alone, which is the thing the file exists to replace. Record the source as unvetted in `audit.md`, name it in the run's Issues, and carry on.

A source that produced no handles at all is different and is not a failure: no file is the right outcome, and there is nobody to vet.

The file also saves requests: whatever the pages already showed about a handle — forum post counts, badges, trust levels, accepted-answer marks — is in its `signals`, and the Handle Vetter gets it without paying for it. Its `documents` array names the cached files that handle appears in, which is very nearly everything a forums vetter has to work from.

`preflight.mjs` prints the `vet.handleCapPerSource` that applies to this run, fast-mode reduction already worked out — read it there rather than deriving it (`../modes.md`).

## Flow

1. **Read `<source>-handles.json`** for each source and take from the top down to `vet.handleCapPerSource`.

2. **Decide who is dispatched at all.** Two kinds of handle spend a slot without one:
   - **Already a row in `experts.csv`** — inherited from a parent topic or written earlier in this run. Auto-promote to `legit` and move on. The cap bounds the size of the vetted set rather than the number of requests, so a topic whose inherited file already covers the cap does no further vetting on that source, and that is the intended outcome rather than a shortfall to make up.
   - **Its row already carries a `verdict`** — it was done on an earlier run. Skip it. Do not re-dispatch and rely on the script's cache to make the repeat cheap: that works on Reddit, Hacker News and Twitter, where the script returns the cached verdict without a request, and not on forums, where there is no script and the whole judgement is redone. This is what makes the phase resumable.

3. **Decide Twitter's depth before dispatching.** The top `twitter.handlesDeepVetted` **by their rank in the file** get `--posts <twitter.postsPerDeepVet>`; everyone else gets `--posts 0`. **One dispatch either way** — there is no second wave.

   It used to run twice: the cheap pass over everyone, then a deep pass over whichever came back `unknown`. What made that necessary was not knowing who was `unknown` until the cheap verdict came back, and that reason is gone — the ranking exists before Vet starts, so the deep set is picked from what each handle contributed rather than from a verdict you have to buy first. On Twitter the heuristic floor never returns `legit` anyway, so the profile pass was mostly confirming what was already assumed. The cost is a few deep reads spent on handles that turn out to be `spammer` or `promoter`; that is a handful of calls against a whole extra pass over every handle.

4. **Dispatch one Handle Vetter per batch of handles.** Up to `vet.handlesPerDispatch` of them, **all from one source**, judged one after another inside the agent — except on Twitter, which uses its own `twitter.handlesPerDispatch` because a deep vet reads that source's posts and the same count carries far more material. `preflight.mjs` prints both numbers this run uses.

   **Form the batches from what survives step 2**, never from the raw list — a resumed run would otherwise hand an agent five handles it has nothing to do with. Both filters need a view of the whole list, which is why they are yours.

   **One source per batch**, for the reason the agent is sent one `<source>.md` and runs one source's script: a batch mixing a Reddit handle with a forum handle leaves it guessing at half of them. **On Twitter, `--posts` rides per handle** — the depth was decided per handle from its rank at step 3, so a batch spans both tiers, and that is deliberate: splitting by tier would fragment Twitter's dispatches for nothing, while mixing evens out a batch's wall-clock instead of concentrating the slow reads together.

   **No waves here, unlike Extract's readers.** `vet.handleCapPerSource` bounds *who is dispatched* and the ranked file exists before this phase starts, so the whole set is known up front and the cap cannot be overshot. Send every batch of a source at once, up to the concurrent sub-agent limit `preflight.mjs` reported, and on every source alike. **Nothing here is serialised any more** — Hacker News moved to Firebase and Algolia, neither of which is throttled, so it fans out like the rest.

   **The batch is sequential, and the dispatch has to say so.** A batch would otherwise invite the fan-out `index.md` §"What a sub-agent is" forbids, and a sub-agent that dispatches work cannot await it. Put this in verbatim:

   ```
   Vet these one at a time, in the order given. Finish each handle completely — run its
   call, read what came back, reach your verdict — before you start the next one. Do not
   dispatch sub-agents. Do not parallelise. You receive no completion notification for
   anything you start, so whatever you start you wait on forever.
   ```

   **What comes back is an array, one short object per handle.** One handle that could not be read is `unknown` with a reason on its own entry; the rest of the batch stands.

5. **Write the verdicts back, in batches as they arrive.** Two files from one read, so a handle recorded as `legit` in one is never missing from the other:
   - **`<source>-handles.json`** — `verdict`, `topicalRelevance`, `verdictReason`, `inExperts`, and `statedIdentifiers`, onto the row that handle already has.
   - **`experts.csv`**, through `experts.mjs add` — one row when the verdict is `legit` **and** the handle is on-topic, and nothing else consulted. Pass `--last-active` when the source reported one, `--topical-relevance` with the agent's reading, and whatever `statedIdentifiers` printed into the handle columns it names.

   **In batches, not once when the source finishes.** A run that stops at handle 30 would otherwise reach no write at all, and thirty dispatches would be gone. **A dispatch's array is one such batch** — the batch you sent and the batch you write are now the same batch, so write each one as it returns.

   **You write these, not the Handle Vetters.** They fan out, several batches at once, and a file written by a fan-out loses rows silently; they hand you an array each and you write.

6. **Check the file after each batch** — `validate.mjs source-handles` against it, one repair attempt, then drop the offending row and name the handle it came from so its dispatch can be re-run. The gate is on the file rather than on the returns: nothing is built on a return directly, and the two fields anyone acts on are the ones that land here.

7. **Record per source in `audit.md`**: how many distinct handles the file held, how many were vetted, and that the rest were below the cut. A run that vetted 50 of 3,000 has not surveyed the community, and the summary must not read as though it had.

8. **Keep the user informed** — the marker and its running count, in the shape `../reporting.md` §Progress gives, and nothing beyond it.

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

Vet is complete when every handle **within each source's cap** has either a verdict in `<source>-handles.json`, or a row in `experts.csv` it was auto-promoted from. Handles below a cut are not pending work — they are recorded in `audit.md` and the run moves on. No marker file.
