/**
 * Vet's bookkeeping — who gets judged, what each vetter is given, and where the answers land.
 *
 *   node handle_vetting.mjs prepare   --topic <slug> --source <source> [--fast]
 *   node handle_vetting.mjs serve     --topic <slug> --source <source> --from <n> --to <n>
 *   node handle_vetting.mjs aggregate --topic <slug> --source <source>
 *
 * Three calls, in that order, once per handle-bearing source.
 *
 * It exists because the roster was the larger half of Vet's context cost. The orchestrator used
 * to read each source's ranked file to decide who was dispatched, then copy each handle's row
 * into that handle's prompt — up to vet.handleCapPerSource rows per source, each carrying its
 * pageSignals and every cached file the handle appears in. The verdicts coming back were the
 * visible cost; the roster going out was the bigger one.
 *
 * Now the dispatch carries a RANGE — "handles 11 to 20" — and the vetter asks `serve` for its
 * own. The orchestrator holds a count and a range and never learns a handle's name, which also
 * removes the transcription step that put 26 wrong-typed rows into one run's handles files.
 *
 * The configuration numbers are read from ~/.digmore/settings.json rather than passed in, for
 * the reason `prepare` needs three of them at once: three flags is three chances to hand over a
 * stale value, and the file is the same one preflight prints from. `--fast` applies the same
 * reductions preflight would. Explicit flags override, which is what the tests use.
 *
 * stdout JSON, stderr errors.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertWorkspaceRoot } from './fetch.mjs';
import { handleFilename } from './utils.mjs';
import { loadOrCreateConfig, configurationsFor, MALFORMED } from './config.mjs';
import { load as loadExperts, topicCsvPath, findExpertByHandle, expertColumnFor } from './experts.mjs';
import { validate } from './validate.mjs';

/** The four sources that carry handles. A page has an author rather than an account. */
export const HANDLE_SOURCES = Object.freeze(['reddit', 'hackernews', 'twitter', 'forums']);

/** Only Twitter has a depth to decide; every other source's script reads one thing. */
const DEEP_VET_SOURCE = 'twitter';

export const WORKLIST_FILE = 'vetting-worklist.json';

// ---------------------------------------------------------------- args and paths

export function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    if (!rest[index].startsWith('--')) continue;
    const name = rest[index].slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = rest[index + 1];
    // A bare --fast is a boolean; everything else takes the token after it.
    if (next === undefined || next.startsWith('--')) {
      flags[name] = true;
    } else {
      flags[name] = next;
      index += 1;
    }
  }
  return { verb, flags };
}

export function topicDir(topicSlug) {
  assertWorkspaceRoot();
  return join(process.cwd(), 'digmore', topicSlug);
}

export function handlesFilePath(topicSlug, source) {
  return join(topicDir(topicSlug), 'full_source_analysis', `${source}-handles.json`);
}

export function handlesDir(topicSlug, source) {
  return join(topicDir(topicSlug), 'cache', source, 'handles');
}

export function worklistPath(topicSlug, source) {
  return join(topicDir(topicSlug), 'cache', source, WORKLIST_FILE);
}

function readJson(path) {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  } catch {
    return undefined; // an unreadable file is a missing one; the caller records it
  }
}

function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * One source's ranked roster, or undefined when the file is absent.
 *
 * Exported because `expert_selection.mjs` reads the same files to pick the experts the run
 * follows, and a second copy of this is a copy that drifts the first time the shape moves.
 */
export function readHandlesFile(topicSlug, source) {
  const file = readJson(handlesFilePath(topicSlug, source));
  if (!file || !Array.isArray(file.handles)) return undefined;
  return file;
}

// ---------------------------------------------------------------- configuration

function configurations({ fast = false } = {}) {
  const config = loadOrCreateConfig();
  if (config === MALFORMED) {
    throw new Error('cannot parse ~/.digmore/settings.json — fix or delete it, then try again');
  }
  return configurationsFor(config, { fast: Boolean(fast) });
}

function wholeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

// ---------------------------------------------------------------- prepare

/**
 * Everything that has to happen once per source before a single vetter goes out.
 *
 * The order matters in one place: the auto-promotions are written into <source>-handles.json
 * BEFORE the remainder is frozen, so a handle that experts.csv already answers for never
 * reaches the work list and therefore never reads as a gap when the aggregation counts what is
 * missing.
 */
export function prepare(topicSlug, source, { fast = false, cap, deepVetted, postsPerDeepVet } = {}) {
  const applied = configurations({ fast });
  const handleCap = wholeNumber(cap, applied.vet.handleCapPerSource);
  const deepCount = wholeNumber(deepVetted, applied.twitter.handlesDeepVetted);
  const deepPosts = wholeNumber(postsPerDeepVet, applied.twitter.postsPerDeepVet);

  const file = readHandlesFile(topicSlug, source);

  // A source with no roster cannot be vetted, and that is a finding rather than a crash:
  // Extract already re-dispatched its Source Analyst once. The orchestrator records it and
  // carries on, so this returns rather than throwing.
  if (!file) {
    return { source, missing: true, ranked: 0, autoPromoted: 0, worklist: 0, skipped: {} };
  }

  const ranked = file.handles.slice(0, handleCap);

  // Step 2 — the branched-topic case, and the only thing experts.csv is read for during Vet.
  // A child inherits the parent's file by copy at the moment of branching, so those people
  // appear in a roster this run's Source Analyst wrote fresh, with no verdict on them and
  // nothing else in the file saying they are already known.
  const expertRows = loadExperts(topicCsvPath(topicSlug));
  const column = expertColumnFor(source);
  const promoted = [];

  for (const entry of ranked) {
    if (entry.verdict) continue; // already answered on an earlier run
    const match = column ? findExpertByHandle(expertRows, column, entry.handle) : undefined;
    if (!match) continue;
    entry.verdict = 'legit';
    entry.verdictReason = 'matched a row in experts.csv, inherited from the parent topic';
    entry.vettingSignals = {}; // no heuristic ran, so there is nothing it fired on
    if (match.topical_relevance) entry.topicalRelevance = match.topical_relevance;
    if (match.last_active) entry.lastActive = match.last_active;
    for (const identifier of ['real_name', 'github', 'website', 'reddit', 'hn', 'twitter']) {
      const field = identifier === 'real_name' ? 'realName' : identifier;
      if (match[identifier] && !entry[field]) entry[field] = match[identifier];
    }
    promoted.push(entry.handle);
  }

  if (promoted.length) writeJson(handlesFilePath(topicSlug, source), file);

  // Step 4 — what is left to dispatch. Each exclusion is a different reason and the counts are
  // reported separately, because "40 of 50 skipped" reads as a broken phase until you can see
  // that 38 of them were done on the previous run.
  const alreadyFiled = existsSync(handlesDir(topicSlug, source))
    ? new Set(readdirSync(handlesDir(topicSlug, source)).map((name) => name.replace(/\.json$/, '')))
    : new Set();

  const skipped = { autoPromoted: 0, alreadyVerdicted: 0, alreadyFiled: 0 };
  const remainder = [];

  for (const entry of ranked) {
    if (promoted.includes(entry.handle)) {
      skipped.autoPromoted += 1;
      continue;
    }
    if (entry.verdict) {
      skipped.alreadyVerdicted += 1;
      continue;
    }
    if (alreadyFiled.has(handleFilename(entry.handle))) {
      skipped.alreadyFiled += 1;
      continue;
    }
    remainder.push(entry);
  }

  // Step 5 — Twitter's depth, decided over what is left rather than over the whole roster, so a
  // deep read is never spent on a handle that was never going to be dispatched. The rank inside
  // the remainder is the roster's rank, because the remainder keeps the roster's order.
  const handles = remainder.map((entry, index) => {
    const served = { handle: entry.handle, row: entry };
    if (source === DEEP_VET_SOURCE) served.posts = index < deepCount ? deepPosts : 0;
    return served;
  });

  // Step 6 — freeze it. Recomputing the unvetted list on every request would shrink it as
  // handles are vetted, so once the first batch finished, "handles 11 to 20" would address what
  // used to be 21 to 30 and the original ten would never be vetted at all. The frozen file is
  // also the baseline the gap report is measured against.
  writeJson(worklistPath(topicSlug, source), { source, handles });

  return {
    source,
    missing: false,
    ranked: ranked.length,
    rosterHeld: file.handles.length,
    autoPromoted: promoted.length,
    worklist: handles.length,
    skipped,
    deepVetted: source === DEEP_VET_SOURCE ? Math.min(deepCount, handles.length) : 0,
  };
}

// ---------------------------------------------------------------- serve

/**
 * The handles at positions `from` to `to`, one-based and inclusive — the whole of what one
 * vetter is given, and the only place a handle's name enters a dispatch.
 *
 * A range past the end of the list is not an error: the last batch of a source is short, and a
 * vetter handed an empty range has nothing to do and says so.
 */
export function serve(topicSlug, source, from, to) {
  const worklist = readJson(worklistPath(topicSlug, source));
  if (!worklist) {
    throw new Error(`no work list for ${source} — run \`handle_vetting.mjs prepare\` first`);
  }
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    throw new Error('--from and --to are one-based whole numbers, and --to is not below --from');
  }
  return {
    source,
    from,
    to,
    handles: worklist.handles.slice(from - 1, to),
  };
}

// ---------------------------------------------------------------- aggregate

/**
 * Merge the per-handle files into the roster, once a source's vetters have all STOPPED.
 *
 * Stopped is not succeeded. A vetter that returns a failure, or one the stuck-agent check
 * kills, is finished — it just produced no file. Waiting on success would let one dead agent
 * hold a source open indefinitely.
 *
 * It never rebuilds <source>-handles.json. The roster, the ranking and the `documents` lists
 * are the Source Analyst's and predate Vet by a phase; this joins on `handle` and writes the
 * vetting fields onto rows that already exist.
 */
export function aggregate(topicSlug, source) {
  const file = readHandlesFile(topicSlug, source);
  if (!file) {
    return { source, missing: true, merged: 0, discarded: [], noFile: [] };
  }

  const directory = handlesDir(topicSlug, source);
  const files = existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith('.json')) : [];

  const byHandle = new Map();
  const discarded = [];

  for (const name of files) {
    const payload = readJson(join(directory, name));
    if (payload === undefined) {
      discarded.push({ file: name, reason: 'not readable as JSON' });
      continue;
    }
    const checked = validate('handle-vetting', payload);
    if (!checked.valid) {
      // Flattened to a sentence, because this goes into audit.md as the reason a handle the run
      // paid to vet has no verdict. A nested error object there is a line nobody can act on.
      const reason = checked.errors
        .map((error) => (error.path ? `${error.path}: ${error.message}` : error.message))
        .join('; ');
      discarded.push({ file: name, reason: reason || 'failed its shape check' });
      continue;
    }
    byHandle.set(payload.handle, payload);
  }

  // The fields the vetter owns. Named rather than spread, so a field the agent invents cannot
  // reach the roster and a field it omits cannot blank one already there.
  const VETTED_FIELDS = [
    'verdict',
    'verdictReason',
    'topicalRelevance',
    'vettingSignals',
    'lastActive',
    'realName',
    'github',
    'website',
    'reddit',
    'hn',
    'twitter',
    'otherIdentifiers',
  ];

  let merged = 0;
  for (const entry of file.handles) {
    const vetted = byHandle.get(entry.handle);
    if (!vetted) continue;
    for (const field of VETTED_FIELDS) {
      if (vetted[field] !== undefined) entry[field] = vetted[field];
    }
    byHandle.delete(entry.handle);
    merged += 1;
  }

  if (merged) writeJson(handlesFilePath(topicSlug, source), file);

  // The gap, measured against the frozen work list rather than against the roster: the
  // auto-promoted were never on it, so they cannot read as missing.
  const worklist = readJson(worklistPath(topicSlug, source));
  const expected = (worklist?.handles ?? []).map((served) => served.handle);
  const noFile = expected.filter((handle) => !file.handles.some((entry) => entry.handle === handle && entry.verdict));

  return {
    source,
    missing: false,
    expected: expected.length,
    merged,
    discarded,
    noFile,
    // A file whose handle matches no roster row. The roster is the authority, so this is
    // reported rather than appended: a handle nobody ranked is a handle nothing asked for.
    unmatched: [...byHandle.keys()],
  };
}

// ---------------------------------------------------------------- cli

export function run(argv) {
  const { verb, flags } = parseArgs(argv);
  if (!flags.topic) throw new Error('--topic <slug> is required');
  if (!flags.source) throw new Error('--source <source> is required');
  if (!HANDLE_SOURCES.includes(flags.source)) {
    throw new Error(`--source must be one of ${HANDLE_SOURCES.join(', ')} — those are the sources with handles`);
  }

  if (verb === 'prepare') {
    return prepare(flags.topic, flags.source, {
      fast: flags.fast,
      cap: flags.cap,
      deepVetted: flags.deepVetted,
      postsPerDeepVet: flags.postsPerDeepVet,
    });
  }
  if (verb === 'serve') {
    return serve(flags.topic, flags.source, Number(flags.from), Number(flags.to));
  }
  if (verb === 'aggregate') {
    return aggregate(flags.topic, flags.source);
  }
  throw new Error(`unknown command: ${verb ?? '(none)'} — expected prepare, serve or aggregate`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(`${JSON.stringify(run(process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exit(1);
  }
}
