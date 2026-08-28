/**
 * The run log — where a run spent its time, appended a line at a time.
 *
 *   node runlog.mjs header --topic <slug> --kind fresh --mode "manual, full" --run 0
 *   node runlog.mjs start  "[2.1/6] Extract · Search" --topic <slug>
 *   node runlog.mjs done   "[2.1/6] Extract · Search" --topic <slug> --note "25 branch searchers, 302 URLs"
 *   node runlog.mjs note   "resumed at Vet, from an unfinished start" --topic <slug>
 *
 * It writes digmore/<slug>/run_log.log, at the topic root rather than in cache/, which is
 * disposable — this is the only record of where a run spent its time, and it is read after the
 * run rather than during it. Nothing reads it while the run is going: the stuck-agent check
 * reads cache/_progress/*.log, which is a different question at a different time.
 *
 * `.log` rather than `.md`, and the extension is load-bearing: every line under a run's heading is
 * fixed-width aligned columns, and a markdown renderer collapses consecutive non-blank lines into
 * one wrapped paragraph. So `.md` promised a rendering that destroys the only thing making the file
 * readable. The per-run heading is a plain separator for the same reason.
 *
 * A script rather than prose in the brain, for two reasons the model cannot satisfy itself:
 * the timestamp has to come from a clock, and the elapsed figure is a subtraction. Both are
 * arithmetic, and an agent handed arithmetic drifts off it — a composed stamp makes every
 * elapsed figure in the file wrong, silently.
 *
 * Appends, never replaces. Unlike audit.md, which describes one run, this is the record of what
 * the topic has cost over its life, and the second run is when the first run's timings become
 * useful.
 *
 * stdout JSON, stderr errors.
 */

import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, topicDir } from './players.mjs';

export const RUN_LOG_NAME = 'run_log.log';

/** Wide enough for the longest marker the phases print — `[2.1/6]` and its Audit equivalents. */
const MARKER_WIDTH = 9;

/** Where the elapsed figure sits, so the right-hand column reads as a column. */
const MESSAGE_WIDTH = 68;

/** A long note pushes past the column rather than being truncated; it still needs a gap. */
const MINIMUM_GAP = '  ';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** ISO to the second. Milliseconds say nothing here and cost a third of the column. */
export function stamp(at = new Date()) {
  return `${at.toISOString().slice(0, 19)}Z`;
}

/**
 * How long the step took, in the largest two units that fit.
 *
 * Seconds are dropped above an hour: at that scale they are noise, and the figure exists to be
 * read at a glance against the count beside it rather than to be summed.
 */
export function elapsed(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '';
  if (milliseconds < MINUTE) return `+${Math.round(milliseconds / SECOND)}s`;
  if (milliseconds < HOUR) {
    return `+${Math.floor(milliseconds / MINUTE)}m${Math.round((milliseconds % MINUTE) / SECOND)}s`;
  }
  return `+${Math.floor(milliseconds / HOUR)}h${Math.round((milliseconds % HOUR) / MINUTE)}m`;
}

export function logPath(topicSlug) {
  return join(topicDir(topicSlug), RUN_LOG_NAME);
}

export const AUDIT_NAME = 'audit.md';

export function auditPath(topicSlug) {
  return join(topicDir(topicSlug), AUDIT_NAME);
}

/**
 * The kinds of finding a run records, and **this list lives here and nowhere else** — adding one is
 * one edit, and a phase file naming a category this does not have gets an error rather than a line
 * nobody can sort on.
 *
 * They are the categories the phases actually produce, in roughly the order a run produces them.
 */
export const FINDING_CATEGORIES = Object.freeze([
  'dropped-for-budget',
  'url-duplicate',
  'budget-overrun',
  'dropped-receipt',
  'blocked-page',
  'webfetch-page',
  'handle-counts',
  'vetting-gap',
  'excluded-player',
  'source-unavailable',
  'stuck-agent-killed',
  'claim-unsourced',
  'claim-refuted',
  'statement-deleted',
  'paragraph-unreadable-evidence',
  'paragraph-unmarked',
  'section-not-copy-edited',
  'subagent-repair',
  'subagent-drop',
  'assumption',
  'known-gap',
  'unanswered',
]);

/**
 * The last timestamp in the file, which is what the next elapsed figure is measured from.
 *
 * The line above a `done` is always its own `start`, so no marker matching is needed — and
 * measuring from the line above rather than from a remembered start is what lets a partial log
 * still read correctly.
 */
export function lastStampMs(path) {
  if (!existsSync(path)) return undefined;
  const lines = readFileSync(path, 'utf8').split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)\s/.exec(lines[index]);
    if (!match) continue;
    const parsed = Date.parse(match[1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function append(path, text) {
  mkdirSync(join(path, '..'), { recursive: true });
  appendFileSync(path, text, 'utf8');
}

/**
 * One finding, one line: the time, the category in brackets, then what happened.
 *
 * A fixed format, a closed category list and a truncation nobody forgets are the three things a
 * model re-invents slightly differently every time it writes this file by hand — which is the whole
 * reason a script owns it. The run log's reason was different and stronger (a timestamp needs a
 * clock); this one is only about keeping a file sortable across six phases and one long run.
 *
 * Newlines in the text become spaces, because a finding that wraps is a finding that stops being
 * one line and stops being greppable.
 */
export function findingLine(category, text, { at = new Date() } = {}) {
  const flattened = String(text).replace(/\s*\n\s*/g, ' ').trim();
  return `${stamp(at)}  [${category}] ${flattened}\n`;
}

/**
 * Start this run's audit.md, replacing whatever the last run left.
 *
 * Called from `header` and nowhere else — the one moment a run has already established is its own
 * first, and the file has to be empty before the first phase appends to it.
 */
export function truncateAudit(topicSlug, at = new Date()) {
  const path = auditPath(topicSlug);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `# audit — run ${stamp(at)}\n\n`, 'utf8');
  return path;
}

/** One heartbeat file per dispatch, named for the label that dispatch was given. */
export function progressPath(topicSlug, label) {
  const safe = String(label).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!safe) throw new Error('--label must contain something nameable');
  return join(topicDir(topicSlug), 'cache', '_progress', `${safe}.log`);
}

/**
 * Every heartbeat at once: what each agent last said, and how long ago it said it.
 *
 * The stuck-agent check needs both halves and they live in different places — the last line is
 * in the file, the elapsed time is its modification time. Reading them separately means a `tail`
 * and a `stat` per agent; this is one call over all of them, and the answer is already sorted
 * with the stalest first, which is the order the check reads in.
 */
export function readBeats(topicSlug, now = Date.now()) {
  const dir = join(topicDir(topicSlug), 'cache', '_progress');
  let names;
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.log'));
  } catch {
    return []; // no dispatches yet is not a failure
  }

  return names
    .map((name) => {
      const path = join(dir, name);
      const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
      return {
        label: name.replace(/\.log$/, ''),
        last: lines[lines.length - 1] ?? '',
        steps: lines.length,
        quietSeconds: Math.round((now - statSync(path).mtimeMs) / 1000),
      };
    })
    .sort((left, right) => right.quietSeconds - left.quietSeconds);
}

/**
 * One step line: the time, the marker in its own column, what happened, and how long it took.
 *
 * `start` goes in before the work rather than being held back until the step finishes — a run
 * that dies in Vet has to leave a log showing it reached Vet. A missing pair reads as a crash,
 * so a step that was skipped says so on its `done` line rather than writing nothing.
 */
export function stepLine(marker, phase, { note, sinceMs, at = new Date() } = {}) {
  const [head, ...tail] = String(marker).trim().split(/\s+/);
  const looksLikeMarker = head.startsWith('[');
  const markerColumn = (looksLikeMarker ? head : '').padEnd(MARKER_WIDTH);
  const label = looksLikeMarker ? tail.join(' ') : String(marker).trim();

  let message = `${markerColumn}${label} · ${phase}`;
  if (note) message += ` — ${note}`;

  const since = sinceMs === undefined ? '' : elapsed(at.getTime() - sinceMs);
  if (!since) return `${stamp(at)}  ${message}\n`;

  const padded =
    message.length < MESSAGE_WIDTH ? message.padEnd(MESSAGE_WIDTH) : `${message}${MINIMUM_GAP}`;
  return `${stamp(at)}  ${padded}${since}\n`;
}

// ---------------------------------------------------------------- cli

/**
 * The four verbs and their arguments, printed by `--help`.
 *
 * It exists because a model that knows a run log is required and not how to write one probes
 * for `--help` before reading the file that documents it, and a probe that errors costs a turn
 * and teaches it nothing. `reporting.md` is still where the rule lives; this is the reminder.
 */
export const USAGE = `runlog.mjs — the run log, appended a line at a time.

  runlog.mjs header --topic <slug> [--kind fresh|re-run|branch] [--mode "manual, full"] [--run <n>]
  runlog.mjs start  "[2.1/6] Extract · Search" --topic <slug>
  runlog.mjs done   "[2.1/6] Extract · Search" --topic <slug> [--note "25 branch searchers, 302 URLs"]
  runlog.mjs note   "resumed at Vet, from an unfinished start" --topic <slug>
  runlog.mjs finding blocked-page "https://example.com/a — walled by both tools" --topic <slug>
  runlog.mjs beat   "fetching https://example.com/a" --topic <slug> --label page-analyst-websearch-7
  runlog.mjs beats  --topic <slug>
  runlog.mjs stamp

Writes digmore/<slug>/run_log.log, appending. --topic is required on every call, except stamp,
which writes nothing and prints the current time for research_plan.json's created_at and ts.
Only a done carries an elapsed figure, measured from the line above it. The step name is the
marker reporting.md prints, so the log and the terminal never invent separate vocabularies.

beat is a sub-agent's heartbeat, appended to cache/_progress/<label>.log. beats reads every
one of those back — the last line and how long ago it moved — which is what the stuck-agent
check needs.

finding appends one tagged line to audit.md, at the moment the run finds it rather than at the
end. header truncates audit.md, because that file describes one run. --shapes-style listing of
the categories: an unknown one is refused and the message names them all.`;

export function run(argv, { at = new Date() } = {}) {
  const [verb, ...rest] = argv;

  if (verb === '--help' || verb === '-h' || verb === undefined) {
    return { usage: USAGE, wrote: 'nothing' };
  }

  // The clock, for the fields that are not log lines: research_plan.json's `created_at` and each
  // `run_history` entry's `ts`. Same reason the log lines carry a real stamp — you have no clock,
  // and a composed one is wrong in a way nothing catches. Writes nothing and needs no topic.
  if (verb === 'stamp') return { stamp: stamp(at), wrote: 'nothing' };
  const positional = rest.filter((token, index) => !token.startsWith('--') && !rest[index - 1]?.startsWith('--'));
  const { flags } = parseArgs(['_', ...rest]);
  if (!flags.topic) throw new Error('--topic <slug> is required');

  const path = logPath(flags.topic);

  if (verb === 'header') {
    // A blank line before it, so consecutive runs are readable as separate blocks. The run's
    // own identity comes from the caller: this script knows the clock, not the plan.
    //
    // A plain separator rather than a markdown heading — this is a .log, and `===` scans as a
    // block boundary in a plain-text reader where `##` only reads as one to a renderer that would
    // have wrapped every aligned line beneath it.
    const parts = [flags.kind, flags.mode].filter(Boolean).join(' · ');
    const index = flags.run === undefined ? '' : ` · run_history[${flags.run}]`;
    append(path, `\n=== run ${stamp(at)} — ${parts}${index} ===\n\n`);

    // audit.md describes ONE run, which is what "replace it entirely" used to protect. Truncating
    // at the run's first moment keeps that and makes everything after it an append — so a run
    // killed in Vet still leaves the findings it had earned, instead of losing every phase's
    // record because the file was composed in one go at the very end.
    truncateAudit(flags.topic, at);
    return { path, wrote: 'header' };
  }

  if (verb === 'finding') {
    const category = positional[0];
    const text = positional[1];
    if (!category) throw new Error(`finding needs a category — one of ${FINDING_CATEGORIES.join(', ')}`);
    if (!FINDING_CATEGORIES.includes(category)) {
      throw new Error(`unknown category: ${category} — expected one of ${FINDING_CATEGORIES.join(', ')}`);
    }
    if (!text) throw new Error('finding needs its text as the second argument');
    const auditFile = auditPath(flags.topic);
    append(auditFile, findingLine(category, text, { at }));
    return { path: auditFile, wrote: 'finding', category };
  }

  // Every heartbeat in the run comes through here, which is the point of it being a verb rather
  // than a shell append. A sub-agent that echoes into the file is a second command shape the user
  // has to approve, thousands of times over a run — and one nobody can keep to a format.
  if (verb === 'beats') return { beats: readBeats(flags.topic) };

  const text = positional[0];
  if (!text) throw new Error(`${verb ?? '(no verb)'} needs its text as the first argument`);

  if (verb === 'beat') {
    if (!flags.label) throw new Error('beat needs --label <your-dispatch-label>');
    // Stamped here, never by the agent: it has no clock, and a composed stamp is wrong silently.
    // The file's modification time still answers "how long has this been quiet" for the
    // stuck-agent check; the stamps answer "which step took the time", which mtime cannot.
    append(progressPath(flags.topic, flags.label), `${stamp(at)}  ${text}\n`);
    return { path: progressPath(flags.topic, flags.label), wrote: 'beat' };
  }

  if (verb === 'note') {
    append(path, `${stamp(at)}  ${text}\n`);
    return { path, wrote: 'note' };
  }
  if (verb !== 'start' && verb !== 'done') {
    throw new Error(
      `unknown command: ${verb ?? '(none)'} — expected header, start, done, note, finding, beat, beats or stamp`,
    );
  }

  // Only a `done` carries an elapsed figure; a `start` has nothing to measure yet.
  const sinceMs = verb === 'done' ? lastStampMs(path) : undefined;
  append(path, stepLine(text, verb, { note: flags.note, sinceMs, at }));
  return { path, wrote: verb };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = run(process.argv.slice(2));
    // Usage is for a reader, so it goes out as text. Everything else is a result a caller
    // parses, and stays JSON.
    process.stdout.write(result.usage ? `${result.usage}\n` : `${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exit(1);
  }
}
