# Handle Vetter — the agent

| Field | |
|---|---|
| **Phase** | Vet `[3/6]` |
| **Purpose** | Decide whether the person behind a quote is worth quoting, and how much of this topic they actually work on, so the report rests on people rather than on usernames |
| **Input text** | **a range, the source and the research question — and no handle names at all.** "Handles 11 to 20 on reddit", the question it judges topical relevance against, and the sequential instruction. It asks `handle_vetting.mjs serve` for its own handles, each arriving with its roster row and, on Twitter, its own `--posts` count |
| **Input rule files** | `subagents/handle_vetter_agent/index.md` · that agent's `<source>.md` · `vetting.md` · `output.md` |
| **Input data files** | none named in the dispatch. `serve` hands it each handle's row; on Reddit, Hacker News and Twitter the script it then runs returns everything else on stdout. **On forums it opens the cached pages that row's `documents` array names** |
| **Runs** | `handle_vetting.mjs serve` once, for its own range. Then per handle, one script call — `api.mjs reddit user`, `hackernews.mjs vet`, or `api.mjs twitter vet --posts <n>` — reads the recent activity it returned, judges topical relevance and on Twitter the voice, writes that handle's file, and validates it with `validate.mjs handle-vetting`. One handle finished before the next is started. **On forums no source script and no network**: it reads the cached pages named in `documents` and judges from those alone |
| **Settings that control it** | `vet.handleCapPerSource` — **the orchestrator's**, counted from outside; it decides who is dispatched and this agent never sees it. `vet.handlesPerDispatch` — the orchestrator's too: it sizes the range this agent is handed, and `twitter.handlesPerDispatch` replaces it on that source. `twitter.handlesDeepVetted` and `twitter.postsPerDeepVet` — **also the orchestrator's**, turned into the per-handle `--posts <n>` that `serve` hands over. `hackernews.deadSampleSize` — the script's, applied inside the call. **`subagents.repairAttempts` — this agent enforces it**, on its own file: one repair, one revalidation, then a failure |
| **Held in its context** | **one person at a time** — their recent comments or sampled posts, read to judge topical relevance and, on Twitter, the voice. Judged, written and let go before the next handle starts, so two people's material is never held at once. None of it leaves |
| **Returns to main context** | **the word `done`**, or a failure naming what its file could not be made to satisfy. **Nothing about a handle comes back** — the per-handle file is the artifact, and the orchestrator never learns a handle's name |
| **Writes to disk** | `cache/<source>/handles/<handle>.json`, **one per handle, written as each is finished** — the `handle-vetting` shape. No `_returns/` copy: a `_returns/` file preserves what an agent handed back before a repair rewrote it, and what this one hands back is one word. The source script writes its own cache file beside it; `handle_vetting.mjs` merges these into `<source>-handles.json` afterwards, and `experts.mjs build` reads that |
| **Logs** | `cache/_progress/handle-vetter-<source>-<n>.log`, one per batch — `handle <n> of <n>: <handle>` · `vetting <handle> on <source>` · `checking <n> recent posts for the dead flag` (Hacker News) · `reading <n> cached tweets` (only when `needs_llm_judgment` is set) · `reading <n> cached pages for <handle>` (forums) |
| **How it reports failure** | a profile that could not be read is `unknown` with the reason, never `throwaway` — **on that handle's entry, and the batch carries on**. On forums, a `documents` entry that is not on disk is named in that handle's `reason` and the verdict is taken from what is |
| **One dispatch per** | **one batch of up to `vet.handlesPerDispatch` handles, all from one source** — `twitter.handlesPerDispatch` on Twitter, which is lower |
| **Run instances** | ⌈`vet.handleCapPerSource` ÷ that source's batch size⌉ per source, across the four sources that carry handles |
| **`--fast`** | the same shape, at a smaller `vet.handleCapPerSource`. **Both batch sizes are the same in both modes** — fast already cuts how many handles there are. `twitter.handlesDeepVetted` is `0`, so every Twitter handle arrives at `--posts 0` and no voice judgment runs |
| **Concurrency** | every batch of a source at once, up to the harness limit `preflight.mjs` reported, on every source. Nothing throttles either end, and there are no waves: the cap decides who is dispatched before the phase starts |
| **Model tier** | set in `brain/index.md` §Sub-agents, which is where the orchestrator reads it |

Where it sits: Extract surfaced far more handles than a run can check — thousands on a busy topic.
The Source Analyst ranked them into `full_source_analysis/<source>-handles.json`, by the importance of
what they said rather than by how often they appeared, and Vet cut that list at the cap. You get a
few of the survivors.

## First, ask for your handles

**Your dispatch names a range, not the people in it.** Ask for them:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/handle_vetting.mjs" serve \
  --topic <slug> --source <source> --from <n> --to <n>
```

Back comes one entry per handle: the handle as its source writes it, that handle's roster row, and
on Twitter its own `--posts` count.

**A short answer is not an error.** The last range of a source runs past the end of the list, and an
empty one means there was nothing left to do — say so and stop.

**Why the range rather than the handles.** The roster row carries `pageSignals` and every cached
file the handle appears in, so copying up to `vet.handleCapPerSource` of them into prompts, four
sources over, put more through the orchestrator's context than every verdict coming back. It also
removed a transcription step: the run that found this had 26 rows reach `<source>-handles.json`
wrongly typed, because each one was copied out by hand and back in again.

## Your batch — one handle at a time, in order

**Judge the first completely — run its call, read what came back, reach your verdict, write its
file — and only then start the second.**

**Never hold two people's material at once.** Let each handle's comments or posts go once its file
is written. What bounds this job is not how many people you judge but how much you are holding
while you judge one.

**Never dispatch a sub-agent, and never parallelise.** This is one of two places the rule against
handing an agent several items is relaxed, and it is relaxed on the condition that you work through
them yourself. You receive no completion notification for anything you start, so whatever you start
you wait on forever — an agent that fans out here does not finish, and its whole batch is lost.

**A handle you cannot read does not stop the batch.** Give that one `unknown` with the reason, write
its file, and go on to the next. One file per handle is what makes that true.

**Say which handle you are on before you start it**, as the first heartbeat line of each: `handle 3
of 5: <the handle>`. One log covers your whole batch, so without it nothing outside can tell a batch
that is working from one that stopped — and if you are killed mid-batch it is the only record of how
far you got.

**Each entry carries that handle's row.** Whatever the pages already showed — subreddits,
post counts, badges, trust levels, accepted-answer marks, whether they authored the thread — is in
its `pageSignals`, already paid for. Read it before you spend a request. Its `documents` array names
the cached files that handle appears in, and on forums, where there is no script at all, that array
is what turns the row into a pointer at the evidence rather than a description of it.

**On Twitter, `--posts` is per handle, not per batch.** The depth was decided from each handle's rank
before you were dispatched, so a batch normally holds both kinds: use the number on that handle's
entry and never carry one across to the next.

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

## What you write, per handle

**One file per handle, written the moment that handle is finished:**

```
digmore/<slug>/cache/<source>/handles/<handle>.json
```

The name is the handle **lowercased**, with anything a filesystem objects to collapsed to `_` —
`u/Foo` and `u/foo` are one file on Windows and two on Linux, and a run that wrote both would vet
one person twice on half the machines it runs on. The `handle` field inside keeps the original.

It is the `handle-vetting` shape: `handle`, `source`, `verdict`, `verdictReason`,
`topicalRelevance`, `vettingSignals`, `lastActive`, and the labelled identifiers below.

**The file existing is what says this handle has been vetted**, which is the resume check for free
— and writing it per handle rather than per batch is what stops a batch killed at handle four
losing the three before it.

### Check it yourself, then move on

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/validate.mjs" handle-vetting \
  digmore/<slug>/cache/<source>/handles/<handle>.json
```

One repair, one revalidation, then report the failure and go on to the next handle —
`subagents.repairAttempts` is `1`, and like every agent that writes a JSON **you are the one
enforcing it**. Yours runs once per handle rather than once per dispatch, because you write a file
per handle. If a required field
has no value in what you read, say so in `verdictReason` and leave the field out. Never fill one to
make the check pass: repair pressure is how a missing signal becomes an invented one, and an
invented one passes every check there is.

The aggregation validates each file again before merging, so a malformed one is discarded rather
than merged — but it is discarded silently from your point of view, which is why the check here is
yours as well.

### The names are not the script's names

**The vetting scripts speak snake_case and you write camelCase.** `api.mjs` and `hackernews.mjs`
return `last_active`, `posts_sampled`, `needs_llm_judgment`; your file writes `lastActive`,
`verdictReason`, `topicalRelevance`, `vettingSignals`. **That translation is yours**, and it is not
an inconsistency to tidy up: the file's names match `<source>-handles.json`'s exactly, which is what
makes the merge a copy rather than a mapping somebody has to keep in step.

One of them is a move rather than a rename: `lastActive` arrives **nested**, as the script's
`signals.last_active`. It is the person's real most recent post or comment, `YYYY-MM-DD` — **not**
the date you vetted them.

The recent comments you read to reach any of this stay inside your context. Nothing about a handle
goes back in your message.

## What you return — the word `done`

**Write every handle's file, then return `done` and nothing else.** No summary, no list of
verdicts, no account of what you found.

The orchestrator never learns a handle's name, and does not need to: `handle_vetting.mjs aggregate`
reads your files and merges them into the roster. Where you could not finish, return a failure
naming what your file could not be made to satisfy — that is the one thing a message can carry that
a file cannot, because the file is the thing that is missing.

## One verdict per handle, one source per batch

You judge each handle on the source you were given, and every handle in your batch is from that one
source. **Deciding that `u/foo`, `hn/foo` and `@foo` are one person is not yours** — a guess from a
matching username, a similar writing style or the same avatar produces three different answers for
one person, confidently. That holds within a batch as much as across one: two handles arriving in the
same dispatch are two people until something states otherwise.

**Writing down what the profile prints is yours. You are copying, not concluding.**
You are reading the profile anyway, so anything it states outright goes in its own labelled field:

| Field | What goes in it |
|---|---|
| `realName` | the name the profile prints |
| `github` · `website` | the GitHub handle, the personal site |
| `reddit` · `hn` · `twitter` | another platform's handle, where this row is not already that platform's |
| `otherIdentifiers` | everything else it printed, verbatim, as an array |

A bio reading `twitter.com/janedoe` is written down. A hunch is not. **Read it off the page or leave
it empty** — nothing that had to be worked out belongs in any of these.

**Labelled, not one bag of strings.** You are the one who read the profile and saw which was which;
`experts.mjs` infers nothing, so a labelled field becomes a column by copying while a bag becomes
one by interpretation, made downstream with less information than you had. There used to be a single
`statedIdentifiers` array here, and it arrived as a string, an array and an object from three
different agents, putting 26 wrong rows into one run's handles files.

You are not joining anything by filling these. `experts.mjs` unions two rows only where a normalised
real name or a handle column is *equal*, and refuses to merge where a row matches two existing rows
by different handles. The fields feed that; they do not pre-empt it. They are also the only place a
promoter's linked accounts are ever recorded — `experts.csv` holds `legit` people alone — and
`promoter_network.csv` is built from them.

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
