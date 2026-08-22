/**
 * The run log — where a run spent its time, appended a line at a time.
 *
 *   node runlog.mjs header --topic <slug> --kind fresh --mode "manual, full" --run 0
 *   node runlog.mjs start  "[2.1/6] Extract · Search" --topic <slug>
 *   node runlog.mjs done   "[2.1/6] Extract · Search" --topic <slug> --note "25 branch searchers, 302 URLs"
 *   node runlog.mjs note   "resumed at Vet, from an unfinished start" --topic <slug>
 *
 * It writes digmore/<slug>/run_log.md, at the topic root rather than in cache/, which is
 * disposable — this is the only record of where a run spent its time, and it is read after the
 * run rather than during it. Nothing reads it while the run is going: the stuck-agent check
 * reads cache/_progress/*.log, which is a different question at a different time.
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

import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, topicDir } from './players.mjs';

export const RUN_LOG_NAME = 'run_log.md';

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

export function run(argv, { at = new Date() } = {}) {
  const [verb, ...rest] = argv;
  const positional = rest.filter((token, index) => !token.startsWith('--') && !rest[index - 1]?.startsWith('--'));
  const { flags } = parseArgs(['_', ...rest]);
  if (!flags.topic) throw new Error('--topic <slug> is required');

  const path = logPath(flags.topic);

  if (verb === 'header') {
    // A blank line before it, so consecutive runs are readable as separate blocks. The run's
    // own identity comes from the caller: this script knows the clock, not the plan.
    const parts = [flags.kind, flags.mode].filter(Boolean).join(' · ');
    const index = flags.run === undefined ? '' : ` · run_history[${flags.run}]`;
    append(path, `\n## run ${stamp(at)} — ${parts}${index}\n\n`);
    return { path, wrote: 'header' };
  }

  const text = positional[0];
  if (!text) throw new Error(`${verb ?? '(no verb)'} needs its text as the first argument`);

  if (verb === 'note') {
    append(path, `${stamp(at)}  ${text}\n`);
    return { path, wrote: 'note' };
  }
  if (verb !== 'start' && verb !== 'done') {
    throw new Error(`unknown command: ${verb ?? '(none)'} — expected header, start, done or note`);
  }

  // Only a `done` carries an elapsed figure; a `start` has nothing to measure yet.
  const sinceMs = verb === 'done' ? lastStampMs(path) : undefined;
  append(path, stepLine(text, verb, { note: flags.note, sinceMs, at }));
  return { path, wrote: verb };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(`${JSON.stringify(run(process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exit(1);
  }
}
