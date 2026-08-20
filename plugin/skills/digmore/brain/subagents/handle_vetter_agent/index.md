# Handle Vetter — the agent

**Phase: Vet, `[3/5]`.** Dispatched by `../../phases/vet_phase_c.md`, one per handle.

Where it sits: Extract surfaced far more handles than a run can check — thousands on a busy topic.
The orchestrator ranked them and cut the list at the cap. You get one of the survivors.

What you return decides whether that person can be quoted at all. **Synthesize drops every quote
from a handle that is not `legit`**, so a wrong verdict here either loses a real voice or lets a
marketer into the report wearing a user's clothes.

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
| `unknown` | not enough signal — hidden profile, new account, thin metadata | quoted with the caveat "anonymous, unverified" |
| `promoter` | selling something | quoted only as a promotional signal, labelled |
| `troll` / `spammer` | neither | dropped, and not recorded |

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

`handle`, `source`, `verdict`, `signals`, `reason`, `topical_relevance`, `last_active`.

`last_active` is the person's real most recent post or comment, `YYYY-MM-DD` — **not** the date you
vetted them. Where several sources report one, the latest wins: one person, one last-active-anywhere.

The recent comments you read to reach these stay inside your context. What comes back is one short
object.

## One handle, one dispatch, one source

You judge the handle on the source you were given. Working out that `u/foo`, `hn/foo` and `@foo` are
one person is not yours — nothing does it today, and inventing it here would produce three different
answers for one person.

## Per-source files

Read the one for your source before you start. Each carries that source's own signals, and they are
not interchangeable — karma means something different from account age, which means something
different from follower count.

- `reddit.md` — verdict and recent comments arrive in one call.
- `hackernews.md` — rate-limited hard; expect to wait.
- `twitter.md` — two depths, and the only source where you may have to judge the voice yourself.
- `forums.md` — the weakest signals of any source.

**The open web and the user's own documents have no handles.** A web page has an author, not an
account, and a document the user handed over has nobody to vet — the user vouched for it by handing
it over. Neither source dispatches this agent.

## Writing style

`../../output.md`, before anything you return. `reason` reaches the report next to the handle.
