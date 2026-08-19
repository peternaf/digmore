# Synthesize

Print `[4/5] Synthesize` when this phase starts (`../reporting.md`).

Inputs: Extract's structured claims (from the Search Source extractors) + Source notes free-flow source notes + Vet's `experts.csv`.

Outputs (written incrementally):
- `digmore/<topic-slug>/raw_research_outcomes.md` — LLM-facing index of structured claims.
- `digmore/<topic-slug>/players.csv` — full player matrix. Columns and the player-inclusion test are command-specific (see the command's reference file).
- the summary — user-facing, named per `index.md` §"Where a run writes". Sections are command-specific.

Re-read `../output.md` before writing any output. Read `../vetting.md` for the verdict schema and the confidence-tag rule.

## 1. Filter

Re-pass Extract's datapoints. Drop low-quality:
- Quotes from handles whose final verdict (after the topical-relevance layer) is not `legit` are dropped, except `promoter` quotes used explicitly as promotional signals.
- Sources tagged `unreliable` are dropped.
- Sources tagged `forum` from `unknown` handles are dropped.

**Carryover revalidation.** When the topic was branched from a sibling (`research_plan.json.parent_slug` is set), every player or expert pulled from the sibling's CSVs must re-pass the new topic's inclusion test (see the command's "Who counts as a player"). Players that fail revalidation move to §7 Adjacent spaces, §3 complaints, or §5 buying signals — they do NOT stay as rows in `players.csv`.

**Player numeric carryover.** A player that survives revalidation and enters the child keeps the parent's `monthly_visits` and `funding_stage` — copy them across, no re-fetch. If either is missing on the parent row, the parent was incomplete: fix the parent first, then re-copy. `UNAVAILABLE` in the child because the parent did not have it is not acceptable.

Within each thread, prioritize **answering** comments — high-upvote replies, OP "this worked / thanks" responses, marked answers — not generic discussion.

## 2. Expand

Simultaneously, follow now-known experts elsewhere (their other comments, posts, profiles) to surface new datapoints not found in Extract. Re-use the cache where possible.

Reuse the same Source extractor sub-agent shape as Search. Cap the per-expert expansion at 10 URLs.

## 3. Synthesize

Merge semantic duplicates: claims that say the same thing collapse into one finding with a combined source list. When multiple sources support a claim, pick the highest-quality source as the canonical citation (best-evidence selection) **and keep that source's wording verbatim** — do not blend several sources into one sentence of your own. Merging is about removing repetition, never about rewriting what a source said. See `../output.md`.

Dispatch ONE synthesizer sub-agent, per `../dispatch_structured_subagent.md`. The synthesizer returns the Synthesizer schema (see `../../scripts/subagent_returns.json`): `{findings[{claim, confidence, sources, evidence}], stats}`.

**Inline the spec.** Sub-agents producing structured output get the format spec inlined verbatim (column rules + cell format + worked example). Pointing at the command's reference file fails — sub-agents default to shortest plausible content.

### What the synthesizer MUST mine for

- **Surprises** — findings that contradict the user's likely priors or industry common-wisdom.
- **Contrarian takes** — experts disagreeing with the mainstream.
- **Common misconceptions** — claims that experts call out as wrong despite being widely repeated.

These get surfaced in the "Non-trivial insights" section of the summary. Synthesis is NOT just dedup-and-rank. The whole reason this phase exists is to find what a board member or VC would care about, not to produce a thorough summary.

### Multi-source corroboration

A claim counts as corroborated only if supported by sources that differ on at least 2 of these 3 axes:
- Different domain.
- Different source.
- Different expert.

Two blog posts on different domains from the same author = NOT corroboration. Reddit thread + HN thread + expert blog = corroboration.

Corroboration drives the confidence tag — see `../vetting.md` §"Confidence tag rule".

## 3.5. Players.csv enrichment

Mandatory per-row. Blanket-skip not allowed.

For each row:
1. Identify `marketing_domain`. `url` is a hint — many open-source projects with a code-host `url` also have a marketing site (Frigate → `frigate.video`). Check before defaulting to "code-host only".
2. `monthly_visits` per `../sources/websearch.md`. SimilarWeb is free; fetch every row.
   - SimilarWeb returns data → numeric.
   - Subdomain → try parent first.
   - Domain not indexed → `UNAVAILABLE — not-indexed`.
   - No marketing domain, only a code host → `github-only`.
   - **Fetch failure (captcha, network error, blocked)** → STOP. In manual mode, surface it to the user with options: (a) retry now, (b) skip this row, (c) abort the phase. In auto mode, retry once, then skip the row. Either way a skipped row is recorded in `audit.md` and named in Issues. Do NOT silently write UNAVAILABLE.
   Bare `UNAVAILABLE` is not allowed.
3. **Topic-lens framing.** Descriptive columns (`positioning`, `recent_moves`, `top_user_sentiment`) describe how the entity connects to THIS topic, not generically. Coral in an IP-camera landscape: "Frigate's former recommended accelerator, dropped as abandonware; 3x retail markup" — not "Google's edge TPU." Test: if it'd read identically in an unrelated topic, re-frame it.

A row with no identifiable presence at all is a research error — record it in `audit.md` and name it in Issues.

## 3.6. Enumeration sections are rendered from the CSV, not written from memory

Any summary section that **lists things** — hubs, communities, players, accounts, tools, leaderboards — is produced by reading the finished CSV and emitting one entry per row. It is not composed from recollection with the file sitting beside it.

Which file: `players.csv`, `experts.csv` and `promoter_network.csv` for the sections that already have one. A section this run invented has its own, named in `research_plan.json` under `scope.sections`, planned in Plan and written here. See `../sections.md`.

The distinction matters because the two linking jobs are different, and only one of them was ever enforced. A **citation** proves a claim: it points at the page where the evidence lives. A **destination** answers "where is this thing?": it points at the thing itself. Cite-or-drop (`../output.md` rule 5) demands the first and says nothing about the second, so a section that names twelve communities can satisfy every rule in the brain while leaving the reader unable to reach a single one of them.

How to render:

- **One row, one entry.** The row set decides what appears. An entity you would have mentioned that has no row is a data error: add the row in §3.5 first, then render.
- **The name is the link** — `[r/LocalLLaMA](https://old.reddit.com/r/LocalLLaMA)`, `[Rhasspy forum](https://community.rhasspy.org)` — taken from the row's `url`. Never a separate URL column, and never a bare name.
- **Keep the sections apart.** Rows carry their kind, so people render into the people section and communities into theirs. Rendering from one file does not merge them.
- **A row whose `url` is genuinely unknown** renders its name unlinked and is recorded in `audit.md` as a known-gap. It is never quietly dropped, and the gap is never hidden by omitting the entity.

Citations still attach to the claims made *about* each entity, exactly as before. This section adds the destination; it replaces nothing.

## 4. Critic pass (before Audit)

Dispatch one cheap sub-agent that reads the draft summary and asks:

> What's missing that a board member or VC would ask about?

Output is a bulleted gap list.

- Gaps that can be closed cheaply (one or two extra queries) → go back into step 3 (synthesize) for one more pass. Update the draft.
- Gaps that can't be closed cheaply → record in `audit.md` as "known-gap".

## 4.5. Readability + structural lint (before Audit)

Sub-agent over the draft summary:

> 1. **Jargon.** Rewrite sentences using LLM-shorthand ("load-bearing", "category-level", "X-shaped", "X-lens", "thesis", "adoption gate", "founder-lens") into plain English.
> 2. **Hubs "Community value" cells.** Must start with His/Her/Their + noun AND name a specific artifact (repo, project, blog series). One-word values and generic phrases fail. If depth is insufficient: `—`, and record the gap in `audit.md`. No placeholders.
> 3. **Hubs handles.** Linked per spec template (`[u/handle](url)`, etc). Bare text fails.
> 4. **Enumeration sections reach their subjects.** In every section that lists things, each named entity is a link to the thing itself, and the entries match the CSV rows one for one — nothing named that has no row, no row silently missing. A citation beside the name does not satisfy this: it points at evidence, not at the thing. Unlinked names are only allowed where `audit.md` records the missing URL as a known-gap. See §3.6.
> 5. **Obscurity.** Rewrite any sentence a non-domain reader would have to re-read or guess at — concrete subject, single clause, define domain terms inline on first use.
> 6. **Brevity.** Cut any sentence shorter without losing meaning. No "in summary", no transitional padding, no repeating prior context.

Apply rewrites in place. Rules 1, 5 and 6 govern digmore's own prose only — never a quoted source. See `../output.md`.

## 4.6. Dedup pass (before Audit)

Dispatch a third cheap sub-agent over the draft summary:

> Find concepts / ideas / findings that appear in 2+ sections of the same draft. Priority follows section order — §1 is highest, §2 next, etc. Keep the idea in its earliest section; remove it from all later sections. If the deleted context still needs the pointer, leave a brief cross-reference (e.g. "see §1 Players — Coral row").

Apply the dedup in place.

## End of Synthesize

Synthesize is complete when:
- `raw_research_outcomes.md` exists and contains every surviving claim.
- `players.csv` exists with the command's required columns.
- the summary exists with every required section drafted (no `<!-- SYNTHESIZE-INCOMPLETE -->` header).
- All three passes have run: §4 critic (gaps), §4.5 readability (jargon rewrite), §4.6 dedup (cross-section dedup). Each is mandatory; none is optional.

No marker file. Resume infers state from these artifacts.
