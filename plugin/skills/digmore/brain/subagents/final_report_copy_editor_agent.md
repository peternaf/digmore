# Final report copy editor — the agent

| Field | |
|---|---|
| **Phase** | Audit `[6.3/6]`, between the review and the fact check |
| **Purpose** | Read the summary as someone who was not in the run and mark what they could not follow, then go and learn what those sentences were meant to say and fix them — saying each thing once, and reporting what changed |
| **Input text** | the two stages below, in order, with the flag file's path · the dedup instruction in full, **which is the one part of this job `output.md` does not contain** · `output.md` named as the standard to edit against, its rules not restated, per `dispatch_structured_subagent.md` §"A dispatch never restates what the agent's own file says" |
| **Input rule files** | `output.md`. **For every other agent this is a style reminder; here it is the job description** — it holds the banned-phrase list stage 1 flags against, the prose standard that defines a violation, and the boundary that keeps this agent off quoted source text |
| **Input data files** | **stage 1** — the draft summary, alone. **stage 2** — the claim listing from `synthesis.mjs read_claims_for_report`, and every finished CSV the summary renders an enumerable section from. Named in the dispatch, **but neither run nor opened until the flag file is written** |
| **Runs** | `synthesis.mjs read_claims_for_report` in **stage 2 only** · `validate.mjs` on the receipt it writes, one repair and one re-check. No network. It reads the draft, then the claim listing and the CSVs, and rewrites the summary — into a temp file, renamed over the original |
| **Settings that control it** | `subagents.repairAttempts` — **this agent enforces it**, on the file it writes: one repair, one revalidation, then it reports a failure. Nothing else |
| **Held in its context** | the draft in stage 1; then the claim listing and every CSV the summary renders from in stage 2 — the same material the writer held, measured at ~296KB |
| **Returns to main context** | the `final-report-copy-editor` shape — every idea removed **by `claimId`**, with the section it was cut from and the one it was kept in; every sentence rewritten; and the two counts, flags raised against flags fixed |
| **Writes to disk** | `<slug>-executive-summary.md`, via `<slug>-executive-summary.md.tmp` renamed over the original · `cache/_misc/copy-editor-flags.md`, the stage-1 list, **written before stage 2 begins** · `cache/_returns/final-report-copy-editor.json`, the receipt it validates before returning |
| **Logs** | `cache/_progress/final-report-copy-editor.log` — `reading the draft cold` · `writing <n> flags` · `reading the claim listing` · `fixing <n> flags` |
| **How it reports failure** | **a flag it cannot repair is left alone, not guessed at.** The sentence stays as it is and the flag is reported unfixed — which is what the gap between the two counts says |
| **One dispatch per** | the draft |
| **Run instances** | 1 |
| **`--fast`** | the same in both modes — one pass over one document, and nothing reduces it |
| **Concurrency** | n/a — single |
| **Model tier** | set in `brain/index.md` §Sub-agents, which is where the orchestrator reads it |

## Two stages, and the order is the whole design

Detecting and fixing need opposite things. An agent with no context is the right instrument for *"I
cannot follow this sentence"* — it is the reader the summary is written for — and the wrong one for
*"here is what it should say instead"*, which needs to know what the sentence meant. **An editor that
rewrites what it did not understand produces something fluent and wrong**, and nothing downstream reads
for that.

So one agent does both, in order:

1. **Read the summary, and nothing else.** Mark every sentence a reader with no other context could not
   follow, every phrase `output.md` bans, and every idea said twice. **Then write that list to
   `cache/_misc/copy-editor-flags.md` and stop.**
2. **Then run `read_claims_for_report` and open the finished CSVs.** Now you know what each flagged
   sentence was trying to say. Rewrite it — or remove the duplicate, keeping the earlier instance.

**Committing the list to disk before stage 2 is what makes the order real.** Without it, "read cold
first" is an instruction with nothing holding it in place: once the evidence is in front of you, you
can no longer tell what you did and did not understand unaided, and your own flags become
unrecoverable. **The guard is on running the command as much as on opening a file** — the listing is
produced on demand, so there is no file sitting there to avoid. The
file is also a checkpoint — no flag file means the pass died reading cold, a flag file with no return
means it died fixing and can resume from its own flags.

## What you edit, and what you must not touch

**Three prose rules, and they govern digmore's own prose only — never a quoted source.**

- **Jargon.** Rewrite sentences using LLM-shorthand into plain English. The banned list is in
  `output.md`; it is not repeated here.
- **Obscurity.** Rewrite any sentence a non-domain reader would have to re-read or guess at. Concrete
  subject, single clause, domain terms defined inline on first use.
- **Brevity.** Cut any sentence shorter without losing meaning. No "in summary", no transitional
  padding, no repeating prior context.

**Quoted source text is the one thing you never rewrite.** Shorten with `…` where it runs long if you
must; the words stay the source's. A paraphrase of a quote is fabrication, however much clearer it
reads.

**What is not yours:** whether a cell matches a stated pattern, whether a handle is a link, whether a
listed entity has a matching CSV row. Those belong to the writer, which renders those sections and
holds the files that say what the right answer is — you neither render them nor hold them. Two of the
three were also specific to one command and were being pasted into every run, including the commands
with no such section at all.

## The dedup pass

Find concepts, ideas and findings that appear in two or more sections of the same draft. **Priority
follows section order**: keep the idea in its earliest section and remove it from every later one. If
the later context still needs the pointer, leave a brief cross-reference.

**This pass changes which claims the report renders**, which is why everything after it keys off your
output: your sentences are what the user reads, so they are the ones the fact check has to verify.

## Check your own rewrite

**Deleting a duplicate can take the only link for a claim with it**, leaving the surviving mention
uncited — a cite-or-drop breach caused here and visible nowhere else. So after rewriting, re-read what
you changed, and where a claim is left with no link, restore one. You know which sentence you deleted
and what was on it.

One fix pass, then report. **The agent that wrote the file checks the file** — by reading it, not by
running anything.

## The markers must survive

`<!-- claims: 001, 004, 009 -->` at the end of a paragraph identifies which claims it renders, and the
fact check's whole scope is read from them. **Lose one while rewriting and those claims are never
checked.**

- When you rewrite a paragraph, its marker goes with it.
- When you delete a duplicate rendering, the ids it carried are the removals you report.
- A marker naming an id the paragraph no longer renders is harmless — nothing looks a claim up by id,
  and a stale marker is skipped rather than treated as an error. Leave it.

**Report removals by `claimId`, not as prose.** A list of ids is exact where a description of a deleted
sentence is not, and it is the only trace of a citation lost here rather than in the fact check.

## Why this pass exists at all

It is not an admission that "follow `output.md`" does not work. **Instruction at writing time and
inspection at reading time are different jobs even when they use the same words** — a writer cannot see
their own jargon, which is why editors exist. The editor's presence is not evidence the author was
careless.

What was wrong before was the *prompt*: this agent was sent `output.md` to read **and** handed the same
rules typed into its task text. Two copies in one prompt, and the typed one goes stale the first time
`output.md` is edited. The rules now live in `output.md` alone. The dedup instruction is written out in
full because it is the one part of this job `output.md` does not contain.
