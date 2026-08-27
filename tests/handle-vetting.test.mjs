import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox } from './helpers.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

const topicDir = () => join(sandbox.cwd, 'digmore', 'demo');

function writeRoster(source, handles) {
  const dir = join(topicDir(), 'full_source_analysis');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${source}-handles.json`), JSON.stringify({ source, handles }));
}

function roster(source) {
  return JSON.parse(readFileSync(join(topicDir(), 'full_source_analysis', `${source}-handles.json`), 'utf8'));
}

function writeExperts(text) {
  mkdirSync(topicDir(), { recursive: true });
  writeFileSync(join(topicDir(), 'experts.csv'), text);
}

function writeVerdict(source, filename, payload) {
  const dir = join(topicDir(), 'cache', source, 'handles');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), JSON.stringify(payload));
}

const row = (handle, extra = {}) => ({
  handle,
  topImportance: 'supporting',
  claimCount: 1,
  documentCount: 1,
  documents: [`cache/reddit/${handle.replace('/', '_')}.json`],
  ...extra,
});

const verdictFor = (handle, extra = {}) => ({
  handle,
  source: 'reddit',
  verdict: 'legit',
  verdictReason: 'long history, on topic throughout',
  ...extra,
});

const hv = (...args) => sandbox.run('handle_vetting.mjs', ...args);

// ---------------------------------------------------------------- prepare

test('prepare caps the roster and freezes the remainder to a work list', async () => {
  writeRoster('reddit', [row('u/a'), row('u/b'), row('u/c')]);
  const { code, json } = await hv('prepare', '--topic', 'demo', '--source', 'reddit', '--cap', '2');

  assert.equal(code, 0);
  assert.equal(json.ranked, 2, 'the cap is applied');
  assert.equal(json.rosterHeld, 3, 'and the roster still says how many it held');
  assert.equal(json.worklist, 2);

  const worklist = JSON.parse(readFileSync(join(topicDir(), 'cache', 'reddit', 'vetting-worklist.json'), 'utf8'));
  assert.deepEqual(worklist.handles.map((served) => served.handle), ['u/a', 'u/b']);
  assert.ok(worklist.handles[0].row.documents, 'each entry carries the roster row a vetter needs');
});

test('prepare auto-promotes a handle already in experts.csv, and it never reaches the work list', async () => {
  writeRoster('reddit', [row('u/known'), row('u/new')]);
  writeExperts(
    'real_name,reddit,hn,twitter,github,website,sources,notes,last_active,topical_relevance\r\n' +
      'Known Person,known,,,kgh,,reddit,,2026-02-03,high\r\n',
  );

  const { json } = await hv('prepare', '--topic', 'demo', '--source', 'reddit');
  assert.equal(json.autoPromoted, 1);
  assert.equal(json.worklist, 1, 'the promoted handle is not dispatched');

  const promoted = roster('reddit').handles.find((entry) => entry.handle === 'u/known');
  assert.equal(promoted.verdict, 'legit');
  assert.match(promoted.verdictReason, /experts\.csv/);
  assert.deepEqual(promoted.vettingSignals, {}, 'no heuristic ran, so nothing was fired on');
  assert.equal(promoted.topicalRelevance, 'high');
  assert.equal(promoted.lastActive, '2026-02-03');
  assert.equal(promoted.github, 'kgh', 'the csv row fills the labelled fields it holds');
});

test('prepare matches experts.csv on the bare name as well as the prefixed handle', async () => {
  writeRoster('hackernews', [row('hn/pg')]);
  writeExperts(
    'real_name,reddit,hn,twitter,github,website,sources,notes,last_active,topical_relevance\r\n' +
      'Paul,,pg,,,,hackernews,,2026-01-01,high\r\n',
  );
  const { json } = await hv('prepare', '--topic', 'demo', '--source', 'hackernews');
  assert.equal(json.autoPromoted, 1, 'hn/pg matches the bare `pg` in the hn column');
});

test('forums never auto-promotes, because experts.csv has no forums column', async () => {
  writeRoster('forums', [row('someone')]);
  writeExperts(
    'real_name,reddit,hn,twitter,github,website,sources,notes,last_active,topical_relevance\r\n' +
      'Someone,someone,,,,,forums,,2026-01-01,high\r\n',
  );
  const { json } = await hv('prepare', '--topic', 'demo', '--source', 'forums');
  assert.equal(json.autoPromoted, 0);
  assert.equal(json.worklist, 1);
});

test('prepare skips a handle that already carries a verdict, and one that already has a file', async () => {
  writeRoster('reddit', [row('u/done', { verdict: 'promoter' }), row('u/filed'), row('u/todo')]);
  writeVerdict('reddit', 'u_filed.json', verdictFor('u/filed'));

  const { json } = await hv('prepare', '--topic', 'demo', '--source', 'reddit');
  assert.equal(json.skipped.alreadyVerdicted, 1);
  assert.equal(json.skipped.alreadyFiled, 1, 'the file existing is the record that it was vetted');
  assert.equal(json.worklist, 1);
});

test('prepare on a source with no roster reports it rather than throwing', async () => {
  const { code, json } = await hv('prepare', '--topic', 'demo', '--source', 'twitter');
  assert.equal(code, 0, 'a source that cannot be vetted is a finding, not a crash');
  assert.equal(json.missing, true);
  assert.equal(json.worklist, 0);
});

test('prepare decides Twitter depth over what is left, and only on Twitter', async () => {
  writeRoster('twitter', [row('x/a'), row('x/b'), row('x/c')]);
  const { json } = await hv(
    'prepare', '--topic', 'demo', '--source', 'twitter',
    '--deep-vetted', '2', '--posts-per-deep-vet', '40',
  );
  assert.equal(json.deepVetted, 2);

  const worklist = JSON.parse(readFileSync(join(topicDir(), 'cache', 'twitter', 'vetting-worklist.json'), 'utf8'));
  assert.deepEqual(worklist.handles.map((served) => served.posts), [40, 40, 0]);
});

test('a non-Twitter work list carries no post count at all', async () => {
  writeRoster('reddit', [row('u/a')]);
  await hv('prepare', '--topic', 'demo', '--source', 'reddit');
  const worklist = JSON.parse(readFileSync(join(topicDir(), 'cache', 'reddit', 'vetting-worklist.json'), 'utf8'));
  assert.equal('posts' in worklist.handles[0], false, 'the script has no depth to pass');
});

// ---------------------------------------------------------------- serve

test('serve hands back one range, one-based and inclusive', async () => {
  writeRoster('reddit', [row('u/a'), row('u/b'), row('u/c'), row('u/d')]);
  await hv('prepare', '--topic', 'demo', '--source', 'reddit');

  const { json } = await hv('serve', '--topic', 'demo', '--source', 'reddit', '--from', '2', '--to', '3');
  assert.deepEqual(json.handles.map((served) => served.handle), ['u/b', 'u/c']);
});

test('a range past the end is short rather than an error — the last one always is', async () => {
  writeRoster('reddit', [row('u/a'), row('u/b')]);
  await hv('prepare', '--topic', 'demo', '--source', 'reddit');

  const { code, json } = await hv('serve', '--topic', 'demo', '--source', 'reddit', '--from', '2', '--to', '6');
  assert.equal(code, 0);
  assert.deepEqual(json.handles.map((served) => served.handle), ['u/b']);
});

test('the work list does not move under a range as handles are vetted', async () => {
  writeRoster('reddit', [row('u/a'), row('u/b'), row('u/c')]);
  await hv('prepare', '--topic', 'demo', '--source', 'reddit');

  // The first vetter finishes. Recomputing the unvetted list here would shift everyone up,
  // and "handles 2 to 3" would then address what used to be 3 and 4.
  writeVerdict('reddit', 'u_a.json', verdictFor('u/a'));
  const { json } = await hv('serve', '--topic', 'demo', '--source', 'reddit', '--from', '2', '--to', '3');
  assert.deepEqual(json.handles.map((served) => served.handle), ['u/b', 'u/c']);
});

test('serve before prepare says which call is missing', async () => {
  const { code, err } = await hv('serve', '--topic', 'demo', '--source', 'reddit', '--from', '1', '--to', '2');
  assert.equal(code, 1);
  assert.match(err, /prepare/);
});

// ---------------------------------------------------------------- aggregate

test('aggregate merges the per-handle files onto the rows that already exist', async () => {
  writeRoster('reddit', [row('u/a'), row('u/b')]);
  await hv('prepare', '--topic', 'demo', '--source', 'reddit');
  writeVerdict('reddit', 'u_a.json', verdictFor('u/a', {
    topicalRelevance: 'high',
    vettingSignals: { karma: '41200' },
    lastActive: '2026-08-20',
    realName: 'Alice Ng',
    github: 'alng',
  }));

  const { json } = await hv('aggregate', '--topic', 'demo', '--source', 'reddit');
  assert.equal(json.merged, 1);

  const merged = roster('reddit').handles.find((entry) => entry.handle === 'u/a');
  assert.equal(merged.verdict, 'legit');
  assert.equal(merged.realName, 'Alice Ng');
  assert.equal(merged.vettingSignals.karma, '41200');
  assert.deepEqual(merged.documents, ['cache/reddit/u_a.json'], 'the ranking data is never rebuilt');
});

test('aggregate discards a malformed file with its reason, and reports the gap', async () => {
  writeRoster('reddit', [row('u/a'), row('u/b')]);
  await hv('prepare', '--topic', 'demo', '--source', 'reddit');
  writeVerdict('reddit', 'u_a.json', verdictFor('u/a'));
  writeVerdict('reddit', 'u_b.json', { handle: 'u/b', source: 'reddit', verdict: 'promoter' }); // no reason

  const { json } = await hv('aggregate', '--topic', 'demo', '--source', 'reddit');
  assert.equal(json.merged, 1);
  assert.equal(json.discarded.length, 1);
  assert.match(json.discarded[0].reason, /verdictReason/, 'a sentence, not a nested error object');
  assert.deepEqual(json.noFile, ['u/b'], 'a discarded file leaves its handle in the gap report');

  assert.equal(roster('reddit').handles.find((entry) => entry.handle === 'u/b').verdict, undefined);
});

test('the auto-promoted never read as missing, because they were never on the work list', async () => {
  writeRoster('reddit', [row('u/known'), row('u/todo')]);
  writeExperts(
    'real_name,reddit,hn,twitter,github,website,sources,notes,last_active,topical_relevance\r\n' +
      'Known,known,,,,,reddit,,2026-01-01,high\r\n',
  );
  await hv('prepare', '--topic', 'demo', '--source', 'reddit');
  writeVerdict('reddit', 'u_todo.json', verdictFor('u/todo'));

  const { json } = await hv('aggregate', '--topic', 'demo', '--source', 'reddit');
  assert.deepEqual(json.noFile, []);
});

test('a verdict file for a handle nobody ranked is reported, never appended', async () => {
  writeRoster('reddit', [row('u/a')]);
  await hv('prepare', '--topic', 'demo', '--source', 'reddit');
  writeVerdict('reddit', 'u_stranger.json', verdictFor('u/stranger'));

  const { json } = await hv('aggregate', '--topic', 'demo', '--source', 'reddit');
  assert.deepEqual(json.unmatched, ['u/stranger']);
  assert.equal(roster('reddit').handles.length, 1, 'the roster is the authority on who exists');
});

// ---------------------------------------------------------------- cli

test('the source has to be one that carries handles', async () => {
  const { code, err } = await hv('prepare', '--topic', 'demo', '--source', 'websearch');
  assert.equal(code, 1);
  assert.match(err, /reddit, hackernews, twitter, forums/);
});

test('an unknown verb names the three', async () => {
  const { code, err } = await hv('vet', '--topic', 'demo', '--source', 'reddit');
  assert.equal(code, 1);
  assert.match(err, /prepare, serve or aggregate/);
});
