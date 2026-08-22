import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox } from './helpers.mjs';
import * as experts from '../skill/scripts/experts.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

const csvPath = () => join(sandbox.cwd, 'digmore', 'demo', 'experts.csv');
const csv = () => readFileSync(csvPath(), 'utf8');

async function add(...args) {
  return sandbox.run('experts.mjs', 'add', 'demo', ...args);
}

// vetting.md: "Schema (column order is load-bearing)". last_active and topical_relevance
// are the two appended columns; landscape.md's Hubs table reads both.
const COLUMNS = [
  'real_name', 'reddit', 'hn', 'twitter', 'github', 'website', 'sources', 'notes', 'last_active',
  'topical_relevance',
];

test('the column order is the documented column order', () => {
  assert.deepEqual(experts.COLUMNS, COLUMNS);
});

test('list on a missing topic creates a header-only file', async () => {
  const { code, out } = await sandbox.run('experts.mjs', 'list', 'demo');
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out), []);
  assert.equal(csv(), `${COLUMNS.join(',')}\r\n`, 'header only, CRLF as the csv module writes');
});

test('add writes a row under digmore/<slug>/experts.csv', async () => {
  const { code, out } = await add('--real-name', 'Ada Lovelace', '--reddit', 'ada', '--sources', 'reddit');
  assert.equal(code, 0);
  assert.equal(out.trim(), 'added');
  assert.equal(csv(), `${COLUMNS.join(',')}\r\nAda Lovelace,ada,,,,,reddit,,,\r\n`);
});

// vetting.md: "the user's real last post/comment, YYYY-MM-DD — NOT the vetting run date."
test('last_active is recorded and kept', async () => {
  await add('--real-name', 'Ada Lovelace', '--reddit', 'ada', '--last-active', '2026-07-01');
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows[0].last_active, '2026-07-01');
});

test('across sources the latest date wins', async () => {
  await add('--real-name', 'Ada Lovelace', '--reddit', 'ada', '--last-active', '2026-01-15');
  await add('--real-name', 'Ada Lovelace', '--hn', 'ada_hn', '--last-active', '2026-07-01');
  await add('--real-name', 'Ada Lovelace', '--twitter', 'ada_x', '--last-active', '2025-03-09');
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last_active, '2026-07-01', 'last active anywhere, not last reported');
});

test('an older date does not count as a change', async () => {
  await add('--real-name', 'Ada Lovelace', '--reddit', 'ada', '--last-active', '2026-07-01');
  const { out } = await add('--real-name', 'Ada Lovelace', '--reddit', 'ada', '--last-active', '2025-01-01');
  assert.equal(out.trim(), 'no-op');
});

test('a person with no known last_active is still a valid row', async () => {
  const { code } = await add('--real-name', 'Ada Lovelace', '--reddit', 'ada');
  assert.equal(code, 0);
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows[0].last_active, '', 'empty, which the Hubs table renders as —');
});

// Idempotent: re-merging the same row is a no-op.
test('re-adding the same row is a no-op and does not rewrite the file', async () => {
  await add('--real-name', 'Ada Lovelace', '--reddit', 'ada', '--sources', 'reddit');
  const before = csv();
  const { out } = await add('--real-name', 'Ada Lovelace', '--reddit', 'ada', '--sources', 'reddit');
  assert.equal(out.trim(), 'no-op');
  assert.equal(csv(), before);
});

test('a matching row fills in missing handles rather than duplicating', async () => {
  await add('--real-name', 'Ada Lovelace', '--reddit', 'ada');
  const { out } = await add('--real-name', 'Ada Lovelace', '--hn', 'ada_hn', '--twitter', 'ada_x');
  assert.equal(out.trim(), 'merged-handles');
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reddit, 'ada');
  assert.equal(rows[0].hn, 'ada_hn');
  assert.equal(rows[0].twitter, 'ada_x');
});

test('a shared handle matches even when the name is missing', async () => {
  await add('--real-name', 'Ada Lovelace', '--reddit', 'ada');
  const { out } = await add('--real-name', '', '--reddit', 'ada', '--github', 'adagh');
  assert.equal(out.trim(), 'merged-handles');
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].github, 'adagh');
});

test('matching ignores case and surrounding space', async () => {
  await add('--real-name', 'Ada Lovelace', '--reddit', 'ada');
  const { out } = await add('--real-name', '  ada lovelace  ', '--hn', 'ada_hn');
  assert.equal(out.trim(), 'merged-handles');
});

test('an empty handle never matches an empty handle', async () => {
  await add('--real-name', 'Ada Lovelace');
  const { out } = await add('--real-name', 'Grace Hopper');
  assert.equal(out.trim(), 'added', 'two people with no handles are still two people');
  assert.equal(JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out).length, 2);
});

// vetting.md — sources is a pipe-separated list of where the person is active.
test('sources are unioned, in first-seen order, without duplicates', async () => {
  await add('--real-name', 'Ada Lovelace', '--sources', 'reddit|hackernews');
  await add('--real-name', 'Ada Lovelace', '--sources', 'hackernews|twitter');
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows[0].sources, 'reddit|hackernews|twitter');
});

test('notes are appended once, not repeated', async () => {
  await add('--real-name', 'Ada Lovelace', '--notes', 'wrote the first program');
  await add('--real-name', 'Ada Lovelace', '--notes', 'analytical engine');
  await add('--real-name', 'Ada Lovelace', '--notes', 'analytical engine');
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows[0].notes, 'wrote the first program; analytical engine');
});

// A conflict appends as new with a POSSIBLE DUP note, rather than merging two real
// people into one row.
test('a row matching two people is appended and flagged, never merged', async () => {
  await add('--real-name', 'Ada Lovelace', '--reddit', 'ada');
  await add('--real-name', 'Grace Hopper', '--hn', 'grace');
  const { out } = await add('--real-name', 'Someone Else', '--reddit', 'ada', '--hn', 'grace');
  assert.equal(out.trim(), 'added');
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows.length, 3, 'two real people are not collapsed into one');
  assert.match(rows[2].notes, /POSSIBLE DUP/);
  assert.match(rows[2].notes, /Ada Lovelace/);
  assert.match(rows[2].notes, /Grace Hopper/);
});

// Atomic .tmp + rename, so a crash mid-write cannot leave a half-written file. This guards a
// different failure from the lock that used to sit beside it, and it stays.
test('the write is atomic and leaves no .tmp behind', async () => {
  await add('--real-name', 'Ada Lovelace');
  const files = readdirSync(join(sandbox.cwd, 'digmore', 'demo'));
  assert.deepEqual(files, ['experts.csv'], 'no .tmp, and no .lock either');
});

// There is one writer now, and so no lock. Vet's Handle Vetters fan out one per handle and hand
// back a short object each; the orchestrator writes this file, in batches as they arrive. A lock
// existed for a fan-out that no longer happens, and a fan-out writer coming back is a design to
// change rather than a lock to restore.
test('a sequence of adds all survive, and none leaves a lock behind', async () => {
  const names = ['Ada', 'Grace', 'Barbara', 'Katherine', 'Margaret', 'Dorothy', 'Mary'];
  for (const name of names) {
    const result = await add('--real-name', name, '--reddit', name.toLowerCase());
    assert.equal(result.code, 0, result.err);
  }
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows.length, names.length);
  assert.deepEqual([...rows.map((row) => row.real_name)].sort(), [...names].sort());
  assert.deepEqual(readdirSync(join(sandbox.cwd, 'digmore', 'demo')), ['experts.csv']);
});

// A leftover .lock from a version that took one is not a file this script knows about, so it
// must not block, break or be tidied away — it is simply ignored.
test('a lock file left by an older version is ignored rather than waited on', async () => {
  mkdirSync(join(sandbox.cwd, 'digmore', 'demo'), { recursive: true });
  writeFileSync(`${csvPath()}.lock`, '');
  const { code } = await add('--real-name', 'Ada', '--reddit', 'ada');
  assert.equal(code, 0, 'nothing waits on it, so it cannot time out');
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows.length, 1);
});

test('csv special characters survive a round trip', async () => {
  const notes = 'said "it depends", then left; comma, and a\nnewline';
  await add('--real-name', 'Ada Lovelace', '--notes', notes);
  const raw = csv();
  assert.match(raw, /""it depends""/, 'quotes are doubled, as the csv module writes them');
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows[0].notes, notes);
});

test('a hand-edited file with extra columns is read without losing the known ones', async () => {
  mkdirSync(join(sandbox.cwd, 'digmore', 'demo'), { recursive: true });
  writeFileSync(
    csvPath(),
    'real_name,reddit,hn,twitter,github,website,sources,notes,last_active,extra\r\nAda,ada,,,,,reddit,,2026-01-01,ignored\r\n',
  );
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows[0].real_name, 'Ada');
  assert.equal(rows[0].reddit, 'ada');
  assert.equal(rows[0].last_active, '2026-01-01');
  assert.deepEqual(Object.keys(rows[0]), COLUMNS, 'the row is normalised to the schema');
});

// last_active was appended, not inserted, so a file written before it existed still reads.
test('an eight-column file from before last_active still loads', async () => {
  mkdirSync(join(sandbox.cwd, 'digmore', 'demo'), { recursive: true });
  writeFileSync(
    csvPath(),
    'real_name,reddit,hn,twitter,github,website,sources,notes\r\nAda,ada,,,,,reddit,sharp\r\n',
  );
  const rows = JSON.parse((await sandbox.run('experts.mjs', 'list', 'demo')).out);
  assert.equal(rows[0].real_name, 'Ada');
  assert.equal(rows[0].notes, 'sharp');
  assert.equal(rows[0].last_active, '');

  await add('--real-name', 'Ada', '--last-active', '2026-07-01');
  assert.match(csv(), /last_active/, 'the file is upgraded in place on the next write');
});

test('add requires --real-name and a topic', async () => {
  assert.notEqual((await sandbox.run('experts.mjs', 'add', 'demo')).code, 0);
  assert.notEqual((await sandbox.run('experts.mjs', 'add', '--real-name', 'Ada')).code, 0);
  assert.notEqual((await sandbox.run('experts.mjs', 'nope', 'demo')).code, 0);
  assert.ok(!existsSync(csvPath()), 'a bad invocation writes nothing');
});

// A row needs something to identify a person by. An empty real_name is fine — plenty
// of experts are known only as u/someone — but a row with neither name nor handle
// can never match anything and is not a person.
test('a row with no name and no handle is refused', async () => {
  const { code, err } = await add('--real-name', '', '--sources', 'reddit', '--notes', 'sharp');
  assert.notEqual(code, 0);
  assert.match(err, /handle/i);
  assert.ok(!existsSync(csvPath()), 'nothing is written');
});

test('a handle alone is enough to record someone', async () => {
  for (const handle of ['reddit', 'hn', 'twitter', 'github', 'website']) {
    const caseSandbox = new Sandbox();
    try {
      const { code } = await caseSandbox.run('experts.mjs', 'add', 'demo', '--real-name', '', `--${handle}`, 'someone');
      assert.equal(code, 0, handle);
    } finally {
      await caseSandbox.cleanup();
    }
  }
});

// The merge function is pure — no I/O, no mutation of its inputs.
test('merge does no I/O and returns a new list', () => {
  const existing = [experts.row({ real_name: 'Ada', reddit: 'ada' })];
  const [merged, action] = experts.merge(existing, experts.row({ real_name: 'Ada', hn: 'ada_hn' }));
  assert.equal(action, 'merged-handles');
  assert.equal(existing[0].hn, '', 'the input list is not mutated');
  assert.equal(merged[0].hn, 'ada_hn');
});

// ---------------------------------------------------------------- topical_relevance
//
// vet_phase_b.md step 4 judges how on-topic a person is and step 5 records it. Before the
// column existed the judgement was made and thrown away, and landscape.md's Hubs table
// filtered on a field nothing wrote.

test('topical_relevance is recorded', async () => {
  await add('--real-name', 'Ada Lovelace', '--reddit', 'ada', '--topical-relevance', 'high');
  const rows = experts.load(csvPath());
  assert.equal(rows[0].topical_relevance, 'high');
});

test('across sources the strongest reading wins', async () => {
  // Squarely on-topic in one place and glancing in another is on-topic.
  await add('--real-name', 'Ada Lovelace', '--reddit', 'ada', '--topical-relevance', 'low');
  await add('--real-name', 'Ada Lovelace', '--hn', 'ada_hn', '--topical-relevance', 'high');
  await add('--real-name', 'Ada Lovelace', '--twitter', 'ada_x', '--topical-relevance', 'medium');
  const rows = experts.load(csvPath());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].topical_relevance, 'high');
});

test('a weaker reading does not overwrite a stronger one', async () => {
  await add('--real-name', 'Ada Lovelace', '--reddit', 'ada', '--topical-relevance', 'high');
  const { out } = await add('--real-name', 'Ada Lovelace', '--reddit', 'ada', '--topical-relevance', 'low');
  assert.equal(out.trim(), 'no-op');
  assert.equal(experts.load(csvPath())[0].topical_relevance, 'high');
});

test('an unknown relevance value is refused, not stored', async () => {
  // A misspelt value reads as "not high or medium" and silently drops the person from
  // the Hubs table, which is the failure this column exists to fix.
  const { code, err } = await add('--real-name', 'Ada', '--reddit', 'ada', '--topical-relevance', 'High!');
  assert.equal(code, 1);
  assert.match(err, /--topical-relevance must be one of/);
  assert.equal(existsSync(csvPath()), false, 'nothing was written');
});

test('a row with no relevance judgement is still valid', async () => {
  const { code } = await add('--real-name', 'Ada Lovelace', '--reddit', 'ada');
  assert.equal(code, 0);
  assert.equal(experts.load(csvPath())[0].topical_relevance, '');
});

test('a nine-column file from before topical_relevance still loads', async () => {
  mkdirSync(join(sandbox.cwd, 'digmore', 'demo'), { recursive: true });
  writeFileSync(
    csvPath(),
    'real_name,reddit,hn,twitter,github,website,sources,notes,last_active\r\n' +
      'Ada,ada,,,,,reddit,,2026-01-01\r\n',
  );
  const rows = experts.load(csvPath());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last_active, '2026-01-01');
  assert.equal(rows[0].topical_relevance, '');

  await add('--real-name', 'Ada', '--topical-relevance', 'medium');
  assert.match(csv(), /topical_relevance/, 'the file is upgraded in place on the next write');
});
