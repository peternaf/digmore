/**
 * runlog.mjs — the run log, appended a line at a time.
 *
 * A script rather than prose in the brain, for two reasons the model cannot satisfy itself: the
 * timestamp has to come from a clock, and the elapsed figure is a subtraction. A composed stamp
 * makes every elapsed figure in the file wrong, silently — which is exactly the class of defect
 * a log exists to rule out.
 *
 * `stamp`, `stepLine` and `run` take an injectable `at`, so none of this is measured against the
 * wall clock.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox } from './helpers.mjs';
import {
  RUN_LOG_NAME,
  stamp,
  elapsed,
  logPath,
  lastStampMs,
  stepLine,
  run,
} from '../skill/scripts/runlog.mjs';

let sandbox;
let previousCwd;

beforeEach(() => {
  sandbox = new Sandbox();
  previousCwd = process.cwd();
  // topicDir builds from the working directory, so `run` and `logPath` are exercised from a
  // throwaway one. Each test file runs in its own process, so this cannot reach another file.
  process.chdir(sandbox.cwd);
});

afterEach(async () => {
  process.chdir(previousCwd);
  await sandbox.cleanup();
});

const at = (iso) => new Date(iso);
const START = at('2026-08-21T09:14:02Z');
const logFile = (slug = 'demo') => join(sandbox.cwd, 'digmore', slug, RUN_LOG_NAME);
const read = (slug = 'demo') => readFileSync(logFile(slug), 'utf8');

// ---------------------------------------------------------------- the stamp

// ISO to the second. Milliseconds say nothing here and cost a third of the column.
test('the stamp is ISO to the second, with a Z', () => {
  assert.equal(stamp(at('2026-08-21T09:14:02.987Z')), '2026-08-21T09:14:02Z');
  assert.match(stamp(), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/, 'and the same shape with no argument');
});

// ---------------------------------------------------------------- the elapsed figure

// The largest two units that fit. Seconds are dropped above an hour: at that scale they are
// noise, and the figure exists to be read at a glance against the count beside it.
test('elapsed reports the largest two units that fit', () => {
  assert.equal(elapsed(46_000), '+46s');
  assert.equal(elapsed(282_000), '+4m42s');
  assert.equal(elapsed(4_271_000), '+1h11m', 'seconds are noise at this scale');
  assert.equal(elapsed(500), '+1s', 'sub-second rounds rather than reading as nothing');
  assert.equal(elapsed(0), '+0s');
});

// A clock that went backwards, or a line that could not be parsed, produces no figure rather
// than a negative one — a wrong number is worse here than an absent one.
test('an impossible duration produces no figure at all', () => {
  for (const bad of [-1, NaN, Infinity, undefined, null]) {
    assert.equal(elapsed(bad), '', String(bad));
  }
});

// ---------------------------------------------------------------- where it lives

// At the topic root rather than in cache/, which is disposable. This is the only record of
// where a run spent its time, and it is read after the run rather than during it.
test('the log sits at the topic root, not under cache', () => {
  const path = logPath('demo');
  assert.equal(path, join(sandbox.cwd, 'digmore', 'demo', 'run_log.md'));
  assert.ok(!path.includes(`${join('digmore', 'demo', 'cache')}`), 'never inside the disposable half');
  assert.equal(RUN_LOG_NAME, 'run_log.md');
});

// ---------------------------------------------------------------- one line

// The marker gets its own column so the right-hand figure reads as a column, and the step name
// is the marker reporting.md already prints — the log and the terminal never invent separate
// vocabularies.
test('a step line is the time, the marker in its column, and what happened', () => {
  assert.equal(
    stepLine('[2.1/6] Extract · Search', 'start', { at: START }),
    '2026-08-21T09:14:02Z  [2.1/6]  Extract · Search · start\n',
  );
});

// Only a done carries an elapsed figure; a start has nothing to measure yet.
test('a done carries the elapsed figure and its note; a start carries neither', () => {
  const done = stepLine('[2.1/6] Extract · Search', 'done', {
    at: at('2026-08-21T09:18:44Z'),
    sinceMs: START.getTime(),
    note: '25 branch searchers, 302 URLs',
  });
  assert.match(done, /Extract · Search · done — 25 branch searchers, 302 URLs\s+\+4m42s\n$/);

  const start = stepLine('[2.1/6] Extract · Search', 'start', { at: START });
  assert.ok(!start.includes('+'), 'a start has nothing to measure yet');
});

// A step name with no marker still lines up, so a note or an unmarked step does not break the
// column the elapsed figures sit in.
test('a label with no marker keeps the column', () => {
  const line = stepLine('Vet', 'done', { at: START, sinceMs: START.getTime() - 1000 });
  assert.match(line, /^2026-08-21T09:14:02Z {2} {9}Vet · done\s+\+1s\n$/);
});

// A long note pushes past the column rather than being truncated — the note is the part that
// explains the duration, and losing it to keep a column straight is the wrong trade.
test('a long note pushes past the column instead of being cut', () => {
  const note = 'a'.repeat(120);
  const line = stepLine('[6.6/6] Audit · Fact check', 'done', {
    at: START,
    sinceMs: START.getTime() - 1000,
    note,
  });
  assert.ok(line.includes(note), 'nothing is truncated');
  assert.match(line, /\+1s\n$/, 'and the figure still lands at the end');
});

// ---------------------------------------------------------------- the verbs

test('header opens a block naming the run', () => {
  const result = run(['header', '--topic', 'demo', '--kind', 'fresh', '--mode', 'manual, full', '--run', '0'], { at: START });
  assert.equal(result.wrote, 'header');
  assert.equal(result.path, logFile());
  assert.equal(read(), '\n## run 2026-08-21T09:14:02Z — fresh · manual, full · run_history[0]\n\n');
});

// The run's identity comes from the caller: this script knows the clock, not the plan.
test('header omits what it was not given rather than inventing it', () => {
  run(['header', '--topic', 'demo', '--kind', 'fresh'], { at: START });
  assert.equal(read(), '\n## run 2026-08-21T09:14:02Z — fresh\n\n');
});

// The start goes in before the work, not held back until the step finishes: a run that dies in
// Vet has to leave a log showing it reached Vet.
test('start writes before the work, with no figure', () => {
  const result = run(['start', '[1/6] Plan', '--topic', 'demo'], { at: START });
  assert.equal(result.wrote, 'start');
  assert.equal(read(), '2026-08-21T09:14:02Z  [1/6]    Plan · start\n');
});

// Measured from the line above rather than from a remembered start, which is what lets a
// partial log still read correctly and keeps nothing in the orchestrator's context.
test('done measures from the previous timestamped line', () => {
  run(['start', '[1/6] Plan', '--topic', 'demo'], { at: START });
  run(['done', '[1/6] Plan', '--topic', 'demo', '--note', '1 scoping agent, 5 angles'], {
    at: at('2026-08-21T09:14:48Z'),
  });
  const lines = read().trim().split('\n');
  assert.match(lines[0], /\[1\/6\] {4}Plan · start$/);
  assert.match(lines[1], /Plan · done — 1 scoping agent, 5 angles\s+\+46s$/);
});

// A missing pair reads as a crash, and a skipped phase is not one — so a step that could not
// run says so on its done line rather than writing nothing.
test('a skipped step still writes its pair', () => {
  run(['start', '[3/6] Vet', '--topic', 'demo'], { at: START });
  run(['done', '[3/6] Vet', '--topic', 'demo', '--note', 'Reddit and Twitter unavailable, no API key'], {
    at: at('2026-08-21T09:14:03Z'),
  });
  assert.match(read(), /Vet · done — Reddit and Twitter unavailable, no API key/);
});

test('note writes a bare line, with no marker and no figure', () => {
  const result = run(['note', 'resumed at Vet, from an unfinished start', '--topic', 'demo'], { at: START });
  assert.equal(result.wrote, 'note');
  assert.equal(read(), '2026-08-21T09:14:02Z  resumed at Vet, from an unfinished start\n');
});

// Unlike audit.md, which describes one run, this is the record of what the topic has cost over
// its life — and the second run is when the first run's timings become useful.
test('a second run appends below the first, never replacing it', () => {
  run(['header', '--topic', 'demo', '--kind', 'fresh'], { at: START });
  run(['start', '[1/6] Plan', '--topic', 'demo'], { at: START });
  const first = read();

  run(['header', '--topic', 'demo', '--kind', 're-run'], { at: at('2026-08-22T10:00:00Z') });
  const second = read();
  assert.ok(second.startsWith(first), 'the first run is still there, byte for byte');
  assert.match(second, /## run 2026-08-22T10:00:00Z — re-run/);
});

// ---------------------------------------------------------------- reading it back

test('lastStampMs finds the last timestamped line, ignoring the header and the blanks', () => {
  run(['header', '--topic', 'demo', '--kind', 'fresh'], { at: at('2026-08-21T08:00:00Z') });
  run(['start', '[1/6] Plan', '--topic', 'demo'], { at: START });
  assert.equal(lastStampMs(logFile()), START.getTime());
});

test('an absent log has no last stamp, which is not an error', () => {
  assert.equal(lastStampMs(join(sandbox.cwd, 'digmore', 'nothing', 'run_log.md')), undefined);
});

// A hand-edited or partly-written file must not produce a wrong figure — it produces none.
test('a log with no parseable line has no last stamp', () => {
  mkdirSync(join(sandbox.cwd, 'digmore', 'demo'), { recursive: true });
  writeFileSync(logFile(), '## run — someone typed this by hand\nnot a timestamp\n');
  assert.equal(lastStampMs(logFile()), undefined);
});

// The first done of a run has a header above it and no timestamped line, so it writes without
// a figure rather than measuring against nothing.
test('a done with nothing above it writes no figure', () => {
  run(['header', '--topic', 'demo', '--kind', 'fresh'], { at: START });
  run(['done', '[1/6] Plan', '--topic', 'demo'], { at: START });
  const last = read().trim().split('\n').at(-1);
  assert.match(last, /Plan · done$/, 'no elapsed column at all');
});

// ---------------------------------------------------------------- refusals

test('every verb needs its topic', () => {
  assert.throws(() => run(['start', '[1/6] Plan'], { at: START }), /--topic/);
  assert.throws(() => run(['header', '--kind', 'fresh'], { at: START }), /--topic/);
});

test('start, done and note each need their text', () => {
  for (const verb of ['start', 'done', 'note']) {
    assert.throws(() => run([verb, '--topic', 'demo'], { at: START }), /needs its text/, verb);
  }
});

test('an unknown verb is refused rather than written', () => {
  assert.throws(() => run(['finish', '[1/6] Plan', '--topic', 'demo'], { at: START }), /unknown command/);
  assert.ok(!existsSync(logFile()), 'and nothing is created on the way');
});

// ---------------------------------------------------------------- through the cli

// The orchestrator calls this through Bash, which is the whole point: the timestamp comes from
// the shell, never from the model.
test('the cli writes the same file and reports the path on stdout', async () => {
  const header = await sandbox.run('runlog.mjs', 'header', '--topic', 'demo', '--kind', 'fresh', '--mode', 'manual, full');
  assert.equal(header.code, 0);
  assert.equal(header.json.wrote, 'header');

  await sandbox.run('runlog.mjs', 'start', '[2.1/6] Extract · Search', '--topic', 'demo');
  const done = await sandbox.run('runlog.mjs', 'done', '[2.1/6] Extract · Search', '--topic', 'demo', '--note', '25 branch searchers');
  assert.equal(done.code, 0);

  const text = read();
  assert.match(text, /## run \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ — fresh · manual, full/);
  assert.match(text, /\[2\.1\/6\] {2}Extract · Search · start/);
  assert.match(text, /Extract · Search · done — 25 branch searchers\s+\+\d+s/);
});

test('the cli exits 1 with the reason on stderr', async () => {
  const { code, err } = await sandbox.run('runlog.mjs', 'start', '[1/6] Plan');
  assert.equal(code, 1);
  assert.match(err, /--topic/);
});
