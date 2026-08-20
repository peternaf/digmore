# Vet

Print `[3/5] Vet` when this phase starts (`../reporting.md`).

**This is the longest silent stretch of a run, so say how long once and then count.** Hacker News allows one request every 15 seconds, and vetting a handle costs four — but only one of the four hits that throttled host; the rest go to Algolia, which is not rate-limited. So the wall-clock is one handle every 15 seconds, and `vet.handleCapPerSource` handles at the default of 50 is roughly 12 minutes on Hacker News alone — the other sources run beside it and cost nothing extra — and two topics vetting at once queue against the same limit. State the count and the reason on the marker, then reprint it with a running count. A phase that goes quiet for forty minutes reads as a hang, and a run that thinks it has hung starts narrating instead of working.

**Vet in batches of about ten handles, one Bash call each.** A command's output reaches you only when it returns, so a single call covering every handle is a stretch of time in which nothing can be printed and nothing can be judged — the count above becomes impossible, and a stall is indistinguishable from work. Between batches you print the count and can stop early if the verdicts are coming back useless.

**Hacker News works through its handles one at a time; put other work beside it, never more Hacker News.** Reddit and Twitter go through digmore's API and share no limit with it, so their handles cost nothing extra while HN waits. Synthesize's per-player enrichment (`synthesize_phase_d.md` §3.5) can also start here: it reads the entities Extract found and needs no verdict. The HN loop holds the shell, so the rest goes to sub-agents.

For every handle seen in Extract, run `vet_user` (or the source equivalent). Read `../vetting.md` for the verdict schema and how cross-source identity / experts.csv inheritance work. Read `../subagents/handle_vetter_agent/<source>.md` for source-specific signals.

## The handle cap — one ranked list per source

Extract surfaces far more handles than a run can vet — thousands on a busy topic. Vetting each one costs two or three requests, and vetting is about half of a run's network traffic.

**The cap is per source, not per run.** Reddit, Hacker News, Twitter and forums each get their own `vet.handleCapPerSource`, and each is ranked on its own. Ranking across sources would mean comparing Hacker News karma against Twitter followers against Reddit upvotes, which is not a comparison — and it would let one busy source spend the whole budget while another went unvetted.

The bound is applied **after ranking, never by taking whatever came first** — and the ranking is already done. Extract's Source Analyst wrote one roster per handle-bearing source, `full_source_analysis/<source>-handles.json`, ordered by what each handle actually contributed: highest claim importance first, then how many of that source's documents they appear in.

That ranking is not yours to redo. It needs every document a source produced, and only the Source Analyst reads the whole pile (`../subagents/source_analyst_agent/index.md`).

So, per source:

1. Read the roster.
2. Vet straight down it until the cap is reached.
3. Record in `audit.md`, **per source**: how many distinct handles the roster held, how many were vetted, and that the rest were below the cut. A run that vetted 50 of 3,000 has not surveyed the community, and the summary must not read as though it had.

**A source with no roster cannot be vetted.** Its Source Analyst either failed or was never dispatched. Do not fall back to ranking by hand off whatever is in context — you no longer hold the claims, so any ranking you built would be by frequency alone, which is the thing the roster exists to replace. Record the source as unvetted in `audit.md`, name it in the run's Issues, and carry on.

The roster also saves requests: whatever the pages already showed about a handle — forum post counts, badges, trust levels, accepted-answer marks — is in its `signals`, and the Handle Vetter gets it without paying for it.

**A handle already in `experts.csv` spends a slot like any other.** The cap bounds the size of the vetted set, not the number of requests — so a topic whose inherited `experts.csv` already covers the cap does no further vetting on that source, and that is the intended outcome rather than a shortfall to make up.

The cap is `vet.handleCapPerSource`. `preflight.mjs` prints the value that applies to this run, fast-mode reduction already worked out — read it there rather than deriving it (`../modes.md`).

## Flow

1. Take that source's roster, down to the cap.
2. For each handle, check if it matches a row in the topic's `experts.csv`. If yes, auto-promote to `legit` without behavioral vetting. Skip the script call — but the handle still spends its slot, per the cap rule above.
3. For unmatched handles, dispatch the source's vetting CLI. On Reddit that is `api.mjs reddit user <name> --topic <slug>` — one call returns the verdict and the snapshot together. Twitter is `api.mjs twitter vet <handle> --topic <slug> --posts <n>`, where `n` is how many of the handle's recent posts to read alongside the profile; see the deep pass below. `--topic <slug>` is mandatory on every call, and the scripts refuse to run without it.
4. Layer the topical-relevance check (see `../vetting.md` §"Topical relevance — caller responsibility") on top of the script's verdict. A handle that the heuristic returns `legit` for is still demoted to `unknown` if they have zero recent on-topic activity. On Reddit the inputs for this arrive in the same response as the verdict — `recent_comments`, each carrying its own body and subreddit — so step 3 has already fetched everything this step needs.
5. Append newly identified experts (final verdict `legit` AND on-topic) to `experts.csv` via `experts.mjs add`, passing `--last-active` when the source reported one and `--topical-relevance` with the reading step 4 took. Step 4 is the only place that judgement exists; without the flag it is made and thrown away.
6. Drop the quotes of anyone who came back `promoter`, `spammer` or `throwaway` — they get no row in `experts.csv`. The verdict itself is kept, in the roster: the drop is a decision the run made and has to be able to account for.

There is nothing to vet on the local source: a document the user handed over has no handle behind it. See `../subagents/page_analyst_agent/local.md`.

## Twitter — the deep pass

Twitter vets at two depths, and the second one runs over a subset of the first. Two waves, in order:

1. **The profile pass.** Every Twitter handle within the cap gets `--posts 0` — the profile alone.
2. **The deep pass.** Take the handles that came back `unknown`, keep them in the roster's order, and dispatch the top `twitter.handlesDeepVetted` again with `--posts <twitter.postsPerDeepVet>`. The rest keep `unknown`, and `audit.md` records how many fell below the deep cut.

**Only `unknown` handles are worth the second call.** `spammer`, `promoter` and `throwaway` are settled — reading fifty more posts changes none of them. The roster's order decides who among the rest gets it, and that order is the point: the heuristic floor never returns `legit` (below), so almost everything that is not a confident negative arrives here ambiguous, and the verdict itself separates nobody. What separates them is what they said — highest claim importance first, then how many documents they appear in.

A handle that gets the deep pass is therefore dispatched twice, and the second dispatch is the one that does the work. Each depth caches under its own filename, so the deep call fetches the deeper answer rather than re-reading the profile already on disk.

Both numbers are the user's, and `preflight.mjs` prints what this run applies. In `--fast`, `handlesDeepVetted` is `0` and there is no second wave at all.

## LLM judgment for Twitter `unknown`

The heuristic floor never returns `legit` — only confident negatives (`spammer` / `promoter`) or `unknown`.

**The vet response says when judgment is needed: `needs_llm_judgment: true`.** Read the flag; do not re-derive it from the verdict and the post count. It is true exactly when the verdict is `unknown` and posts were sampled, and the rule belongs to whatever produced the verdict rather than to you.

It can only be set on the deep pass, since the profile pass samples nothing. The Handle Vetter already holds the posts it fetched, so the judgment is made inside that same dispatch against the rubric in `../subagents/handle_vetter_agent/twitter.md` — real expert / marketer / content-seller / agenda-pusher — and mapped to the shared verdict schema. The judgment is always the plugin's to make; nothing upstream makes it.

## Write the verdicts back to the roster

**One write per source, as that source finishes** — not one write at the end of the phase. Hacker News alone runs for twelve minutes; holding every source's verdicts until the last one returns means a run that dies during HN loses the Reddit and Twitter work too.

So when a source's handles are all back, write what you decided into `full_source_analysis/<source>-handles.json`: `verdict`, `topicalRelevance`, `verdictReason` and `inExperts` on every handle you vetted. Handles below the cap keep their row and gain nothing — an absent verdict means never vetted, which is not the same as vetted and rejected.

**You write it, not the Handle Vetters.** They fan out one per handle, and a file written by a fan-out loses rows silently; they hand you a short object each and you write once for the source. The Source Analyst created the file in Extract and never touches it again, so the two writers never overlap.

This is the only record of a rejection. `experts.csv` holds legit people only, so without this a `promoter` or `spammer` verdict is computed, used to drop a quote, and thrown away — and the next run on this topic pays to compute it again. It is also what lets a resumed run tell who is still outstanding.

## Incremental persistence

The scripts cache their own raw verdicts per handle under `digmore/<topic-slug>/cache/<source>/` as they are computed, not at end of phase. If Vet is interrupted mid-vet, re-running re-vets only the handles with no cached verdict. Those files hold the heuristic's answer; the roster holds the final one, after the topical-relevance layer and any voice judgment have been applied.

## When a source is unavailable

If Reddit or Twitter has no API key, there are no handles from those sources to vet, and that is not a failure. Record the sources that were unavailable so the summary and the terminal output can name them.

## End of Vet

Vet is complete when every handle **within each source's cap** has either: a verdict on disk, or an entry in `experts.csv` (auto-promoted), or was dropped (recorded only in the verdict as `spammer`/`throwaway`/`promoter` — no entry in experts.csv); and on Twitter, when the deep pass has run over its share of them. Handles below a cut are not pending work — they are recorded in `audit.md` and the run moves on. No marker file.
