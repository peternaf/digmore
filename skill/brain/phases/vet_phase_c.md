# Vet

Print `[3/5] Vet` when this phase starts (`../reporting.md`).

**This is the longest silent stretch of a run, so say how long once and then count.** Hacker News allows one request every 15 seconds and vetting a handle costs two or three, so 50 handles is roughly 12 minutes on that source alone — and two topics vetting at once queue against the same limit. State the count and the reason on the marker, then reprint it with a running count. A phase that goes quiet for forty minutes reads as a hang, and a run that thinks it has hung starts narrating instead of working.

**Vet in batches of about ten handles, one Bash call each.** A command's output reaches you only when it returns, so a single call covering every handle is a stretch of time in which nothing can be printed and nothing can be judged — the count above becomes impossible, and a stall is indistinguishable from work. Between batches you print the count and can stop early if the verdicts are coming back useless.

**Hacker News works through its handles one at a time; put other work beside it, never more Hacker News.** Reddit and Twitter go through digmore's API and share no limit with it, so their handles cost nothing extra while HN waits. Synthesize's per-player enrichment (`synthesize_phase_d.md` §3.5) can also start here: it reads the entities Extract found and needs no verdict. The HN loop holds the shell, so the rest goes to sub-agents.

For every handle seen in Extract, run `vet_user` (or the source equivalent). Read `../vetting.md` for the verdict schema and how cross-source identity / experts.csv inheritance work. Read `../subagents/handle_vetter_agent/<source>.md` for source-specific signals.

## The handle cap — rank first, then cut

Extract surfaces far more handles than a run can vet — thousands on a busy topic. Vetting each one costs two or three requests, and vetting is about half of a run's network traffic.

So Vet is bounded, and the bound is applied **after ranking, never by taking whatever came first**:

1. Collect every distinct handle observed in Extract.
2. Rank them by relevance to the research question:
   - **How often they appeared**, across how many different branches. Someone surfacing in three branches is more central to the question than someone who appeared once.
   - **How on-topic the material was** where they appeared — an author of a thread that answers the question directly outranks a passing commenter in a tangential one.
   - **Engagement on what they wrote** — score, karma, upvotes — as the tiebreaker, never the lead. A popular off-topic comment is still off-topic.
3. Vet down the ranked list until the cap is reached.
4. Record in `audit.md`: how many distinct handles were found, how many were vetted, and that the rest were below the cut. A run that vetted 50 of 3,000 has not surveyed the community, and the summary must not read as though it had.

The cap is `vetHandleCap` in `~/.digmore/settings.json`, **50** by default. Read it at the start of the run. `--fast` uses 20 (`../modes.md`); if the configured number is lower than that, the lower one wins in both modes.

## Flow

1. Take the ranked, capped handle list from above (post authors, comment authors, mentioned handles).
2. For each handle, check if it matches a row in the topic's `experts.csv`. If yes, auto-promote to `legit` without behavioral vetting. Skip the script call.
3. For unmatched handles, dispatch the source's vetting CLI. On Reddit that is `api.mjs reddit user <name> --topic <slug>` — one call returns the verdict and the snapshot together. Twitter keeps `api.mjs twitter vet <handle> --tier <n>`, because the tier decides how many tweets are bought and that stays an explicit choice. `--topic <slug>` is mandatory on every call, and the scripts refuse to run without it.
4. Layer the topical-relevance check (see `../vetting.md` §"Topical relevance — caller responsibility") on top of the script's verdict. A handle that the heuristic returns `legit` for is still demoted to `unknown` if they have zero recent on-topic activity. On Reddit the inputs for this arrive in the same response as the verdict — `recent_comments`, each carrying its own body and subreddit — so step 3 has already fetched everything this step needs.
5. Append newly identified experts (final verdict `legit` AND on-topic) to `experts.csv` via `experts.mjs add`, passing `--last-active` when the source reported one and `--topical-relevance` with the reading step 4 took. Step 4 is the only place that judgement exists; without the flag it is made and thrown away.
6. Drop charlatans / promoters / spammers — do NOT store them.

There is nothing to vet on the local source: a document the user handed over has no handle behind it. See `../subagents/page_analyst_agent/local.md`.

## Twitter — tiered vetting

Twitter vetting is tiered by depth, and each tier costs more time and more of the run's handle budget:

- Tier 0 — already in `experts.csv` from another source; treated as `legit`. No request at all.
- Tier 1 — profile only.
- Tier 2 — profile + 25 sampled recent tweets.
- Tier 3 — profile + 100 recent tweets. Reserved for Synthesize anchor candidates.

Rules:
- Defer vetting until a handle appears at least twice across Extract's data.
- Escalate one tier at a time only when the current tier is ambiguous.
- Mode discipline applies: in manual mode prompt the user above the per-tier threshold; in auto mode, the threshold becomes a hard cap. See `../modes.md`.

Each tier caches separately, so escalating from Tier 1 to Tier 2 fetches the deeper data rather than re-reading the shallow answer.

## LLM judgment for Twitter `unknown`

The heuristic floor never returns `legit` — only confident negatives (`spammer` / `promoter`) or `unknown`.

**The vet response says when judgment is needed: `needs_llm_judgment: true`.** Read the flag; do not re-derive it from the verdict and the tier. It is true exactly when the verdict is `unknown` and tweets were sampled, and the rule belongs to whatever produced the verdict rather than to you.

When it is set, dispatch a sub-agent per `../subagents/dispatch_structured_subagent.md` that reads the cached tweets and classifies the voice per the rubric: real expert / marketer / content-seller / agenda-pusher. Map the result to the shared verdict schema. The judgment is always the plugin's to make — nothing upstream makes it.

## Incremental persistence

Vetting verdicts persist per-handle to `digmore/<topic-slug>/cache/<source>/` as computed, NOT at end of phase. If Vet is interrupted mid-vet, re-running only re-vets un-vetted handles.

## When a source is unavailable

If Reddit or Twitter has no API key, there are no handles from those sources to vet, and that is not a failure. Record the sources that were unavailable so the summary and the terminal output can name them.

## End of Vet

Vet is complete when every distinct handle from Extract has either: a verdict on disk, or an entry in `experts.csv` (auto-promoted), or was dropped (recorded only in the verdict as `troll`/`spammer`/`promoter` — no entry in experts.csv). No marker file.
