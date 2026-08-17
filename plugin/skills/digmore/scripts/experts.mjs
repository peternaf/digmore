/**
 * Per-topic experts.csv — load, merge, save.
 *
 * Every source records people whose vetting verdict is `legit` here.
 * Charlatans, promoters and spammers are dropped rather than stored.
 *
 *   node experts.mjs list <topic-slug>
 *   node experts.mjs add  <topic-slug> --real-name <name> [--reddit ...] [--hn ...]
 *                                      [--twitter ...] [--github ...] [--website ...]
 *                                      [--sources a|b] [--notes ...] [--last-active YYYY-MM-DD]
 *                                      [--topical-relevance high|medium|low]
 *
 * The merge is pure; the write is atomic (.tmp then rename), so two sources running
 * at once cannot half-write the file.
 */

import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
  rmSync,
  openSync,
  closeSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * vetting.md: "Schema (column order is load-bearing)".
 *
 * `last_active` is the ninth column. vetting.md defines it — "the user's real last post/comment, YYYY-MM-DD, NOT
 * the vetting run date" — and landscape.md's Hubs table reads `experts.csv.last_active`
 * to downweight people who have gone quiet.
 *
 * `topical_relevance` is the tenth. Vet already judges how on-topic a person is and
 * demotes them when the answer is "not at all"; without a column the judgement was made
 * and thrown away, and landscape.md's Hubs filter asked for a field nothing wrote.
 *
 * Both are appended rather than inserted, so a file written before they existed still
 * reads — the missing cells come back empty.
 */
export const COLUMNS = Object.freeze([
  'real_name',
  'reddit',
  'hn',
  'twitter',
  'github',
  'website',
  'sources',
  'notes',
  'last_active',
  'topical_relevance',
]);

/** Ranked, because the merge keeps the strongest reading across sources. */
export const TOPICAL_RELEVANCE = Object.freeze(['low', 'medium', 'high']);

const HANDLE_COLUMNS = Object.freeze(['reddit', 'hn', 'twitter', 'github', 'website']);

/** Python's csv module writes CRLF by default; the file stays byte-compatible. */
const LINE_TERMINATOR = '\r\n';

export function row(values = {}) {
  return Object.fromEntries(COLUMNS.map((col) => [col, String(values[col] ?? '')]));
}

// ---------------------------------------------------------------- csv

/** QUOTE_MINIMAL: quote only when the value could otherwise break the row. */
function encodeField(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows) {
  const lines = [COLUMNS.map(encodeField).join(',')];
  for (const item of rows) lines.push(COLUMNS.map((col) => encodeField(item[col])).join(','));
  return lines.join(LINE_TERMINATOR) + LINE_TERMINATOR;
}

/** A standard reader: doubled quotes escape, and a quoted field may span lines. */
export function parseCsv(text) {
  const records = [];
  let field = '';
  let record = [];
  let quoted = false;
  let started = false;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    if (record.length > 1 || record[0] !== '') records.push(record);
    record = [];
    started = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && !started) {
      quoted = true;
      started = true;
    } else if (char === ',') {
      endField();
      started = false;
    } else if (char === '\r' && text[index + 1] === '\n') {
      endRecord();
      index += 1;
    } else if (char === '\n' || char === '\r') {
      endRecord();
    } else {
      field += char;
      started = true;
    }
  }
  if (field !== '' || record.length) endRecord();

  if (!records.length) return [];
  const header = records[0];
  return records.slice(1).map((values) => {
    const raw = Object.fromEntries(header.map((name, i) => [name, values[i] ?? '']));
    return row(raw); // unknown columns are dropped, missing ones default to ''
  });
}

// ---------------------------------------------------------------- io

/** The topic directory sits under the working directory. */
export function topicCsvPath(topicSlug) {
  return join(process.cwd(), 'digmore', topicSlug, 'experts.csv');
}

export function load(path) {
  if (!existsSync(path)) {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `${COLUMNS.join(',')}${LINE_TERMINATOR}`, 'utf8');
    return [];
  }
  return parseCsv(readFileSync(path, 'utf8'));
}

export function save(path, rows) {
  mkdirSync(join(path, '..'), { recursive: true });
  // A per-process temp name: two sources writing at once must not share one.
  const temp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, toCsv(rows), 'utf8');
    renameSync(temp, path);
  } catch (err) {
    rmSync(temp, { force: true });
    throw err;
  }
}

// ---------------------------------------------------------------- merge (pure)

const norm = (value) => String(value ?? '').trim().toLowerCase();

const sourceList = (value) =>
  String(value ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

function unionSources(a, b) {
  const seen = [];
  for (const source of [...sourceList(a), ...sourceList(b)]) {
    if (!seen.includes(source)) seen.push(source);
  }
  return seen.join('|');
}

function rowMatches(existing, incoming) {
  if (existing.real_name && incoming.real_name && norm(existing.real_name) === norm(incoming.real_name)) {
    return true;
  }
  return HANDLE_COLUMNS.some(
    (col) => existing[col] && incoming[col] && norm(existing[col]) === norm(incoming[col]),
  );
}

function applyMerge(existing, incoming) {
  const merged = { ...existing };
  let changed = false;

  for (const col of ['real_name', ...HANDLE_COLUMNS]) {
    if (!merged[col] && incoming[col]) {
      merged[col] = incoming[col];
      changed = true;
    }
  }

  const unioned = unionSources(existing.sources, incoming.sources);
  if (unioned !== existing.sources) {
    merged.sources = unioned;
    changed = true;
  }

  // One person, several sources: the latest date across all of them is when they
  // were last active anywhere. YYYY-MM-DD sorts lexically, so a string compare is
  // the whole comparison.
  if (incoming.last_active && incoming.last_active > (existing.last_active ?? '')) {
    merged.last_active = incoming.last_active;
    changed = true;
  }

  // One person, several sources: someone squarely on-topic on Reddit and only glancingly
  // so on Hacker News is on-topic. The strongest reading across sources is the person's.
  if (
    TOPICAL_RELEVANCE.indexOf(incoming.topical_relevance) >
    TOPICAL_RELEVANCE.indexOf(existing.topical_relevance)
  ) {
    merged.topical_relevance = incoming.topical_relevance;
    changed = true;
  }

  if (incoming.notes && !String(existing.notes ?? '').includes(incoming.notes)) {
    merged.notes = existing.notes ? `${existing.notes}; ${incoming.notes}` : incoming.notes;
    changed = true;
  }

  return [merged, changed];
}

/**
 * Returns [rows, action] where action is "added", "merged-handles" or "no-op".
 * Re-merging the same row is a no-op. A row that matches two different people is
 * appended and flagged rather than merged — collapsing two real people into one row
 * is worse than a duplicate a human can see.
 */
export function merge(existing, incoming) {
  const matches = existing.map((item, index) => ({ item, index })).filter(({ item }) => rowMatches(item, incoming));

  if (!matches.length) return [[...existing, incoming], 'added'];

  if (matches.length > 1) {
    const names = [...new Set(matches.map(({ item }) => item.real_name).filter(Boolean))].sort().join(',');
    const dupNote = `POSSIBLE DUP: matches existing real_name=${names}`;
    const flagged = {
      ...incoming,
      notes: incoming.notes ? `${incoming.notes}; ${dupNote}` : dupNote,
    };
    return [[...existing, flagged], 'added'];
  }

  const { item, index } = matches[0];
  const [mergedRow, changed] = applyMerge(item, incoming);
  if (!changed) return [existing, 'no-op'];
  const next = [...existing];
  next[index] = mergedRow;
  return [next, 'merged-handles'];
}

const LOCK_STALE_MS = 10000;
const LOCK_RETRY_MS = 20;
const LOCK_TIMEOUT_MS = 5000;

/** A blocking sleep, so the lock can be held across a synchronous read-modify-write. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * A cross-process lock around load -> merge -> save.
 *
 * An atomic write stops a half-written file but not a lost update: two source
 * sub-agents both read N rows, both write N+1, and one expert disappears without a
 * trace. Phase B fans out per source, so that race is the normal case rather than an
 * unlucky one.
 */
function withLock(path, fn) {
  const lock = `${path}.lock`;
  mkdirSync(join(path, '..'), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  for (;;) {
    try {
      closeSync(openSync(lock, 'wx'));
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // A process killed mid-write would otherwise block every later run.
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) rmSync(lock, { force: true });
      } catch {
        // The holder released it between the check and the stat; just retry.
      }
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${lock}`);
      sleepSync(LOCK_RETRY_MS);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

export function appendOrMerge(path, incoming) {
  return withLock(path, () => {
    const [rows, action] = merge(load(path), incoming);
    if (action !== 'no-op') save(path, rows);
    return action;
  });
}

// ---------------------------------------------------------------- cli

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    const name = argv[index].slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    flags[name] = argv[index + 1] ?? '';
    index += 1;
  }
  return flags;
}

export function run(argv) {
  const [verb, topicSlug, ...rest] = argv;

  if (verb === 'list') {
    if (!topicSlug) throw new Error('list needs a topic slug');
    return JSON.stringify(load(topicCsvPath(topicSlug)), null, 2);
  }

  if (verb === 'add') {
    if (!topicSlug || topicSlug.startsWith('--')) throw new Error('add needs a topic slug');
    const flags = parseFlags(rest);
    // The flag must be present, but may be empty: a person known only by a handle is
    // a real row, so --real-name '' is accepted.
    if (!Object.hasOwn(flags, 'realName')) throw new Error('add needs --real-name');

    // Refused rather than coerced: a misspelt value lands in the file, reads as "not
    // high or medium", and quietly drops the person from the Hubs table.
    if (flags.topicalRelevance && !TOPICAL_RELEVANCE.includes(flags.topicalRelevance)) {
      throw new Error(`--topical-relevance must be one of ${TOPICAL_RELEVANCE.join(', ')}`);
    }

    const incoming = row({
      real_name: flags.realName,
      reddit: flags.reddit,
      hn: flags.hn,
      twitter: flags.twitter,
      github: flags.github,
      website: flags.website,
      sources: flags.sources,
      notes: flags.notes,
      last_active: flags.lastActive,
      topical_relevance: flags.topicalRelevance,
    });

    // A row has to identify someone. With neither a name nor a handle it can never
    // match anything on a later merge, so it would accumulate as untraceable rows.
    if (!incoming.real_name && !HANDLE_COLUMNS.some((col) => incoming[col])) {
      throw new Error('a row needs a real name or at least one handle (reddit, hn, twitter, github, website)');
    }

    return appendOrMerge(topicCsvPath(topicSlug), incoming);
  }

  throw new Error(`unknown command: ${verb ?? '(none)'} — expected list or add`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(`${run(process.argv.slice(2))}\n`);
  } catch (err) {
    process.stderr.write(`${JSON.stringify({ error: err.message })}\n`);
    process.exit(1);
  }
}
