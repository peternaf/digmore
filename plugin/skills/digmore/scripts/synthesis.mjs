/**
 * The verdict join — the deterministic half of the Source aggregator's first step.
 *
 * Synthesize's first script. Each Source Analyst wrote
 * full_source_analysis/<source>-preliminary-results.json during Extract, with every claim carrying the
 * handles that said it. Vet then produced a verdict per handle. This is the join between the
 * two, and the filter that follows from it.
 *
 *   node synthesis.mjs join      --topic <slug>
 *   node synthesis.mjs read_source_claims     --topic <slug> [--source <source>]
 *   node synthesis.mjs read_observations      --topic <slug> [--source <source>]
 *   node synthesis.mjs read_claims_for_report --topic <slug> [--match <terms>]
 *   node synthesis.mjs index     --topic <slug> [--manifest <path>]
 *
 * `join` writes the final-results files, `read_source_claims` reads them back as one line per claim,
 * and `index` turns the manifest built from that reading into claim_index.json. The reading verbs
 * exist because the first two left a gap the agent filled with `node -e` and a `cd`.
 *
 * `read_claims_for_report` is the same idea for the Final report writer, which reads the claim set
 * directly now that there is no aggregate raw report between them. `read_observations` is the third,
 * and it reads the PRELIMINARY results: nothing joins an observation, so `join` does not carry them.
 *
 * **No quote text is stored outside <name>-claims.json.** Every citation carries a `citeId` and a
 * `cachedPage`; the quote is resolved from the page's own claims file whenever one is printed. That
 * is the whole point of the pass: a claim merged from three pages used to keep one quote and copy it
 * onto all three citations, so two of them named a page that never carried those words.
 *
 * It reads the per-source reports and the handles files, stamps a status on every citation,
 * drops the citations the run does not listen to, drops the claims left with nothing behind
 * them, and writes full_source_analysis/<source>-final-results.json — one file per source, so the
 * agent that reads them still reads one source at a time and its log line still names one.
 *
 * A script rather than the agent because none of it is judgement: a join, a lookup and a
 * filter give the same answer every run, and an agent handed arithmetic drifts off it. What
 * genuinely needs the agent is everything after — the semantic merge across sources, the
 * claim ids, the contradictions and the writing.
 *
 * `index` is the second half of the same argument, added after a run spent twelve minutes on it.
 * The Source aggregator used to emit claim_index.json as model output, hit the output limit
 * part-way through and restarted in batches — dozens of write calls with no heartbeat between
 * them, while the stuck-agent check kills at ten minutes. Every field of that file is a copy, a
 * maximum or a counter except the merged claim text and the refutation, so the agent now hands
 * back a manifest naming which source claims it merged and this expands it. Retyping the quotes
 * was also a correctness risk: the fact check compares the report against the cached page, so a
 * quote that drifted while being retyped sent it to the wrong evidence. Nothing retypes one now —
 * the id travels and the words stay where they were written.
 *
 * The per-source reports are never modified. They are the durable checkpoint this phase
 * rebuilds from, so a run that dies here re-reads them and starts again.
 *
 * stdout JSON, stderr errors.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IMPORTANCE_RANK,
  SOURCES,
  VERDICT_RULES,
  parseArgs,
  readJson,
  topicDir,
  verdictsFor,
} from './players.mjs';

/**
 * What a handle's verdict becomes on the citation, in the vocabulary the claim index prints.
 *
 * Two of the five verdicts have no entry, and that is the point: `spammer` and `throwaway`
 * citations are dropped here rather than labelled, so nothing downstream has to decide what to
 * do with one. Their rejection is already recorded in <source>-handles.json, which is the run's
 * account of who it refused to listen to.
 *
 * The values are the `status` enum of the `claim-index` shape in subagent_returns.json, which
 * is where they are defined; this map is the one place the verdict-to-status translation lives.
 */
const STATUS_FOR_VERDICT = Object.freeze({
  legit: 'legit',
  unknown: 'unknown',
  promoter: 'promoter',
});

/** No verdict exists: below the vetting cap, or first seen in expert material after Vet. */
const NO_VERDICT_STATUS = 'unvetted';

/** A web page or the user's own document: an author rather than an account, nobody to vet. */
const NO_HANDLE_STATUS = 'no-handle';

/** brain/page_quality.md — the one tag that is a filter rather than a weight. */
const UNREADABLE_PAGE_QUALITY = 'unreliable';

/**
 * One citation's fate.
 *
 * Page quality is checked before the handle, because an unreliable page is dropped whoever
 * posted it — a `legit` expert linking to a content farm is exactly the case the two
 * dimensions are kept independent for.
 */
export function judgeCitation(citation, verdicts) {
  if (citation?.pageQuality === UNREADABLE_PAGE_QUALITY) {
    return { keep: false, reason: 'unreliable-page' };
  }
  if (!citation?.handle) return { keep: true, status: NO_HANDLE_STATUS };

  const verdict = verdicts.get(citation.handle);
  if (verdict === undefined) return { keep: true, status: NO_VERDICT_STATUS };

  // An unrecognised verdict is treated as no verdict rather than as a rejection: a value this
  // version does not know is a gap in what we can read, and dropping on it would silently lose
  // evidence the run paid for.
  const rule = VERDICT_RULES[verdict];
  if (!rule) return { keep: true, status: NO_VERDICT_STATUS };
  if (!rule.keep) return { keep: false, reason: verdict };

  return { keep: true, status: STATUS_FOR_VERDICT[verdict] ?? NO_VERDICT_STATUS };
}

/**
 * The claims file beside a stored page: same stem, `-claims.json`.
 *
 * The page path is what a citation stores, and it is the one that yields both — the claims file is
 * always derivable from the page's stem, while the page is not derivable from the claims file,
 * because its extension varies by source: `.md` on websearch and forums, `.json` on the scripted
 * ones.
 */
export function claimsFileFor(cachedPage) {
  return claimsFileCandidates(cachedPage)[0];
}

/**
 * Both names a claims file is written under, best first.
 *
 * The rule is the page's stem plus `-claims.json`, and most agents follow it. A measured run also
 * had `..._SKILL.md-claims.json` — the suffix appended to the whole filename, extension included —
 * and every citation into those pages resolved to nothing. The page was on disk the whole time,
 * which is why the failure read as the script being wrong.
 *
 * Reading both costs one `existsSync` and recovers evidence a naming choice would otherwise lose.
 * `page_analyst_agent/index.md` now states which form to write; this is what carries the caches
 * already on disk, and what stops the next agent's variation being silent.
 */
export function claimsFileCandidates(cachedPage) {
  const path = String(cachedPage ?? '');
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  const stem = dot > slash ? path.slice(0, dot) : path;
  const names = [`${stem}-claims.json`];
  if (stem !== path) names.push(`${path}-claims.json`);
  return names;
}

/**
 * The quote a `citeId` names, read from the page's own claims file.
 *
 * A direct lookup rather than a scan: the citation carries the `cachedPage`, the page names its
 * claims file, and the id names the entry in it. So the id only ever has to be unique inside one
 * page — which is what `uniqueBy` on the `page-claims` array already guarantees.
 *
 * **A miss returns the empty string and is recorded — never swallowed.** Two very different things
 * produce one, and the count is what tells them apart:
 *
 * - `missingFile` — the cache is gone. `brain/resuming.md` already owns that: the run stops and
 *   offers to start over rather than shipping a report with no evidence behind it.
 * - `unknownId` — a `citeId` naming an entry that is not in a file that exists. That is a citation
 *   pointing at nothing, which is the failure class this whole pass exists to remove, and silently
 *   returning empty would hide exactly the thing it was built to expose.
 *
 * Recorded rather than thrown because a phase that has already been paid for should not die on one
 * bad id — but every caller reports the count, so it reaches the run instead of the floor.
 */
export function quoteResolver(topicRoot) {
  const byFile = new Map();
  const misses = [];

  const resolve = (citation) => {
    const citeId = citation?.citeId;
    // null, never '': an empty string reads as a quote that says nothing, and the fact checker
    // judges the quotes first and the page only where they fall short.
    if (!citeId || !citation?.cachedPage) return null;
    const candidates = claimsFileCandidates(citation.cachedPage);
    const relative = candidates.find((name) => existsSync(join(topicRoot, name))) ?? candidates[0];
    if (!byFile.has(relative)) {
      const absolute = join(topicRoot, relative);
      const quotes = new Map();
      let readable = false;
      if (existsSync(absolute)) {
        try {
          const parsed = JSON.parse(readFileSync(absolute, 'utf8'));
          // A bare array is the `page-claims` shape written wrong — 23 files in a measured run.
          // Read it anyway: the claims are there, and refusing them loses evidence to a defect
          // the Page Analyst's own validation now catches at write time.
          for (const claim of Array.isArray(parsed) ? parsed : parsed?.claims ?? []) {
            if (claim?.citeId) quotes.set(claim.citeId, claim.quote ?? '');
          }
          readable = true;
        } catch {
          // a corrupt claims file reads as one that is not there
        }
      }
      byFile.set(relative, { quotes, readable });
    }

    const { quotes, readable } = byFile.get(relative);
    if (quotes.has(citeId)) return quotes.get(citeId);
    misses.push({ citeId, cachedPage: citation.cachedPage, reason: readable ? 'unknownId' : 'missingFile' });
    return null;
  };

  resolve.misses = misses;
  return resolve;
}

/** One line naming what could not be resolved, or nothing at all when everything did. */
export function missReport(misses) {
  if (!misses.length) return [];
  const missingFile = misses.filter((miss) => miss.reason === 'missingFile');
  const unknownId = misses.filter((miss) => miss.reason === 'unknownId');
  const lines = [`!! ${misses.length} quotes could not be resolved`];
  if (missingFile.length) {
    lines.push(`   ${missingFile.length} from pages that are not on disk — the cache may be gone`);
  }
  for (const miss of unknownId) {
    lines.push(`   ${miss.citeId} is not in ${claimsFileFor(miss.cachedPage)} — a citation pointing at nothing`);
  }
  return lines;
}

/**
 * One source's claims, joined and filtered.
 *
 * Two ways a claim can leave, and they are different findings. **No surviving citation** is the
 * filter working — every voice behind it was one the run decided not to listen to. **No URL on
 * any surviving citation** is a defect in this pipeline: cite-or-drop means such a claim cannot
 * legitimately exist, so it was invented somewhere upstream. The second is collected by name so
 * the agent can carry it onto its receipt, which is the only route it has to audit.md — it runs
 * in a phase where that file is not yet being written, and is gone by the time it is.
 */
export function joinSource(report, verdicts) {
  const claims = [];
  const deletedUnsourced = [];
  const dropped = { unreliablePage: 0, spammer: 0, throwaway: 0, noSurvivingCitation: 0 };

  for (const claim of report?.claims ?? []) {
    const kept = [];
    for (const citation of claim?.citations ?? []) {
      const judgement = judgeCitation(citation, verdicts);
      if (!judgement.keep) {
        if (judgement.reason === 'unreliable-page') dropped.unreliablePage += 1;
        else dropped[judgement.reason] = (dropped[judgement.reason] ?? 0) + 1;
        continue;
      }
      kept.push({ ...citation, status: judgement.status });
    }

    if (!kept.length) {
      dropped.noSurvivingCitation += 1;
      continue;
    }
    if (!kept.some((citation) => citation.url)) {
      deletedUnsourced.push({ claim: claim.claim, reason: 'no citation carries a URL' });
      continue;
    }
    claims.push({ ...claim, citations: electRepresentative(kept) });
  }

  return { claims, deletedUnsourced, dropped };
}

/**
 * Exactly one surviving citation carries `representative: true`.
 *
 * The Source Analyst flagged one, and the filter above may have just dropped it — the handle was a
 * spammer, or the page was unreliable. A claim that loses its representative survives with nothing
 * to quote, and nothing else in the run would notice: the report simply renders that claim without
 * words behind it. So the highest-`pageQuality` survivor is promoted, which is the rule the agent
 * applied in the first place.
 */
export function electRepresentative(citations) {
  if (citations.some((citation) => citation.representative)) {
    // More than one can arrive only from a malformed file; keep the first and clear the rest, so
    // "exactly one" is true of what this writes whatever it was handed.
    let seen = false;
    return citations.map((citation) => {
      if (!citation.representative) return citation;
      if (seen) return { ...citation, representative: false };
      seen = true;
      return citation;
    });
  }

  let best = 0;
  citations.forEach((citation, index) => {
    const rank = PAGE_QUALITY_RANK[citation.pageQuality] ?? 0;
    if (rank > (PAGE_QUALITY_RANK[citations[best].pageQuality] ?? 0)) best = index;
  });
  return citations.map((citation, index) =>
    index === best ? { ...citation, representative: true } : citation,
  );
}

/** Every source that produced a report, joined and written beside it. */
export function joinAll(topicSlug) {
  const analysisDir = join(topicDir(topicSlug), 'full_source_analysis');

  const written = [];
  const sourcesMissing = [];
  let claimsIn = 0;
  let claimsOut = 0;
  let unsourced = 0;

  for (const source of SOURCES) {
    const reportPath = join(analysisDir, `${source}-preliminary-results.json`);
    if (!existsSync(reportPath)) continue;

    const report = readJson(reportPath);
    if (!report?.claims) {
      sourcesMissing.push(source);
      continue;
    }

    const joined = joinSource(report, verdictsFor(analysisDir, source));
    const outputPath = join(analysisDir, `${source}-final-results.json`);
    // Observations are not carried across. Nothing joins one — there is no citation to stamp a
    // verdict on — and the copy existed only to reach an agent that read the final-results files.
    // `read_observations` reads the preliminary results instead, which also lets it run before this.
    writeFileSync(
      outputPath,
      `${JSON.stringify(
        {
          source,
          claims: joined.claims,
          deletedUnsourced: joined.deletedUnsourced,
          dropped: joined.dropped,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    claimsIn += report.claims.length;
    claimsOut += joined.claims.length;
    unsourced += joined.deletedUnsourced.length;
    written.push({ source, path: outputPath, claims: joined.claims.length, dropped: joined.dropped });
  }

  return { written, sourcesMissing, claimsIn, claimsOut, unsourced };
}

/**
 * brain/page_quality.md holds these beside the words they score; this is the copy a script can
 * read. `internal` sits outside the ranking there and scores 4, so a claim from the user's own
 * files can hold its own in a contradiction rather than losing to any public page by default.
 */
export const PAGE_QUALITY_RANK = Object.freeze({
  'primary-3p': 5,
  'primary-self': 4,
  internal: 4,
  secondary: 3,
  blog: 2,
  forum: 1,
  unreliable: 0,
});

/** The manifest the Source aggregator hands back, relative to the topic directory. */
export const MANIFEST_PATH = 'cache/_returns/source-aggregator-manifest.json';

/** claim-001, claim-002 — a counter over the merged set, never over the source claims. */
export function claimIdFor(number) {
  return `claim-${String(number).padStart(3, '0')}`;
}

/**
 * Expand one manifest entry into a claim-index entry.
 *
 * Everything here is a copy, a maximum or a counter — which is the whole reason this is a script.
 * The agent decided which source claims are one claim and what that claim says; nothing below is
 * a second opinion on either.
 *
 * **No quote is copied.** Each citation carries its own `citeId`, and the words stay in the page's
 * own claims file. A claim merged from three pages used to keep one quote and copy it onto all
 * three citations — measured, 63% of the citations on multi-cited claims named a page that never
 * carried those words, which sent the fact check to the wrong evidence.
 *
 * **`representativeFrom` decides which quote the report renders.** It names a `from` reference,
 * `"reddit[41]"`, and the representative citation of that source claim wins. Omitted, the
 * highest-`pageQuality` citation's own representative does.
 */
export function expandEntry(entry, joinedBySource, position) {
  const references = entry?.from ?? [];
  if (!references.length) {
    throw new Error(`claims[${position}] has no \`from\` — a merged claim with no source claim behind it`);
  }

  const citations = [];
  const origins = [];
  let importance = 'tangential';
  let pageQuality = 'unreliable';
  let firstClaimText = '';

  for (const reference of references) {
    const joined = joinedBySource.get(reference?.source);
    if (!joined) {
      throw new Error(
        `claims[${position}] cites source ${JSON.stringify(reference?.source)}, which has no <source>-final-results.json`,
      );
    }
    const sourceClaim = joined.claims?.[reference?.index];
    if (!sourceClaim) {
      throw new Error(
        `claims[${position}] cites ${reference.source}[${reference?.index}], which is not in that file`,
      );
    }

    if (!firstClaimText) firstClaimText = sourceClaim.claim ?? '';

    if ((IMPORTANCE_RANK[sourceClaim.importance] ?? 0) > (IMPORTANCE_RANK[importance] ?? 0)) {
      importance = sourceClaim.importance;
    }

    for (const citation of sourceClaim.citations ?? []) {
      if ((PAGE_QUALITY_RANK[citation.pageQuality] ?? 0) > (PAGE_QUALITY_RANK[pageQuality] ?? 0)) {
        pageQuality = citation.pageQuality;
      }
      const expanded = {
        citeId: citation.citeId ?? '',
        url: citation.url ?? '',
        cachedPage: citation.cachedPage ?? '',
        status: citation.status ?? 'unvetted',
      };
      if (citation.handle) expanded.handle = citation.handle;
      if (citation.pageQuality) expanded.pageQuality = citation.pageQuality;
      citations.push(expanded);
      origins.push({ reference: referenceLabel(reference), representative: Boolean(citation.representative) });
    }
  }

  if (!citations.length) {
    throw new Error(`claims[${position}] resolved to no citations at all`);
  }

  // An entry with no `claim` of its own did not need one: nothing merged into it, so the source
  // claim already says what it says. Only a claim built from several needs a sentence covering
  // them all, and making the agent retype the rest was 80% of what the manifest still cost.
  return {
    claim: entry.claim || firstClaimText,
    importance,
    pageQuality,
    citations: markRepresentative(citations, origins, entry, references, position),
  };
}

/** `reddit[41]` — the address `read_source_claims` prints and the manifest copies. */
export function referenceLabel(reference) {
  return `${reference?.source}[${reference?.index}]`;
}

/**
 * Exactly one citation of a merged claim carries `representative: true`.
 *
 * `representativeFrom` names a `from` reference rather than a position, so it is checked against
 * that entry's own `from` — a check a position could only be range-tested against. It also cannot
 * dangle: `join` elects a representative on every surviving claim, so every reference resolves to
 * a source claim that has one.
 */
function markRepresentative(citations, origins, entry, references, position) {
  const wanted = entry?.representativeFrom;
  let chosen = -1;

  if (wanted) {
    const labels = references.map(referenceLabel);
    if (!labels.includes(wanted)) {
      throw new Error(
        `claims[${position}].representativeFrom ${JSON.stringify(wanted)} is not one of this entry's from references (${labels.join(', ')})`,
      );
    }
    chosen = origins.findIndex((origin) => origin.reference === wanted && origin.representative);
    // `join` elects a representative on every claim that survives its filter, so a named reference
    // always has one. Reaching here means something upstream did not run or was edited by hand, and
    // quietly rendering a different person's words is the wrong way to find that out.
    //
    // The message names the repair, because this is thrown at an agent that gets one attempt at it:
    // dropping the field is always valid, and always leaves a representative behind.
    if (chosen === -1) {
      throw new Error(
        `claims[${position}].representativeFrom ${JSON.stringify(wanted)} resolved to a source claim with no representative citation. ` +
          'synthesis.mjs join elects one on every surviving claim, so that file was not written by it. ' +
          `To repair: remove representativeFrom from claims[${position}] and the highest-pageQuality citation's representative wins instead.`,
      );
    }
  }

  if (chosen === -1) {
    chosen = 0;
    citations.forEach((citation, index) => {
      const rank = PAGE_QUALITY_RANK[citation.pageQuality] ?? 0;
      const best = PAGE_QUALITY_RANK[citations[chosen].pageQuality] ?? 0;
      if (rank > best || (rank === best && origins[index].representative && !origins[chosen].representative)) {
        chosen = index;
      }
    });
  }

  return citations.map((citation, index) =>
    index === chosen ? { ...citation, representative: true } : citation,
  );
}

/**
 * Build the claim set from the manifest and the joined reports.
 *
 * The ids are assigned here, after the merge, because the merge is what decides how many claims
 * there are. `refutedByIndex` is a position in the manifest for the same reason: the agent cannot
 * name an id that does not exist until this runs. `representativeFrom` is NOT a position, because
 * what it points at — a `from` reference — already has a stable name before this runs.
 *
 * **A malformed entry is dropped, never fatal.** It used to throw at the first one, and the agent
 * that fixes a manifest gets ONE repair attempt — so two bad entries were unrecoverable: repair one,
 * re-run, meet the next, no attempts left, and Synthesize never finished over bookkeeping with every
 * fetch in the run already paid for. Now every problem is collected, the entries behind them are
 * dropped, and the caller decides what to do with the list.
 *
 * **What is fatal is elsewhere**: no manifest, a manifest with no `claims`, or no final-results files
 * at all. Those mean the step before this did not run, and an empty index would hand the run a report
 * that looks like one which found nothing.
 *
 * **A failed entry leaves a stand-in rather than being skipped.** Skipping shrinks the array, so
 * every later claim slides down one and `refutedByIndex` starts naming the wrong claim — which would
 * report problems that are not real on top of the ones that are. The stand-ins never reach disk:
 * where there are problems this throws instead of writing.
 */
export function buildIndex(manifest, joinedBySource) {
  const entries = manifest?.claims ?? [];
  const problems = [];

  const dropped = new Set();
  const claims = entries.map((entry, position) => {
    const claimId = claimIdFor(position + 1);
    try {
      return { claimId, ...expandEntry(entry, joinedBySource, position) };
    } catch (error) {
      problems.push(error.message);
      dropped.add(claimId);
      return { claimId, claim: '', importance: 'tangential', pageQuality: 'unreliable', citations: [] };
    }
  });

  entries.forEach((entry, position) => {
    if (entry?.refutedByIndex === undefined || entry.refutedByIndex === null) return;
    if (entry.refutedByIndex === position) {
      problems.push(`claims[${position}].refutedByIndex points at itself`);
      return;
    }
    const winner = claims[entry.refutedByIndex];
    if (!winner) {
      problems.push(
        `claims[${position}].refutedByIndex ${entry.refutedByIndex} is not a claim in this manifest`,
      );
      return;
    }
    claims[position].refutedBy = winner.claimId;
    claims[position].refutedReason = entry.refutedReason ?? '';
  });

  // The stand-ins have done their job — they kept later positions and `refutedByIndex` accurate
  // while the problems were collected. They do not reach the file.
  return { claims: claims.filter((claim) => !dropped.has(claim.claimId)), problems };
}

/**
 * How many malformed entries are dropped without asking anyone to repair them.
 *
 * Small enough that the evidence lost is marginal against a run of several hundred claims, and
 * large enough that the common case — an agent miscounting a `from` position once or twice — never
 * costs a whole dispatch. The same number on the first run and on the re-run after a repair: what
 * changes after a repair is that there is no attempt left, not what counts as tolerable.
 */
export const DROP_WITHOUT_REPAIR = 10;

/**
 * How many problems are spelled out before "and N more".
 *
 * A different number from the one above because it does a different job: that one decides whether
 * to spend a dispatch, this one bounds how much text the agent has to read.
 */
export const PROBLEMS_LISTED = 20;

/** The problems, capped, ready to print or to put on a receipt. */
export function problemLines(problems) {
  const shown = problems.slice(0, PROBLEMS_LISTED);
  const rest = problems.length - shown.length;
  return rest ? [...shown, `… and ${rest} more of the same kinds`] : shown;
}

/** Every <source>-final-results.json this topic has. */
export function readJoined(analysisDir) {
  const joinedBySource = new Map();
  for (const source of SOURCES) {
    const path = join(analysisDir, `${source}-final-results.json`);
    if (!existsSync(path)) continue;
    joinedBySource.set(source, readJson(path));
  }
  return joinedBySource;
}

/**
 * One claim as one line, addressed the way the manifest addresses it.
 *
 * `<source>[<index>]` is not decoration: it is exactly the `{source, index}` reference the merge
 * manifest requires, so the agent copies it instead of counting positions in a JSON array. A
 * miscounted index is rejected by `index` after the whole merge pass is done, which is the most
 * expensive moment in the run to find a bookkeeping mistake.
 */
function claimLine(source, index, claim, resolveQuote) {
  const measure = claim?.kind === 'quantitative' && claim?.value !== undefined
    ? `  ${claim.value} ${claim.unit ?? ''}`.trimEnd()
    : '';
  // The representative's quote, resolved from its page's claims file. The claim itself stores none.
  const representative = (claim?.citations ?? []).find((citation) => citation.representative)
    ?? (claim?.citations ?? [])[0];
  return [
    `${source}[${index}]  ${claim?.importance ?? '?'}/${claim?.kind ?? '?'}${measure}`,
    `  ${claim?.claim ?? ''}`,
    `  Q: ${resolveQuote(representative ?? {})}`,
  ].join('\n');
}

/**
 * Every surviving claim, one per line, for the agent that has to merge them.
 *
 * **The counterpart to `join`, and the reason it exists is what happened without it.** `join`
 * writes the final-results files; nothing read them back, so the Source aggregator — which is specified to
 * hold every claim in the run at once — reached for `node -e` and a relative `require`, and had to
 * `cd` into the topic to make that resolve. Both are things its dispatch forbids, and it did them
 * because reading six files of full citation objects to get at six fields is the alternative.
 *
 * **What is left out is the point.** Citations, `cachedPage`, `pageQuality` and the verdict statuses
 * are all copied into `claim_index.json` by `index` from the joined file itself, so an agent that
 * never sees them cannot get them wrong. What it does see is what merging and settling
 * contradictions actually need: what was claimed, in whose words, how strongly, and where it lives.
 *
 * Text rather than JSON, deliberately. Re-serialising the file it just read would return the
 * problem to the caller in a slightly smaller box.
 */
export function joinedListing(topicSlug, { source } = {}) {
  const root = topicDir(topicSlug);
  const analysisDir = join(root, 'full_source_analysis');
  const wanted = source ? [source] : SOURCES;
  if (source && !SOURCES.includes(source)) {
    throw new Error(`--source must be one of ${SOURCES.join(', ')}`);
  }

  const resolveQuote = quoteResolver(root);
  const lines = [];
  let total = 0;
  for (const name of wanted) {
    const path = join(analysisDir, `${name}-final-results.json`);
    if (!existsSync(path)) continue;
    const claims = readJson(path)?.claims ?? [];
    lines.push(`===== ${name} — ${claims.length} claims`);
    claims.forEach((claim, index) => lines.push(claimLine(name, index, claim, resolveQuote)));
    total += claims.length;
  }

  if (!lines.length) {
    throw new Error(
      `no <source>-final-results.json found — run "synthesis.mjs join --topic ${topicSlug}" first`,
    );
  }
  lines.push(...missReport(resolveQuote.misses));
  return { text: `${lines.join('\n')}\n`, claims: total, unresolvedQuotes: resolveQuote.misses.length };
}

/**
 * Every source's observations, for the agent that merges them across sources.
 *
 * It reads the PRELIMINARY results, not the final ones. Nothing joins an observation — there is no
 * citation to stamp a verdict on — so `join` does not carry them, and reading the earlier file also
 * means this works before `join` has run.
 */
export function observationsListing(topicSlug, { source } = {}) {
  const analysisDir = join(topicDir(topicSlug), 'full_source_analysis');
  const wanted = source ? [source] : SOURCES;
  if (source && !SOURCES.includes(source)) {
    throw new Error(`--source must be one of ${SOURCES.join(', ')}`);
  }

  const lines = [];
  let total = 0;
  let found = 0;
  for (const name of wanted) {
    const path = join(analysisDir, `${name}-preliminary-results.json`);
    if (!existsSync(path)) continue;
    found += 1;
    const observations = readJson(path)?.observations ?? [];
    lines.push(`===== ${name} — ${observations.length} observations`);
    for (const observation of observations) lines.push(`  - ${observation}`);
    total += observations.length;
  }

  if (!found) {
    throw new Error(
      `no <source>-preliminary-results.json found — Extract has not finished, or the cache is gone`,
    );
  }
  return { text: `${lines.join('\n')}\n`, observations: total };
}

/** One line per term, lowercased, for the `--match` filter. */
function matchTerms(raw) {
  return String(raw ?? '')
    .split(',')
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The claim set as the Final report writer needs it.
 *
 * The counterpart to `read_source_claims`, one level later: that one addresses source claims for
 * the merge, this one addresses merged claims for the draft. Measured on a real run, it is 296KB
 * against 579KB for `claim_index.json` raw — the writer reads the whole claim set now that there is
 * no aggregate raw report between them.
 *
 * **What it leaves out is the point, again.** `cachedPage` never appears: the writer does not open
 * pages, and the paths were 58KB of the file. Nor do the non-representative citations' quotes — the
 * writer renders one quote per claim, so the others would be 47KB it cannot use. What every citation
 * does contribute is its `url`, which the report cites, and its `status`, which decides the
 * confidence tag beside a quote.
 *
 * `--match` filters to the claims whose text or quote carries any of the terms, ORed. One call with
 * every plausible wording, never several: an empty result is the answer, not a prompt to try again.
 */
export function claimsForReport(topicSlug, { match } = {}) {
  const root = topicDir(topicSlug);
  const indexPath = join(root, 'claim_index.json');
  if (!existsSync(indexPath)) {
    throw new Error(`no claim_index.json — run "synthesis.mjs index --topic ${topicSlug}" first`);
  }

  const resolveQuote = quoteResolver(root);
  const terms = matchTerms(match);
  const lines = [];
  let shown = 0;

  const all = readJson(indexPath)?.claims ?? [];
  for (const claim of all) {
    const citations = claim.citations ?? [];
    const representative = citations.find((citation) => citation.representative) ?? citations[0];
    const quote = resolveQuote(representative ?? {});

    if (terms.length) {
      const haystack = `${claim.claim ?? ''} ${quote}`.toLowerCase();
      if (!terms.some((term) => haystack.includes(term))) continue;
    }

    const refuted = claim.refutedBy ? `  REFUTED BY ${claim.refutedBy}: ${claim.refutedReason ?? ''}` : '';
    lines.push(`${claim.claimId}  ${claim.importance ?? '?'}/${claim.pageQuality ?? '?'}${refuted}`);
    lines.push(`  ${claim.claim ?? ''}`);
    if (representative?.citeId) lines.push(`  Q [${representative.citeId}]: ${quote}`);
    for (const citation of citations) {
      lines.push(`  - ${citation.status ?? 'unvetted'}  ${citation.url ?? ''}`);
    }
    shown += 1;
  }

  lines.push(...missReport(resolveQuote.misses));
  const heading = terms.length
    ? `===== ${shown} of ${all.length} claims matching: ${terms.join(', ')}`
    : `===== ${all.length} claims`;
  return {
    text: `${[heading, ...lines].join('\n')}\n`,
    claims: shown,
    total: all.length,
    unresolvedQuotes: resolveQuote.misses.length,
  };
}

/**
 * The whole verb: read the manifest, expand it, write the index.
 *
 * Written whole and never edited afterwards.
 */
export function indexAll(topicSlug, { manifestPath } = {}) {
  const root = topicDir(topicSlug);
  const analysisDir = join(root, 'full_source_analysis');
  const resolvedManifest = manifestPath ?? join(root, MANIFEST_PATH);
  const indexPath = join(root, 'claim_index.json');

  if (!existsSync(resolvedManifest)) {
    throw new Error(`no manifest at ${resolvedManifest} — the Source aggregator has not written one`);
  }
  const manifest = readJson(resolvedManifest);
  if (!Array.isArray(manifest?.claims)) {
    throw new Error(`${resolvedManifest} has no claims array`);
  }

  const joinedBySource = readJoined(analysisDir);
  if (!joinedBySource.size) {
    throw new Error('no <source>-final-results.json found — run synthesis.mjs join first');
  }

  // Written whole, every time. There is no append: the repair pass rebuilds CSV rows from claims
  // already indexed and never introduces one, so nothing ever adds to this file after it is written.
  const { claims, problems } = buildIndex(manifest, joinedBySource);

  writeFileSync(indexPath, `${JSON.stringify({ claims }, null, 2)}\n`, 'utf8');

  // Every citation resolved here, at the write, rather than discovered in Audit one dispatch at a
  // time. A measured run reached the fact check with 107 of 871 unresolvable and reported ten,
  // because each checker only ever sees its own range. No new script: the resolver is in this file.
  const resolveQuote = quoteResolver(root);
  for (const claim of claims) for (const citation of claim.citations ?? []) resolveQuote(citation);

  return {
    path: indexPath,
    claims: claims.length,
    citations: claims.reduce((total, claim) => total + claim.citations.length, 0),
    unresolvedQuotes: resolveQuote.misses.length,
    unresolved: missReport(resolveQuote.misses),
    dropped: problems.length,
    // Above the threshold the caller repairs; at or below it, records and carries on.
    repairable: problems.length > DROP_WITHOUT_REPAIR,
    problems: problemLines(problems),
  };
}

// ---------------------------------------------------------------- cli

export function run(argv) {
  const { verb, flags } = parseArgs(argv);
  if (!flags.topic) throw new Error('--topic <slug> is required');

  if (verb === 'index') {
    if (flags.append !== undefined) {
      throw new Error('--append is gone: the index is written whole, and nothing adds to it afterwards');
    }
    return indexAll(flags.topic, { manifestPath: flags.manifest });
  }
  if (verb === 'read_source_claims') {
    return joinedListing(flags.topic, { source: flags.source });
  }
  if (verb === 'read_observations') {
    return observationsListing(flags.topic, { source: flags.source });
  }
  if (verb === 'read_claims_for_report') {
    return claimsForReport(flags.topic, { match: flags.match });
  }
  if (verb !== 'join') {
    throw new Error(
      `unknown command: ${verb ?? '(none)'} — expected join, read_source_claims, read_observations, read_claims_for_report or index`,
    );
  }

  const result = joinAll(flags.topic);
  if (!result.written.length && !result.sourcesMissing.length) {
    // Not an empty topic: Extract writes one report per source that pulled data, so none at all
    // means the phase before this did not finish or its output was cleared.
    throw new Error(
      'no <source>-preliminary-results.json found — Extract has not finished, or the cache is gone',
    );
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = run(process.argv.slice(2));
    // The reading verbs answer with the listing itself. Wrapping one in JSON would escape every
    // quote in it and hand back something bigger than the file it read.
    process.stdout.write(result?.text ?? `${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exit(1);
  }
}
