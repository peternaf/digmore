/**
 * The verdict join — the deterministic half of the Raw report writer's first step.
 *
 * Synthesize's first script. Each Source Analyst wrote
 * full_source_analysis/<source>-raw-report.json during Extract, with every claim carrying the
 * handles that said it. Vet then produced a verdict per handle. This is the join between the
 * two, and the filter that follows from it.
 *
 *   node synthesis.mjs join   --topic <slug>
 *   node synthesis.mjs read_source_claims --topic <slug> [--source <source>]
 *   node synthesis.mjs index  --topic <slug> [--manifest <path>] [--append]
 *
 * `join` writes the joined files, `read_source_claims` reads them back as one line per claim, and `index`
 * turns the manifest built from that reading into claim_index.json. The middle one exists because
 * the first two left a gap the agent filled with `node -e` and a `cd`.
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
 * `index` is the second half of the same argument, added after a run spent twelve minutes on it.
 * The Raw report writer used to emit claim_index.json as model output, hit the output limit
 * part-way through and restarted in batches — dozens of write calls with no heartbeat between
 * them, while the stuck-agent check kills at ten minutes. Every field of that file is a copy, a
 * maximum or a counter except the merged claim text and the refutation, so the agent now hands
 * back a manifest naming which source claims it merged and this expands it. Retyping the quotes
 * was also a correctness risk: the fact check compares the report against the cached page, so a
 * quote that drifted while being retyped sent it to the wrong evidence.
 *
 * The per-source reports are never modified. They are the durable checkpoint this phase
 * rebuilds from, so a run that dies here re-reads them and starts again.
 *
 * stdout JSON, stderr errors.
 */

import { writeFileSync, existsSync } from 'node:fs';
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

/** The manifest the Raw report writer hands back, relative to the topic directory. */
export const MANIFEST_PATH = 'cache/_returns/raw-report-writer-manifest.json';

/** claim-001, claim-002 — a counter over the merged set, never over the source claims. */
export function claimIdFor(number) {
  return `claim-${String(number).padStart(3, '0')}`;
}

/**
 * The highest id already in an index, so a repair pass continues rather than restarting.
 *
 * A repaired claim that reused an id would point the summary's marker at different evidence than
 * the one already rendered against it.
 */
export function highestClaimNumber(existingClaims) {
  let highest = 0;
  for (const claim of existingClaims ?? []) {
    const digits = /^claim-(\d+)$/.exec(claim?.claimId ?? '');
    if (digits) highest = Math.max(highest, Number(digits[1]));
  }
  return highest;
}

/**
 * Expand one manifest entry into a claim-index entry.
 *
 * Everything here is a copy, a maximum or a counter — which is the whole reason this is a script.
 * The agent decided which source claims are one claim and what that claim says; nothing below is
 * a second opinion on either.
 *
 * **A citation's quote is its source claim's.** `source-raw-report` stores one quote per claim and
 * one citation per document, so a source claim that appeared in three threads carries one quote
 * and three citations. That loss happens in Extract, upstream of both this script and the agent,
 * and neither can recover what was never written down — so the quote travels to every citation
 * drawn from that claim, which is what the agent could do and no less.
 */
export function expandEntry(entry, joinedBySource, position) {
  const references = entry?.from ?? [];
  if (!references.length) {
    throw new Error(`claims[${position}] has no \`from\` — a merged claim with no source claim behind it`);
  }

  const citations = [];
  let importance = 'tangential';
  let pageQuality = 'unreliable';
  let firstClaimText = '';

  for (const reference of references) {
    const joined = joinedBySource.get(reference?.source);
    if (!joined) {
      throw new Error(
        `claims[${position}] cites source ${JSON.stringify(reference?.source)}, which has no <source>-joined.json`,
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
        quote: sourceClaim.quote ?? '',
        url: citation.url ?? '',
        cachedPage: citation.cachedPage ?? '',
        status: citation.status ?? 'unvetted',
      };
      if (citation.handle) expanded.handle = citation.handle;
      citations.push(expanded);
    }
  }

  if (!citations.length) {
    throw new Error(`claims[${position}] resolved to no citations at all`);
  }

  // An entry with no `claim` of its own did not need one: nothing merged into it, so the source
  // claim already says what it says. Only a claim built from several needs a sentence covering
  // them all, and making the agent retype the rest was 80% of what the manifest still cost.
  return { claim: entry.claim || firstClaimText, importance, pageQuality, citations };
}

/**
 * Build the claim set from the manifest and the joined reports.
 *
 * The ids are assigned here, after the merge, because the merge is what decides how many claims
 * there are. `refutedByIndex` is a position in the manifest for the same reason: the agent cannot
 * name an id that does not exist until this runs.
 */
export function buildIndex(manifest, joinedBySource, { startAt = 0 } = {}) {
  const entries = manifest?.claims ?? [];
  const claims = entries.map((entry, position) => ({
    claimId: claimIdFor(startAt + position + 1),
    ...expandEntry(entry, joinedBySource, position),
  }));

  entries.forEach((entry, position) => {
    if (entry?.refutedByIndex === undefined || entry.refutedByIndex === null) return;
    if (entry.refutedByIndex === position) {
      throw new Error(`claims[${position}].refutedByIndex points at itself`);
    }
    const winner = claims[entry.refutedByIndex];
    if (!winner) {
      throw new Error(
        `claims[${position}].refutedByIndex ${entry.refutedByIndex} is not a claim in this manifest`,
      );
    }
    claims[position].refutedBy = winner.claimId;
    claims[position].refutedReason = entry.refutedReason ?? '';
  });

  return claims;
}

/** Every <source>-joined.json this topic has. */
export function readJoined(analysisDir) {
  const joinedBySource = new Map();
  for (const source of SOURCES) {
    const path = join(analysisDir, `${source}-joined.json`);
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
function claimLine(source, index, claim) {
  const measure = claim?.kind === 'quantitative' && claim?.value !== undefined
    ? `  ${claim.value} ${claim.unit ?? ''}`.trimEnd()
    : '';
  return [
    `${source}[${index}]  ${claim?.importance ?? '?'}/${claim?.kind ?? '?'}${measure}`,
    `  ${claim?.claim ?? ''}`,
    `  Q: ${claim?.quote ?? ''}`,
  ].join('\n');
}

/**
 * Every surviving claim, one per line, for the agent that has to merge them.
 *
 * **The counterpart to `join`, and the reason it exists is what happened without it.** `join`
 * writes the joined files; nothing read them back, so the Raw report writer — which is specified to
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
  const analysisDir = join(topicDir(topicSlug), 'full_source_analysis');
  const wanted = source ? [source] : SOURCES;
  if (source && !SOURCES.includes(source)) {
    throw new Error(`--source must be one of ${SOURCES.join(', ')}`);
  }

  const lines = [];
  let total = 0;
  for (const name of wanted) {
    const path = join(analysisDir, `${name}-joined.json`);
    if (!existsSync(path)) continue;
    const claims = readJson(path)?.claims ?? [];
    lines.push(`===== ${name} — ${claims.length} claims`);
    claims.forEach((claim, index) => lines.push(claimLine(name, index, claim)));
    total += claims.length;
  }

  if (!lines.length) {
    throw new Error(
      `no <source>-joined.json found — run "synthesis.mjs join --topic ${topicSlug}" first`,
    );
  }
  return { text: `${lines.join('\n')}\n`, claims: total };
}

/**
 * The whole verb: read the manifest, expand it, write the index.
 *
 * `append` is the repair pass, which is the one thing that ever adds to an existing index. It is
 * otherwise never edited after it is written.
 */
export function indexAll(topicSlug, { manifestPath, append = false } = {}) {
  const root = topicDir(topicSlug);
  const analysisDir = join(root, 'full_source_analysis');
  const resolvedManifest = manifestPath ?? join(root, MANIFEST_PATH);
  const indexPath = join(root, 'claim_index.json');

  if (!existsSync(resolvedManifest)) {
    throw new Error(`no manifest at ${resolvedManifest} — the Raw report writer has not written one`);
  }
  const manifest = readJson(resolvedManifest);
  if (!Array.isArray(manifest?.claims)) {
    throw new Error(`${resolvedManifest} has no claims array`);
  }

  const joinedBySource = readJoined(analysisDir);
  if (!joinedBySource.size) {
    throw new Error('no <source>-joined.json found — run synthesis.mjs join first');
  }

  const existing = append && existsSync(indexPath) ? readJson(indexPath)?.claims ?? [] : [];
  const built = buildIndex(manifest, joinedBySource, { startAt: highestClaimNumber(existing) });
  const claims = [...existing, ...built];

  writeFileSync(indexPath, `${JSON.stringify({ claims }, null, 2)}\n`, 'utf8');

  return {
    path: indexPath,
    claims: claims.length,
    added: built.length,
    citations: built.reduce((total, claim) => total + claim.citations.length, 0),
    appended: append,
  };
}

// ---------------------------------------------------------------- cli

export function run(argv) {
  const { verb, flags } = parseArgs(argv);
  if (!flags.topic) throw new Error('--topic <slug> is required');

  if (verb === 'index') {
    return indexAll(flags.topic, { manifestPath: flags.manifest, append: flags.append === true || flags.append === "true" });
  }
  if (verb === 'read_source_claims') {
    return joinedListing(flags.topic, { source: flags.source });
  }
  if (verb !== 'join') {
    throw new Error(`unknown command: ${verb ?? '(none)'} — expected join, read_source_claims or index`);
  }

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
    const result = run(process.argv.slice(2));
    // `read_source_claims` is the one verb whose answer is the listing itself. Wrapping it in JSON would
    // escape every quote in it and hand back something bigger than the file it read.
    process.stdout.write(result?.text ?? `${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exit(1);
  }
}
