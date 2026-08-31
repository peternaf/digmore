/**
 * Player candidates — who this research is about.
 *
 * The Enrichment phase's first step. Each Source Analyst wrote
 * full_source_analysis/<source>-players.json during Extract: every entity that source's
 * material named, and one reference per claim about it carrying the handle that said it.
 * Vet then produced a verdict per handle. This script is the join between the two.
 *
 *   node players.mjs candidates --topic <slug> [--fast] [--min-documents <n>]
 *   node players.mjs profiles   --topic <slug>
 *
 * It merges the six files, drops the claims the run does not listen to, recounts documents
 * across every source at once, applies the floor, and writes
 * digmore/<slug>/player_candidates.json.
 *
 * A script rather than a sub-agent because none of it is judgement: the same inputs give the
 * same candidates every run. What IS judgement — which candidates become rows, and whether
 * the run needs players at all — belongs to the orchestrator, in brain/phases/enrich_phase_d.md.
 *
 * stdout JSON, stderr errors.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWorkspaceRoot } from './fetch.mjs';
import { loadOrCreateConfig, configurationsFor, MALFORMED } from './config.mjs';
// One CSV reader in the plugin, imported from the script that owns it.
import { parseCsvRecords } from './experts.mjs';

/**
 * The floor a player has to clear, from `enrich.minPlayerDocuments` — full mode's value, or fast
 * mode's, which is lower because a fast run gathers far less material. `config.mjs` owns both
 * numbers and `preflight.mjs` prints the pair; nothing here restates either.
 *
 * `--min-documents` overrides whatever it resolves to, which is what the tests use and what makes
 * a floor debuggable against a topic already on disk.
 */
function resolveMinDocuments({ fast = false } = {}) {
  const config = loadOrCreateConfig();
  if (config === MALFORMED) {
    throw new Error('cannot parse ~/.digmore/settings.json — fix or delete it, then try again');
  }
  return configurationsFor(config, { fast: Boolean(fast) }).enrich.minPlayerDocuments;
}

/**
 * What a verdict does to a claim, and the two are not the same question.
 *
 * `promoter` is the row worth understanding: a founder posting about their own product across
 * six threads is how a promoter manufactures a player, so their claims stay available to the
 * report — labelled — and cannot create a row on their own.
 *
 * An absent verdict means never vetted rather than rejected: the vetting cap stops at
 * vet.handleCapPerSource, so on a busy topic most handles were never reached. Treating them as
 * rejected would throw away nearly everything, and on Twitter — where the heuristic floor never
 * returns `legit` — no player could ever be counted from that source.
 */
export const VERDICT_RULES = Object.freeze({
  legit: { keep: true, counts: true },
  unknown: { keep: true, counts: true },
  promoter: { keep: true, counts: false },
  spammer: { keep: false, counts: false },
  throwaway: { keep: false, counts: false },
});

const NEVER_VETTED = Object.freeze({ keep: true, counts: true });

/** A page has an author rather than an account, so these are judged on the page instead. */
const UNREADABLE_PAGE_QUALITY = 'unreliable';

/**
 * brain/page_quality.md holds these beside the words they score; this is the copy a script can
 * read. `none` is not one of them — it is this file's own rank for a handle that produced no
 * claim at all, which the shapes never store.
 */
export const IMPORTANCE_RANK = Object.freeze({ central: 3, supporting: 2, tangential: 1, none: 0 });

export const SOURCES = Object.freeze([
  'reddit',
  'hackernews',
  'twitter',
  'websearch',
  'forums',
  'local',
]);

// ---------------------------------------------------------------- args

export function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    if (!rest[index].startsWith('--')) continue;
    const name = rest[index].slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = rest[index + 1];
    // A flag with nothing after it, or another flag, is a switch — --fast, --auto. Consuming
    // the next token regardless is what made a trailing switch read as '' and a leading one
    // swallow the flag after it, so the switch was ignored in one position and broke the call in
    // the other. handle_vetting.mjs and expert_selection.mjs already read them this way.
    if (next === undefined || next.startsWith('--')) {
      flags[name] = true;
      continue;
    }
    flags[name] = next;
    index += 1;
  }
  return { verb, flags };
}

// ---------------------------------------------------------------- io

/** The topic directory sits under the working directory, never under the installed plugin. */
export function topicDir(topicSlug) {
  assertWorkspaceRoot();
  return join(process.cwd(), 'digmore', topicSlug);
}

export function readJson(path) {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  } catch {
    return undefined; // an unreadable file is a missing one; the caller records it
  }
}

// ---------------------------------------------------------------- the join

/** handle -> verdict, for one source. Absent file and absent handle both mean never vetted. */
export function verdictsFor(analysisDir, source) {
  const handlesFile = readJson(join(analysisDir, `${source}-handles.json`));
  const byHandle = new Map();
  for (const entry of handlesFile?.handles ?? []) {
    if (entry?.handle) byHandle.set(entry.handle, entry.verdict);
  }
  return byHandle;
}

/**
 * The pageQuality of one claims file, read once and remembered.
 *
 * Only claims with no handle need it — those are filtered on the page instead of on a person,
 * which is the same rule Synthesize applies to every other claim from the open web.
 */
function pageQualityReader(topicRoot) {
  const seen = new Map();
  return (relativePath) => {
    if (!seen.has(relativePath)) {
      seen.set(relativePath, readJson(join(topicRoot, relativePath))?.pageQuality);
    }
    return seen.get(relativePath);
  };
}

/** What happens to one claim reference, and why. */
export function judgeClaim(claim, verdicts, pageQualityOf) {
  if (!claim?.handle) {
    const pageQuality = pageQualityOf(claim?.file);
    return pageQuality === UNREADABLE_PAGE_QUALITY
      ? { keep: false, counts: false, reason: 'unreliable-page' }
      : { keep: true, counts: true, reason: 'no-handle', pageQuality };
  }
  const verdict = verdicts.get(claim.handle);
  if (verdict === undefined) return { ...NEVER_VETTED, reason: 'never-vetted', verdict: undefined };
  const rule = VERDICT_RULES[verdict];
  if (!rule) return { ...NEVER_VETTED, reason: 'unrecognised-verdict', verdict };
  return { ...rule, reason: verdict, verdict };
}

// ---------------------------------------------------------------- merging

/** Case and punctuation are not identity: `Acme Video`, `acme video` and `ACME  Video` are one. */
export function normaliseName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Every string an entity answers to, its own name included. */
function keysFor(player) {
  const keys = [normaliseName(player.name), ...(player.aliases ?? []).map(normaliseName)];
  return keys.filter(Boolean);
}

/**
 * Merge one source's entity into the accumulating set.
 *
 * Matching is on name or alias overlap, which is the only identity a run has: a player is a
 * string in someone's sentence, not an account or a URL. Two entries that share any key are one
 * player, and the first name seen wins so the output reads as the material wrote it.
 */
function mergeInto(merged, byKey, source, player, keptClaims) {
  const keys = keysFor(player);
  const existing = keys.map((key) => byKey.get(key)).find(Boolean);
  const entity = existing ?? {
    name: player.name,
    aliases: [],
    sources: [],
    relevance: [],
    claims: [],
    documentCountBeforeFilter: 0,
  };
  if (!existing) merged.push(entity);

  for (const alias of [player.name, ...(player.aliases ?? [])]) {
    if (alias !== entity.name && !entity.aliases.includes(alias)) entity.aliases.push(alias);
  }
  for (const key of keysFor(entity)) byKey.set(key, entity);

  if (!entity.sources.includes(source)) entity.sources.push(source);
  if (player.relevance) entity.relevance.push({ source, note: player.relevance });
  entity.documentCountBeforeFilter += Number(player.documentCount) || 0;
  entity.claims.push(...keptClaims);
  return entity;
}

// ---------------------------------------------------------------- the candidates

/**
 * Read every source's players file, filter, merge, count, and rank.
 *
 * The count is of documents that survived the filter, not of everything the sources saw. An
 * entity nobody said anything checkable about scores zero and never clears the floor, which is
 * the intended outcome: the report would have nothing to say about it either.
 */
export function buildCandidates(topicSlug, { minDocuments, fast = false } = {}) {
  minDocuments = minDocuments ?? resolveMinDocuments({ fast });
  const topicRoot = topicDir(topicSlug);
  const analysisDir = join(topicRoot, 'full_source_analysis');
  const pageQualityOf = pageQualityReader(topicRoot);

  const merged = [];
  const byKey = new Map();
  const sourcesRead = [];
  const sourcesMissing = [];
  const dropped = { spammer: 0, throwaway: 0, unreliablePage: 0, promoterNotCounted: 0 };

  for (const source of SOURCES) {
    const file = join(analysisDir, `${source}-players.json`);
    if (!existsSync(file)) continue;
    const parsed = readJson(file);
    if (!parsed?.players) {
      sourcesMissing.push(source);
      continue;
    }
    sourcesRead.push(source);
    const verdicts = verdictsFor(analysisDir, source);

    for (const player of parsed.players) {
      const kept = [];
      for (const claim of player.claims ?? []) {
        const judgement = judgeClaim(claim, verdicts, pageQualityOf);
        if (!judgement.keep) {
          if (judgement.reason === 'unreliable-page') dropped.unreliablePage += 1;
          else dropped[judgement.reason] = (dropped[judgement.reason] ?? 0) + 1;
          continue;
        }
        if (!judgement.counts) dropped.promoterNotCounted += 1;
        kept.push({
          file: claim.file,
          index: claim.index,
          handle: claim.handle,
          verdict: judgement.verdict,
          counts: judgement.counts,
          source,
        });
      }
      mergeInto(merged, byKey, source, player, kept);
    }
  }

  for (const entity of merged) {
    const countingDocuments = new Set();
    for (const claim of entity.claims) {
      if (claim.counts) countingDocuments.add(claim.file);
    }
    entity.documentCount = countingDocuments.size;
    entity.claimCount = entity.claims.length;
  }

  applyTopImportance(topicRoot, merged);

  const ranked = merged.sort(
    (left, right) =>
      IMPORTANCE_RANK[right.topImportance] - IMPORTANCE_RANK[left.topImportance] ||
      right.documentCount - left.documentCount ||
      left.name.localeCompare(right.name),
  );

  return {
    topic: topicSlug,
    minDocuments,
    sourcesRead,
    sourcesMissing,
    dropped,
    candidates: ranked.filter((entity) => entity.documentCount >= minDocuments),
    belowFloor: ranked
      .filter((entity) => entity.documentCount < minDocuments)
      .map(({ name, documentCount, sources }) => ({ name, documentCount, sources })),
    possibleDuplicates: possibleDuplicates(ranked, minDocuments),
  };
}

/**
 * Entities that may be one player under two names, reported rather than merged.
 *
 * Merging is on name-or-alias overlap, which only catches what a Source Analyst happened to write
 * down: `Acme` from a Reddit thread and `ACME Video` from a vendor page share no key and stay apart.
 * Guessing they are the same would just as readily fold a one-word product name into a longer name
 * that merely contains it, so this follows the rule experts.mjs already uses on people — a duplicate
 * a human can see beats two real entities silently collapsed into one.
 *
 * The combined count is the part that matters: two halves of one player can each sit below the
 * floor while together they clear it, and that is a player the run would otherwise lose without
 * ever knowing.
 */
export function possibleDuplicates(ranked, minDocuments) {
  // One token set per name, never pooled across an entity's names: pooling lets a domain alias
  // like `acme.com` contribute a `com` token that stops `Acme` matching `ACME Video`.
  const namesOf = (entity) =>
    [entity.name, ...(entity.aliases ?? [])]
      .map((value) => normaliseName(value).split(' ').filter(Boolean))
      .filter((tokens) => tokens.length);

  const related = (leftEntity, rightEntity) =>
    namesOf(leftEntity).some((leftTokens) =>
      namesOf(rightEntity).some((rightTokens) => {
        const [smaller, larger] =
          leftTokens.length <= rightTokens.length ? [leftTokens, rightTokens] : [rightTokens, leftTokens];
        const largerSet = new Set(larger);
        return smaller.every((token) => largerSet.has(token));
      }),
    );

  const pairs = [];
  for (let left = 0; left < ranked.length; left += 1) {
    for (let right = left + 1; right < ranked.length; right += 1) {
      if (!related(ranked[left], ranked[right])) continue;

      const combined = ranked[left].documentCount + ranked[right].documentCount;
      pairs.push({
        names: [ranked[left].name, ranked[right].name],
        documentCounts: [ranked[left].documentCount, ranked[right].documentCount],
        combinedDocumentCount: combined,
        wouldClearFloorIfMerged:
          combined >= minDocuments &&
          ranked[left].documentCount < minDocuments &&
          ranked[right].documentCount < minDocuments,
      });
    }
  }
  return pairs;
}

/**
 * The highest importance of any surviving claim, read off the claims files themselves.
 *
 * The reference carries a file and an index rather than the claim, so importance has to be
 * looked up. It is the field the candidate order rests on, and the only ranking players.csv has
 * ever had.
 */
function applyTopImportance(topicRoot, merged) {
  const files = new Map();
  const claimsIn = (relativePath) => {
    if (!files.has(relativePath)) {
      files.set(relativePath, readJson(join(topicRoot, relativePath))?.claims ?? []);
    }
    return files.get(relativePath);
  };

  for (const entity of merged) {
    let best = 'none';
    for (const reference of entity.claims) {
      const importance = claimsIn(reference.file)[reference.index]?.importance;
      if (IMPORTANCE_RANK[importance] > IMPORTANCE_RANK[best]) best = importance;
    }
    entity.topImportance = best;
  }
}

// ---------------------------------------------------------------- the profile merge

/** Where one Player Profiler leaves its row, one file per player. */
export const PROFILES_DIR = join('cache', 'players', 'profiles');

/**
 * A player's name as its filename. The same reduction `normaliseName` makes, hyphenated —
 * the agent derives it from the name it was dispatched with, and this derives it from the
 * name in the row, so the two meet without either being told the other's answer.
 */
export function profileFileName(name) {
  return `${normaliseName(name).replaceAll(' ', '-') || 'player'}.json`;
}

/**
 * What a profile file has to be before a single cell of it reaches `players.csv`.
 *
 * `fetch_failed` is the `player-profile` shape's only required field, so its absence means the
 * file is not that shape whatever else it holds. Checked here as well as by the agent because
 * a gate on the shared file catches a bad row only once it is already in it — the same reason
 * `handle_vetting.mjs aggregate` re-checks every handle file it merges.
 */
export function readProfile(path) {
  const parsed = readJson(path);
  if (parsed === undefined) return { problem: 'unreadable or not JSON' };
  if (typeof parsed !== 'object' || Array.isArray(parsed)) return { problem: 'not an object' };
  if (typeof parsed.fetch_failed !== 'boolean') return { problem: 'no boolean fetch_failed' };
  return { profile: parsed };
}

/** QUOTE_MINIMAL, as experts.mjs writes it: quote only what would otherwise break the row. */
function encodeField(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Fill every row of `players.csv` from the profile files, and say what happened to each.
 *
 * **The header decides the columns, not the shape.** Which optional columns a run carries is a
 * per-topic decision the command's reference file makes, recorded nowhere but the header, so a
 * returned field with no column is dropped rather than added — adding one would change the table's
 * shape from inside a merge. Those drops are reported per player: two of 21 profilers in the
 * measured run returned a field their dispatch never asked for, and drift that nothing prints is
 * drift nobody fixes.
 *
 * **Every column is written verbatim, matched on its own name.** Each field of `player-profile` is a
 * column name — there is no field whose column is called something else, which is why there is no
 * mapping table here and nothing transforms a value on its way in.
 *
 * **`name` is the only column never written.** It is the row's identity and the merge matches on it.
 *
 * Rows are matched on the name already in the CSV. A profile with no row is reported rather than
 * appended: the selection is the orchestrator's decision and a merge does not get to widen it.
 */
export function mergeProfiles(topicSlug) {
  const topicRoot = topicDir(topicSlug);
  const csvPath = join(topicRoot, 'players.csv');
  if (!existsSync(csvPath)) {
    throw new Error(`no players.csv at ${csvPath} — the rows are written before profiling starts`);
  }

  const text = readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
  const records = parseCsvRecords(text);
  if (!records.length) throw new Error(`${csvPath} has no header row`);
  const [header, ...rows] = records;
  const nameAt = header.indexOf('name');
  if (nameAt === -1) throw new Error(`${csvPath} has no "name" column`);
  const writable = header.filter((column) => column !== 'name');

  const filled = [];
  const failed = [];
  const malformed = [];
  const missing = [];
  const unwritten = [];
  const seen = new Set();

  const output = rows.map((record) => {
    const cells = header.map((_column, index) => record[index] ?? '');
    const name = cells[nameAt];
    if (!name) return cells;

    const fileName = profileFileName(name);
    seen.add(fileName);
    const path = join(topicRoot, PROFILES_DIR, fileName);
    if (!existsSync(path)) {
      missing.push(name);
      return cells;
    }

    const { profile, problem } = readProfile(path);
    if (problem) {
      malformed.push({ name, problem });
      return cells;
    }
    if (profile.fetch_failed) {
      failed.push({ name, reason: profile.reason ?? 'no reason given' });
      return cells;
    }

    let written = 0;
    const used = new Set();
    for (const column of writable) {
      if (!(column in profile)) continue;
      cells[header.indexOf(column)] = String(profile[column] ?? '');
      used.add(column);
      written += 1;
    }
    // Everything the profiler sent that this run's header has nowhere to put.
    const extra = Object.keys(profile).filter(
      (field) => !used.has(field) && field !== 'fetch_failed' && field !== 'reason',
    );
    if (extra.length) unwritten.push({ name, fields: extra });
    filled.push({ name, cells: written });
    return cells;
  });

  const profilesDir = join(topicRoot, PROFILES_DIR);
  const orphans = existsSync(profilesDir)
    ? readdirSync(profilesDir).filter((file) => file.endsWith('.json') && !seen.has(file))
    : [];

  // The file's own terminator, so a merge never rewrites every line as a diff.
  const terminator = text.includes('\r\n') ? '\r\n' : '\n';
  const body = [header, ...output].map((cells) => cells.map(encodeField).join(',')).join(terminator);
  const temp = `${csvPath}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, body + terminator, 'utf8');
    renameSync(temp, csvPath);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }

  return { path: csvPath, rows: output.length, filled, failed, malformed, missing, unwritten, orphans };
}

// ---------------------------------------------------------------- cli

const VERBS = Object.freeze(['candidates', 'profiles']);

export function run(argv) {
  const { verb, flags } = parseArgs(argv);
  if (!VERBS.includes(verb)) {
    throw new Error(`unknown command: ${verb ?? '(none)'} — expected ${VERBS.join(' or ')}`);
  }
  if (!flags.topic) throw new Error('--topic <slug> is required');

  if (verb === 'profiles') {
    const merged = mergeProfiles(flags.topic);
    // Counts and names, never a cell: this is the summary that reaches the orchestrator.
    return {
      path: merged.path,
      rows: merged.rows,
      filled: merged.filled.length,
      // Every row that received no cells, whatever stopped it — the count the retry-or-ask
      // decision is taken on. Counting only `missing` understates it by every failure.
      stillEmpty: merged.missing.length + merged.failed.length + merged.malformed.length,
      failed: merged.failed,
      malformed: merged.malformed,
      missing: merged.missing,
      unwritten: merged.unwritten,
      orphans: merged.orphans,
    };
  }

  const minDocuments =
    flags.minDocuments === undefined ? resolveMinDocuments({ fast: flags.fast }) : Number(flags.minDocuments);
  if (!Number.isInteger(minDocuments) || minDocuments < 1) {
    throw new Error('--min-documents must be a whole number of 1 or more');
  }

  const result = buildCandidates(flags.topic, { minDocuments });
  const outputPath = join(topicDir(flags.topic), 'player_candidates.json');
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  // The summary, not the candidates: the orchestrator reads the file.
  return {
    path: outputPath,
    sourcesRead: result.sourcesRead,
    sourcesMissing: result.sourcesMissing,
    candidates: result.candidates.length,
    belowFloor: result.belowFloor.length,
    possibleDuplicates: result.possibleDuplicates.length,
    dropped: result.dropped,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(`${JSON.stringify(run(process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exit(1);
  }
}
