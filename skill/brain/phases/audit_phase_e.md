# Audit

Print `[5/5] Audit` when this phase starts (`../reporting.md`).

Verifier posture: **default to `manual-verify-required` if uncertain.** Verification must be active confirmation, not absence of doubt.

## 0. Did we answer what was asked

Run this first, before ranking anything. Everything after it checks whether the claims are *true*; nothing else in this phase checks whether the report is *what the user wanted*. A run can pass all fifty verifications and still hand back the wrong deliverable.

Dispatch one sub-agent with **no context from this run** — not the drafter, not the critic, and given only two things: the user's original request (`research_plan.json.originating_prompt`) and the finished summary. Ask it:

> Read this request, then read this report. For each thing the request asks for, is it here, and is it usable as asked? Answer per item, quoting the part of the report that serves it. If something is named but not usable in the form requested — a list whose entries cannot be reached, a comparison with nothing to compare, a "who" question answered without naming anyone — say so.

A fresh context is the point. The drafter cannot see this failure, because it knows what it meant. Reading the report cold is the only way to notice that twelve communities were named and none of them can be visited.

Cross-check against `research_plan.json.scope.deliverables`: every enumeration declared in Plan has a section, and every section's entries match its CSV row set (`synthesize_phase_d.md` §3.6).

What comes back:

- **Something asked for is missing or unusable** → fix it now if the data is already on disk, which is the common case: the rows exist and the section never rendered them. Re-render and move on.
- **Fixing it needs research the run did not do** → record it in `audit.md` as `unanswered`, and name it in Issues. Never quietly ship a report that does not answer its own question.

## 1. Rank

Rank all claims in the summary by `importance × source-quality`. Importance is primary; source quality is the tiebreaker.

- Importance comes from the Source extractor schema (`central` / `supporting` / `tangential` → 3 / 2 / 1).
- Source quality from `../vetting.md` (`primary-3p`=5, `primary-self`=4, `secondary`=3, `blog`=2, `forum`=1, `unreliable`=0). `internal` — a document the user handed over — scores 4: it sits outside the public ranking in `../vetting.md`, and this number exists only so a claim from the user's own files can be ranked into the top 50 rather than dropping out of the audit entirely.

## 2. Verify the top 50

Dispatch one Verifier sub-agent per top-50 claim, per `../subagents/dispatch_structured_subagent.md`. The sub-agent returns the Verifier schema (see `../../scripts/subagent_returns.json`): `{verdict, evidence, refuted?, counterSource?}`.

For each claim, the Verifier must:
- Confirm the URL still resolves and the cited content matches the claim. Use `fetch.mjs` (not `WebFetch`) for any URL likely to be long-form.
- Confirm the quote source's handle is in `experts.csv`.
- If anything is ambiguous (paywalled URL, dead link, content changed, ambiguous match) → return `manual-verify-required` with the reason.
- If the claim is contradicted by another source, is marketing fluff, or the source quality is too weak for the claim's strength → return `refuted` with the kill reason and (when available) the counter-source URL.

Lower-ranked claims (everything outside the top 50) pass through with their existing source-quality tag, no deep check. **This is a real bound on what "verified" means here, and the report must not imply otherwise:** the top 50 claims are checked against their sources; the rest carry their source-quality tag and nothing more.

A claim sourced to a document the user handed over is verified against that file on disk, not over the network. See `../subagents/page_analyst_agent/local.md`.

## 3. Annotate the summary

For each Verifier verdict, edit the summary:

- `verified` → no change.
- `manual-verify-required` → append inline `<!-- AUDIT: please manually verify — <reason> -->` directly next to the claim (subject to the 15-per-run cap below).
- `refuted` → move the claim out of its main section into the "Refuted / unsubstantiated" section, with the kill reason and the original source URL.

## 4. Cap on `manual-verify-required`: 15 per run

If more than 15 claims would be flagged, keep the 15 with highest `importance × source-quality`. The rest are auto-tagged `low-confidence-unverified` in `audit.md` but stay in their original sections without the inline AUDIT annotation.

Reason: prevents the summary from being papered with manual-verify flags the user can't realistically chase.

## 5. Write `audit.md`

Per-claim verdict log. Replace the file entirely (not append) — see "Re-run behavior" below.

Sections:
- **Unanswered** — from §0: anything the request asked for that the report does not deliver, or delivers in an unusable form. One line each: what was asked, what is there instead, and why it was not fixed in this run. Empty is the expected state; an entry here is the run telling the user it fell short of its own brief.
- **Verdicts** — one line per top-50 claim: `verdict: <verified | url-broken | content-changed | uncited | manual-verify-required | low-confidence-unverified | refuted>`, the claim text, the source URL, and the `importance × source-quality` score that placed it in the top 50.
- **Verification ranking** — which 50 claims got the deep check, in rank order, with their scores.
- **Assumptions made without the user** — anything decided on the user's behalf in auto mode, or under uncertainty in either mode: one line each, what was assumed and what it changed. No questions here; see `../reporting.md` §"Questions for the user".
- **Synthesize critic-pass known-gaps** — gaps the critic surfaced that Synthesize didn't close cheaply.
- **Dropped-for-budget URLs** — per branch, from the fetch cap: the candidates that lost their place, and any document the budget cut short mid-pagination with the pages read and the fact that more existed.
- **URL duplicates** — URLs encountered across multiple sources.
- **Unavailable sources** — any source skipped for want of an API key, named plainly. A source that was never queried is not a source that came back empty, and the difference belongs in the record.
- **Sub-agent output repairs and drops** — how many returned payloads failed their shape check, how many passed after the one repair attempt, and every item dropped because it still failed, with the checker's error. A shape failing on most returns is a broken dispatch prompt rather than bad luck, and that only shows in the counts. See `../../scripts/subagent_returns.json` §"Checking what comes back".
- **Sub-agent dispatches** — how many were dispatched this run, split by kind: branch searchers, URL readers, vetting judgments, verifiers, review passes. Nothing is capped on this number; it is recorded because a run's real cost is only knowable after the fact, and an estimate is not a measurement.

## Re-run behavior

On every re-run that reaches Audit, BEFORE writing any verification artifacts:

1. Strip ALL existing `<!-- AUDIT: ... -->` comments from the summary.
2. Re-emit AUDIT comments only for claims this run still couldn't verify (capped at 15).
3. Replace `audit.md` entirely with this run's verdict log (not append).

Reason: a URL that was dead last run may now resolve; a quote that drifted may have re-stabilized. Stale AUDIT comments mislead the user into chasing already-resolved problems.

## 6. Update confidence tags

After verification, downgrade confidence tags on findings where verification weakened the evidence:
- `manual-verify-required` or `low-confidence-unverified` → `low`.
- `refuted` claims are no longer in the main sections; no tag needed (they're in "Refuted / unsubstantiated" with a kill reason instead).

See `../vetting.md` §"Confidence tag rule" for the base tagging.

## End of Audit

Audit is complete when:
- `audit.md` exists for this run.
- The summary has no `<!-- AUDIT-INCOMPLETE -->` marker.
- Every top-50 claim has a verdict recorded.

The summary's Run footer is written now, per `../reporting.md` §"The Run footer".
