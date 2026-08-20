# Vet

Print `[3/5] Vet` when this phase starts (`../reporting.md`).

**This is the longest silent stretch of a run, so say how long once and then count.** Hacker News allows one request every 15 seconds, and vetting a handle costs four — but only one of the four hits that throttled host; the rest go to Algolia, which is not rate-limited. So the wall-clock is one handle every 15 seconds, and `vet.handleCapPerSource` handles at the default of 50 is roughly 12 minutes on Hacker News alone — the other sources run beside it and cost nothing extra — and two topics vetting at once queue against the same limit. State the count and the reason on the marker, then reprint it with a running count. A phase that goes quiet for forty minutes reads as a hang, and a run that thinks it has hung starts narrating instead of working.

**Vet in batches of about ten handles, one Bash call each.** A command's output reaches you only when it returns, so a single call covering every handle is a stretch of time in which nothing can be printed and nothing can be judged — the count above becomes impossible, and a stall is indistinguishable from work. Between batches you print the count and can stop early if the verdicts are coming back useless.

**Hacker News works through its handles one at a time; put other work beside it, never more Hacker News.** Reddit and Twitter go through digmore's API and share no limit with it, so their handles cost nothing extra while HN waits. Synthesize's per-player enrichment (`synthesize_phase_d.md` §3.5) can also start here: it reads the entities Extract found and needs no verdict. The HN loop holds the shell, so the rest goes to sub-agents.

For every handle seen in Extract, run `vet_user` (or the source equivalent). Read `../vetting.md` for the verdict schema and how cross-source identity / experts.csv inheritance work. Read `../subagents/handle_vetter_agent/<source>.md` for source-specific signals.

## The handle cap — one ranked list per source

Extract surfaces far more handles than a run can vet — thousands on a busy topic. Vetting each one costs two or three requests, and vetting is about half of a run's network traffic.

**The cap is per source, not per run.** Reddit, Hacker News, Twitter and forums each get their own `vet.handleCapPerSource`, and each is ranked on its own. Ranking across sources would mean comparing Hacker News karma against Twitter followers against Reddit upvotes, which is not a comparison — and it would let one busy source spend the whole budget while another went unvetted.

The bound is applied **after ranking, never by taking whatever came first**. Per source:

1. Collect every distinct handle that source produced in Extract.
2. Rank them by relevance to the research question:
   - **How often they appeared**, across how many different branches. Someone surfacing in three branches is more central to the question than someone who appeared once.
   - **How on-topic the material was** where they appeared — an author of a thread that answers the question directly outranks a passing commenter in a tangential one.
   - **Engagement on what they wrote** — score, karma, upvotes — as the tiebreaker, never the lead. A popular off-topic comment is still off-topic.
3. Vet down the ranked list until the cap is reached.
4. Record in `audit.md`, **per source**: how many distinct handles were found, how many were vetted, and that the rest were below the cut. A run that vetted 50 of 3,000 has not surveyed the community, and the summary must not read as though it had.

**A handle already in `experts.csv` spends a slot like any other.** The cap bounds the size of the vetted set, not the number of requests — so a topic whose inherited `experts.csv` already covers the cap does no further vetting on that source, and that is the intended outcome rather than a shortfall to make up.

The cap is `vet.handleCapPerSource`. `preflight.mjs` prints the value that applies to this run, fast-mode reduction already worked out — read it there rather than deriving it (`../modes.md`).

## Flow

1. Take that source's ranked, capped handle list (post authors, comment authors, mentioned handles).
2. For each handle, check if it matches a row in the topic's `experts.csv`. If yes, auto-promote to `legit` without behavioral vetting. Skip the script call — but the handle still spends its slot, per the cap rule above.
3. For unmatched handles, dispatch the source's vetting CLI. On Reddit that is `api.mjs reddit user <name> --topic <slug>` — one call returns the verdict and the snapshot together. Twitter is `api.mjs twitter vet <handle> --topic <slug> --posts <n>`, where `n` is how many of the handle's recent posts to read alongside the profile; see the deep pass below. `--topic <slug>` is mandatory on every call, and the scripts refuse to run without it.
4. Layer the topical-relevance check (see `../vetting.md` §"Topical relevance — caller responsibility") on top of the script's verdict. A handle that the heuristic returns `legit` for is still demoted to `unknown` if they have zero recent on-topic activity. On Reddit the inputs for this arrive in the same response as the verdict — `recent_comments`, each carrying its own body and subreddit — so step 3 has already fetched everything this step needs.
5. Append newly identified experts (final verdict `legit` AND on-topic) to `experts.csv` via `experts.mjs add`, passing `--last-active` when the source reported one and `--topical-relevance` with the reading step 4 took. Step 4 is the only place that judgement exists; without the flag it is made and thrown away.
6. Drop charlatans / promoters / spammers — do NOT store them.

There is nothing to vet on the local source: a document the user handed over has no handle behind it. See `../subagents/page_analyst_agent/local.md`.

## Twitter — the deep pass

Twitter vets at two depths, and the second one runs over a subset of the first. Two waves, in order:

1. **The profile pass.** Every Twitter handle within the cap gets `--posts 0` — the profile alone.
2. **The deep pass.** Take the handles that came back `unknown`, keep them in the rank order from above, and dispatch the top `twitter.handlesDeepVetted` again with `--posts <twitter.postsPerDeepVet>`. The rest keep `unknown`, and `audit.md` records how many fell below the deep cut.

**Only `unknown` handles are worth the second call.** A `spammer` or `promoter` verdict is already settled, and reading fifty of their posts changes nothing. Ranking decides the rest, because the heuristic floor never returns `legit` (below) — so almost everything that is not a confident negative arrives here ambiguous, and there is no signal in the verdict itself to separate them.

A handle that gets the deep pass is therefore dispatched twice, and the second dispatch is the one that does the work. Each depth caches under its own filename, so the deep call fetches the deeper answer rather than re-reading the profile already on disk.

Both numbers are the user's, and `preflight.mjs` prints what this run applies. In `--fast`, `handlesDeepVetted` is `0` and there is no second wave at all.

## LLM judgment for Twitter `unknown`

The heuristic floor never returns `legit` — only confident negatives (`spammer` / `promoter`) or `unknown`.

**The vet response says when judgment is needed: `needs_llm_judgment: true`.** Read the flag; do not re-derive it from the verdict and the post count. It is true exactly when the verdict is `unknown` and posts were sampled, and the rule belongs to whatever produced the verdict rather than to you.

It can only be set on the deep pass, since the profile pass samples nothing. The Handle Vetter already holds the posts it fetched, so the judgment is made inside that same dispatch against the rubric in `../subagents/handle_vetter_agent/twitter.md` — real expert / marketer / content-seller / agenda-pusher — and mapped to the shared verdict schema. The judgment is always the plugin's to make; nothing upstream makes it.

## Incremental persistence

Vetting verdicts persist per-handle to `digmore/<topic-slug>/cache/<source>/` as computed, NOT at end of phase. If Vet is interrupted mid-vet, re-running only re-vets un-vetted handles.

## When a source is unavailable

If Reddit or Twitter has no API key, there are no handles from those sources to vet, and that is not a failure. Record the sources that were unavailable so the summary and the terminal output can name them.

## End of Vet

Vet is complete when every handle **within each source's cap** has either: a verdict on disk, or an entry in `experts.csv` (auto-promoted), or was dropped (recorded only in the verdict as `troll`/`spammer`/`promoter` — no entry in experts.csv); and on Twitter, when the deep pass has run over its share of them. Handles below a cut are not pending work — they are recorded in `audit.md` and the run moves on. No marker file.
