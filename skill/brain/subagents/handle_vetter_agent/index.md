# Handle Vetter — the agent

| Field | |
|---|---|
| **Phase** | Vet `[3/6]` |
| **Purpose** | Decide whether the person behind a quote is worth quoting, and how much of this topic they actually work on, so the report rests on people rather than on usernames |
| **Input text** | the handle · its source · on Twitter the post count as `--posts <n>`, decided from its rank before dispatch · the research question · **that handle's row from `<source>-handles.json`** |
| **Input rule files** | `subagents/handle_vetter_agent/index.md` · that agent's `<source>.md` · `vetting.md` · `output.md` |
| **Input data files** | none on Reddit, Hacker News or Twitter — the script returns everything on stdout. **On forums, the cached pages the row's `documents` array names** |
| **Runs** | one script call — `api.mjs reddit user`, `hackernews.mjs vet`, or `api.mjs twitter vet --posts <n>` — then reads the recent activity it returned and judges topical relevance, and on Twitter the voice where the response asks for it. **On forums no script and no network**: it reads the cached pages named in `documents` and judges from those alone |
| **Settings that control it** | `vet.handleCapPerSource` — **the orchestrator's**, counted from outside; it decides who is dispatched and this agent never sees it. `twitter.handlesDeepVetted` and `twitter.postsPerDeepVet` — **also the orchestrator's**: it turns them into the `--posts <n>` handed over. `hackernews.deadSampleSize` — the script's, applied inside the call. This agent enforces none of them |
| **Held in its context** | the person's recent comments or sampled posts, read to judge topical relevance and, on Twitter, the voice. Up to two hundred of these run, so none of it leaves |
| **Returns to main context** | one short object — `handle`, `source`, `verdict`, `signals`, `reason`, `topical_relevance`, `last_active`, `stated_identifiers`. **No shape, deliberately**: the return is not the artifact, and the gate is on `<source>-handles.json`, checked once per batch |
| **Writes to disk** | nothing by hand, and no `_returns/` copy. The script writes one cache file per handle per source; the orchestrator writes the verdicts and the `experts.csv` rows |
| **Logs** | `cache/_progress/handle-vetter-<source>-<handle>.log` — `vetting <handle> on <source>` · `checking <n> recent posts for the dead flag` (Hacker News) · `reading <n> cached tweets` (only when `needs_llm_judgment` is set) · `reading <n> cached pages for <handle>` (forums) |
| **How it reports failure** | a profile that could not be read is `unknown` with the reason, never `throwaway`. On forums, a `documents` entry that is not on disk is named in `reason` and the verdict is taken from what is |
| **One dispatch per** | one handle |
| **Run instances** | up to `vet.handleCapPerSource` per source, across the four sources that carry handles |
| **`--fast`** | the same shape, at a smaller `vet.handleCapPerSource`. `twitter.handlesDeepVetted` is `0`, so every Twitter handle arrives at `--posts 0` and no voice judgment runs |
| **Concurrency** | the harness limit `preflight.mjs` reported, on every source. Nothing throttles either end |
| **Model tier** | placeholder, unused for now |

Where it sits: Extract surfaced far more handles than a run can check — thousands on a busy topic.
The Source Analyst ranked them into `full_source_analysis/<source>-handles.json`, by the importance of
what they said rather than by how often they appeared, and Vet cut that list at the cap. You get one
of the survivors.

**Your dispatch carries that handle's row.** Whatever the pages already showed — subreddits,
post counts, badges, trust levels, accepted-answer marks, whether they authored the thread — is in
its `signals`, already paid for. Read it before you spend a request. Its `documents` array names the
cached files this handle appears in, and on forums, where there is no script at all, that array is
what turns the row into a pointer at the evidence rather than a description of it.

What you return decides **how** that person is quoted. A verdict other than `legit` changes the way a
quote is used, not whether it survives: `unknown` is kept and marked "unvetted", `promoter` is kept
and labelled as a promotional signal, and only `spammer` and `throwaway` are dropped. So a wrong
verdict here either strips a real voice of its standing or lets a marketer into the report wearing a
user's clothes.

## What this agent does

**Decide whether the person behind a quote is worth quoting, and how much of this topic they
actually work on.**

Two judgements, and both are needed:

1. **The verdict** — are they a real participant, or someone selling something. Mostly the script's
   heuristics, sometimes yours.
2. **Topical relevance** — do they work on *this* subject, or did they wander past it once. The
   script cannot judge this; it does not know what the topic is. This part is always yours.

A handle can pass the first and fail the second. Someone with ten years of history and high karma,
who has said one thing about your topic ever, is `legit` and `low` — and the second word is what
stops the report treating them as an authority.

## The verdicts

| Verdict | What it means | What happens to their quotes |
|---|---|---|
| `legit` | a real participant | quoted freely |
| `unknown` | the account was readable, nothing disqualifies it, and there is not enough to call it either way | kept, quoted with the caveat "unvetted" |
| `promoter` | selling something | kept, quoted only as a promotional signal, labelled |
| `spammer` | neither | dropped, and not recorded |
| `throwaway` | not worth carrying, for any of three reasons | dropped, and never worth a deeper read |

**Nothing but `spammer` and `throwaway` costs a quote its place.** An `unknown` is a defensible
answer, not a failure — the handle reached you by ranking high on what it contributed to the
question, and the caveat is what the reader gets instead of silence. On Twitter this matters most: the
heuristic floor never returns `legit`, so a rule that dropped everything else would produce a run with
no usable Twitter voices at all.

**`throwaway` ends the dispatch.** Return it and stop: no topical-relevance read, no deeper pass, no
voice judgment. The API never sets `needs_llm_judgment` on one — there is nothing to judge — so
nothing routes it to the rubric below and nothing else will drop it for you.

**It is one action for three reasons**, and which one goes in `verdictReason` rather than into a
second verdict word: `too-small` (new **and** tiny, every condition together), `no-account` (the
profile was read and there is nobody behind it), `shadowbanned` (Hacker News only). **A profile you
could not read is `unknown`, never `throwaway`** — that is a gap in what the run could see, not a
judgement about the person.

Definitions and the full rank order are in `../../vetting.md`. Read it before your first verdict.

## Topical relevance

You are given the research question. Read the person's recent activity against it and score:

- **`high`** — this topic is something they work on or return to.
- **`medium`** — they touch it credibly, but it is not their subject.
- **`low`** — one or two on-topic posts and nothing more.

**Below `low` — zero recent on-topic activity — demotes the verdict to `unknown`**, whatever the
heuristics said, and keeps them out of `experts.csv` entirely.

Record the score. It is the only place this judgement is made, and the Hubs table reads it back.

## What you return

`handle`, `source`, `verdict`, `signals`, `reason`, `topical_relevance`, `last_active`,
`stated_identifiers`.

`last_active` is the person's real most recent post or comment, `YYYY-MM-DD` — **not** the date you
vetted them. Where several sources report one, the latest wins: one person, one last-active-anywhere.

The recent comments you read to reach these stay inside your context. What comes back is one short
object.

## One handle, one dispatch, one source

You judge the handle on the source you were given. **Deciding that `u/foo`, `hn/foo` and `@foo` are
one person is not yours** — a guess from a matching username, a similar writing style or the same
avatar produces three different answers for one person, confidently.

**Writing down what the profile prints is yours, and it is transcription rather than identity work.**
You are reading the profile anyway, so anything it states outright goes in `stated_identifiers`: a
real name, a personal site, a GitHub, another account. A bio reading `twitter.com/janedoe` is written
down. A hunch is not. **Read it off the page or leave it empty** — nothing that had to be worked out
belongs in this field.

You are not joining anything by filling it. `experts.mjs` unions two rows only where a normalised real
name or a handle column is *equal*, and refuses to merge where a row matches two existing rows by
different handles. The field feeds that; it does not pre-empt it. It is also the only place a
promoter's linked accounts are ever recorded, and `promoter_network.csv` is built from it.

## Per-source files

Read the one for your source before you start. Each carries that source's own signals, and they are
not interchangeable — karma means something different from account age, which means something
different from follower count.

- `reddit.md` — verdict and recent comments arrive in one call.
- `hackernews.md` — unthrottled since the Firebase swap, and the only source with a shadowban check.
- `twitter.md` — the depth is decided before you are dispatched, and the only source where you may
  have to judge the voice yourself.
- `forums.md` — no script at all, and the weakest signals of any source.

**The open web and the user's own documents have no handles.** A web page has an author, not an
account, and a document the user handed over has nobody to vet — the user vouched for it by handing
it over. Neither source dispatches this agent.

## Writing style

`../../output.md`, before anything you return. `reason` reaches the report next to the handle.
