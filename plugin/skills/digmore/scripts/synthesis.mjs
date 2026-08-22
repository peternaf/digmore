/**
 * The verdict join — the deterministic half of the Raw report writer's first step.
 *
 * Synthesize's first script. Each Source Analyst wrote
 * full_source_analysis/<source>-raw-report.json during Extract, with every claim carrying the
 * handles that said it. Vet then produced a verdict per handle. This is the join between the
 * two, and the filter that follows from it.
 *
 *   node synthesis.mjs join --topic <slug>
 *
 * It reads the per-source reports and the handles files, stamps a status on every citation,
 * drops the citations the run does not listen to, drops the claims left with nothing behind
 * them, and writes full_source_analysis/<source>-joined.json — one file per source, so the
 * agent that reads them still reads one source at a time and its log line still names one.
 *
 * A script rather than the agent because none of it is judgement: a join, a lookup and a
 * filter give the same answer every run, and an agent handed arithmetic drifts off it. What
 * genuinely needs the agent is everything after — the semantic merge across sources, the
 * claim ids, the contradictions and the writing.
 *
 * The per-source reports are never modified. They are the durable checkpoint this phase
 * rebuilds from, so a run that dies here re-reads them and starts again.
 *
 * stdout JSON, stderr errors.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, VERDICT_RULES, parseArgs, readJson, topicDir, verdictsFor } from './players.mjs';

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
    claims.push({ ...claim, citations: kept });
  }

  return { claims, deletedUnsourced, dropped };
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
    const reportPath = join(analysisDir, `${source}-raw-report.json`);
    if (!existsSync(reportPath)) continue;

    const report = readJson(reportPath);
    if (!report?.claims) {
      sourcesMissing.push(source);
      continue;
    }

    const joined = joinSource(report, verdictsFor(analysisDir, source));
    const outputPath = join(analysisDir, `${source}-joined.json`);
    writeFileSync(
      outputPath,
      `${JSON.stringify(
        {
          source,
          claims: joined.claims,
          observations: report.observations ?? '',
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

// ---------------------------------------------------------------- cli

export function run(argv) {
  const { verb, flags } = parseArgs(argv);
  if (verb !== 'join') throw new Error(`unknown command: ${verb ?? '(none)'} — expected join`);
  if (!flags.topic) throw new Error('--topic <slug> is required');

  const result = joinAll(flags.topic);
  if (!result.written.length && !result.sourcesMissing.length) {
    // Not an empty topic: Extract writes one report per source that pulled data, so none at all
    // means the phase before this did not finish or its output was cleared.
    throw new Error('no <source>-raw-report.json found — Extract has not finished, or the cache is gone');
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(`${JSON.stringify(run(process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exit(1);
  }
}
