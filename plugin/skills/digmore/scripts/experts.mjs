/**
 * Per-topic experts.csv — load, merge, save.
 *
 * Every source records people whose vetting verdict is `legit` here.
 * Charlatans, promoters and spammers are dropped rather than stored.
 *
 *   node experts.mjs list  <topic-slug>
 *   node experts.mjs build <topic-slug>
 *   node experts.mjs add   <topic-slug> --real-name <name> [--reddit ...] [--hn ...]
 *                                       [--twitter ...] [--github ...] [--website ...]
 *                                       [--sources a|b] [--notes ...] [--last-active YYYY-MM-DD]
 *                                       [--topical-relevance high|medium|low]
 *
 * `build` is how a run fills this file: once, after every source has been aggregated, from the
 * merged <source>-handles.json rosters. `add` is the same merge over one row supplied by hand,
 * and is what the file was written for before the rosters existed.
 *
 * The merge is pure; the write is atomic (.tmp then rename), so two sources running
 * at once cannot half-write the file.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWorkspaceRoot } from './fetch.mjs';

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

/**
 * Which column of this file a source's handles live in.
 *
 * **Forums is deliberately absent, and that is a fact about the file rather than an oversight.**
 * There is no forums column, so a forums handle can never match an inherited expert and never
 * auto-promotes. Adding one would mean a column per forum, since two forums share no namespace.
 */
export const SOURCE_HANDLE_COLUMN = Object.freeze({
  reddit: 'reddit',
  hackernews: 'hn',
  twitter: 'twitter',
});

export function expertColumnFor(source) {
  return SOURCE_HANDLE_COLUMN[source];
}

/**
 * The row for one handle, or undefined — the same exact-equality matching `merge` uses, exposed
 * so Vet's auto-promotion does not carry a second copy of it.
 *
 * **Both forms are compared, because two conventions are in use and neither is wrong.** The
 * roster writes a handle as its source does — `u/foo`, `hn/foo`, `x/foo` — and this file stores
 * the bare name in a column that already says which platform it is. Comparing only one form
 * would silently promote nobody, which looks exactly like a topic with no inherited experts.
 */
export function findExpertByHandle(rows, column, handle) {
  if (!column || !handle) return undefined;
  // Case-insensitive, because the comparison below is: `U/Ada` has to reach `ada` in the column,
  // and a case-sensitive strip leaves it as `u/ada` matching nothing.
  const bare = String(handle).replace(/^(u\/|r\/|hn\/|x\/|@)/i, '');
  const wanted = new Set([norm(handle), norm(bare)]);
  wanted.delete('');
  return rows.find((existing) => existing[column] && wanted.has(norm(existing[column])));
}

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
  assertWorkspaceRoot();
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

/**
 * Load, merge, save. No lock, because there is only ever one writer.
 *
 * There used to be a cross-process lock here, against two Handle Vetters both reading N rows
 * and both writing N+1 while one expert vanished without a trace. That race is gone: the agents
 * fan out one file per handle and never touch this one, and every write to it happens in a
 * single `build` at the end of Vet, reading the merged rosters.
 *
 * The atomic write in save() stays. It guards a different failure — a crash mid-write leaving
 * half a file — which one writer does not prevent.
 *
 * If a fan-out writer is ever added back, the fix is to remove the fan-out rather than to
 * restore the lock.
 */
export function appendOrMerge(path, incoming) {
  const [rows, action] = merge(load(path), incoming);
  if (action !== 'no-op') save(path, rows);
  return action;
}

// ---------------------------------------------------------------- build, from the merged rosters

/** The four sources that carry handles, in the order their rows are folded in. */
const HANDLE_SOURCES = Object.freeze(['reddit', 'hackernews', 'twitter', 'forums']);

function readHandlesJson(topicSlug, source) {
  const path = join(process.cwd(), 'digmore', topicSlug, 'full_source_analysis', `${source}-handles.json`);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
    return Array.isArray(parsed?.handles) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One roster row becomes one experts.csv row — a copy, not an interpretation.
 *
 * That is what the labelled identifier fields bought. This function infers nothing: every
 * column arrives already labelled by the agent that read the profile, and the only work here is
 * putting the handle itself in the column its own source owns.
 *
 * **The prefix comes off.** A column called `reddit` holding `u/foo` says "reddit" twice, and
 * `github` and `website` are bare already. `findExpertByHandle` compares both forms, so nothing
 * downstream depends on which was chosen.
 */
export function rowFromHandle(entry, source) {
  const column = expertColumnFor(source);
  const bare = String(entry.handle ?? '').replace(/^(u\/|r\/|hn\/|x\/|@)/i, '');
  const values = {
    real_name: entry.realName,
    reddit: entry.reddit,
    hn: entry.hn,
    twitter: entry.twitter,
    github: entry.github,
    website: entry.website,
    sources: source,
    last_active: entry.lastActive,
    topical_relevance: entry.topicalRelevance,
  };
  // The handle's own column wins over anything the profile stated for the same platform: this
  // is where we actually met them, and the other is what they say about themselves.
  if (column) values[column] = bare;
  return row(values);
}

/**
 * Build experts.csv from the merged rosters, once every source has been aggregated.
 *
 * It runs once rather than per source because Enrichment is globally coupled at two points —
 * the expert step round-robins across sources to one enrich.expertsFollowed budget, and the
 * player-document floor counts across all sources — so there is no early start to buy.
 *
 * **Running once is not a regression on the incremental-write rule.** That rule exists because a
 * run stopping at handle 30 would otherwise reach no write at all and lose thirty dispatches.
 * The per-handle file satisfies it earlier and better: it survives the orchestrator dying, which
 * the orchestrator's own write cannot.
 *
 * **One bad row is recorded and skipped, never aborting the rest.** That is not defensive
 * habit — `experts.mjs add` once threw on the second handle of a loop and took 48 verdicts with
 * it, because the handles write came after.
 */
export function buildFromHandles(topicSlug) {
  const path = topicCsvPath(topicSlug);
  let rows = load(path);

  const added = [];
  const merged = [];
  const skipped = [];
  const sourcesRead = [];
  const sourcesMissing = [];

  for (const source of HANDLE_SOURCES) {
    const file = readHandlesJson(topicSlug, source);
    if (!file) {
      sourcesMissing.push(source);
      continue;
    }
    sourcesRead.push(source);

    for (const entry of file.handles) {
      // `legit` is the whole test. A handle with no recent on-topic activity was already
      // demoted to `unknown` by the Handle Vetter, so anything still `legit` is on-topic by
      // construction — and testing topicalRelevance as well would drop an inherited expert
      // whose parent row happened to carry no value for it.
      if (entry?.verdict !== 'legit') continue;
      try {
        const incoming = rowFromHandle(entry, source);
        if (!incoming.real_name && !HANDLE_COLUMNS.some((col) => incoming[col])) {
          throw new Error('no real name and no handle, so it could never be matched again');
        }
        const [next, action] = merge(rows, incoming);
        rows = next;
        if (action === 'added') added.push(entry.handle);
        else if (action === 'merged-handles') merged.push(entry.handle);
        entry.inExperts = true;
      } catch (error) {
        skipped.push({ handle: entry.handle, source, reason: error.message });
      }
    }

    // `inExperts` is the last field written in the phase, and it is written back onto the
    // roster so the run's record of who became a row lives beside its record of who did not.
    writeFileSync(
      join(process.cwd(), 'digmore', topicSlug, 'full_source_analysis', `${source}-handles.json`),
      `${JSON.stringify(file, null, 2)}\n`,
      'utf8',
    );
  }

  save(path, rows);

  return {
    path,
    sourcesRead,
    sourcesMissing,
    rows: rows.length,
    added: added.length,
    merged: merged.length,
    skipped,
  };
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

  if (verb === 'build') {
    if (!topicSlug || topicSlug.startsWith('--')) throw new Error('build needs a topic slug');
    return JSON.stringify(buildFromHandles(topicSlug), null, 2);
  }

  throw new Error(`unknown command: ${verb ?? '(none)'} — expected list, add or build`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(`${run(process.argv.slice(2))}\n`);
  } catch (err) {
    process.stderr.write(`${JSON.stringify({ error: err.message })}\n`);
    process.exit(1);
  }
}
