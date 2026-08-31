/**
 * The player-document floor — `enrich.minPlayerDocuments`.
 *
 * The floor is the only thing separating a candidate from an entity the run merely mentioned, and
 * it is the one configuration that reads backwards: it is a floor rather than a budget, so fast
 * mode's LOWER value admits MORE players. A fast run gathers roughly a sixth of full mode's
 * material, and an entity almost never reaches the full-mode floor in that.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox } from './helpers.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

const topicDir = () => join(sandbox.cwd, 'digmore', 'demo');

/** One entity named once in each of `documents` distinct claims files, by a never-vetted handle. */
function writePlayers(source, name, documents) {
  const dir = join(topicDir(), 'full_source_analysis');
  mkdirSync(dir, { recursive: true });
  const claims = Array.from({ length: documents }, (_unused, index) => ({
    file: `cache/${source}/${source}-thread-${index}-claims.json`,
    index: 0,
    handle: `someone-${index}`,
  }));
  writeFileSync(join(dir, `${source}-players.json`), JSON.stringify({ source, players: [{ name, claims }] }));
}

const candidates = () => JSON.parse(readFileSync(join(topicDir(), 'player_candidates.json'), 'utf8'));

test('full mode holds an entity named in three documents below the floor', async () => {
  writePlayers('reddit', 'Acme Video', 3);

  const result = await sandbox.run('players.mjs', 'candidates', '--topic', 'demo');

  assert.equal(result.code, 0, result.err);
  const written = candidates();
  assert.equal(written.minDocuments, 5, 'the full-mode floor comes from enrich.minPlayerDocuments');
  assert.deepEqual(written.candidates, [], 'three documents is short of five');
  assert.equal(written.belowFloor[0]?.name, 'Acme Video', 'and it is reported rather than dropped silently');
});

test('--fast admits the same entity, because the fast floor is lower', async () => {
  writePlayers('reddit', 'Acme Video', 3);

  const result = await sandbox.run('players.mjs', 'candidates', '--topic', 'demo', '--fast');

  assert.equal(result.code, 0, result.err);
  const written = candidates();
  assert.equal(written.minDocuments, 2);
  assert.equal(written.candidates[0]?.name, 'Acme Video');
  assert.deepEqual(written.belowFloor, []);
});

// The floor is still a floor in fast mode: two is not none.
test('--fast still cuts an entity named in one document', async () => {
  writePlayers('reddit', 'Acme Video', 1);

  await sandbox.run('players.mjs', 'candidates', '--topic', 'demo', '--fast');

  const written = candidates();
  assert.deepEqual(written.candidates, []);
  assert.equal(written.belowFloor[0]?.name, 'Acme Video');
});

// What makes a floor debuggable against a topic already on disk.
test('--min-documents overrides the configuration in both modes', async () => {
  writePlayers('reddit', 'Acme Video', 3);

  await sandbox.run('players.mjs', 'candidates', '--topic', 'demo', '--min-documents', '3');
  assert.equal(candidates().minDocuments, 3);
  assert.equal(candidates().candidates[0]?.name, 'Acme Video');

  await sandbox.run('players.mjs', 'candidates', '--topic', 'demo', '--fast', '--min-documents', '4');
  assert.equal(candidates().minDocuments, 4, 'an explicit value beats the fast reduction too');
  assert.deepEqual(candidates().candidates, []);
});

test('--min-documents is still refused when it is not a whole number of 1 or more', async () => {
  writePlayers('reddit', 'Acme Video', 3);

  const result = await sandbox.run('players.mjs', 'candidates', '--topic', 'demo', '--min-documents', '0');

  assert.equal(result.code, 1);
  assert.match(result.err, /whole number of 1 or more/);
});

// ---------------------------------------------------------------- the profile merge
//
// The orchestrator no longer writes a cell. Each Player Profiler leaves one file and returns a
// word; `players.mjs profiles` merges them. Run against a real 21-row topic, the merge reproduced
// the CSV the orchestrator used to write by hand, byte for byte.
//
// Every field of `player-profile` is a column name and is written verbatim. There is no field whose
// column is called something else, which is why nothing here tests a transform.

const HEADER = 'name,positioning,url,repo_url,monthly_visits';

function writeCsv(rows) {
  mkdirSync(topicDir(), { recursive: true });
  writeFileSync(join(topicDir(), 'players.csv'), [HEADER, ...rows].join('\n') + '\n');
}

function writeProfile(fileName, profile) {
  const dir = join(topicDir(), 'cache', 'players', 'profiles');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), JSON.stringify(profile));
}

const csv = () => readFileSync(join(topicDir(), 'players.csv'), 'utf8');

test('the merge fills a row from its profile file, every column verbatim', async () => {
  writeCsv(['Acme Video,,,,']);
  writeProfile('acme-video.json', {
    fetch_failed: false,
    positioning: 'does the thing',
    url: 'https://acme.video',
    monthly_visits: '1.2M',
  });

  const result = await sandbox.run('players.mjs', 'profiles', '--topic', 'demo');

  assert.equal(result.code, 0, result.err);
  assert.equal(result.json.filled, 1);
  assert.match(csv(), /^Acme Video,does the thing,https:\/\/acme\.video,,1\.2M$/m);
});

// The two links are two facts. One column made the repo disappear on every open-source player —
// Frigate's repo is on GitHub and its site is frigate.video, and only one of those survived.
test('url and repo_url are separate columns, and either may be absent', async () => {
  writeCsv(['Both,,,,', 'SiteOnly,,,,']);
  writeProfile('both.json', {
    fetch_failed: false,
    url: 'https://frigate.video',
    repo_url: 'https://github.com/blakeblackshear/frigate',
  });
  writeProfile('siteonly.json', { fetch_failed: false, url: 'https://acme.dev' });

  await sandbox.run('players.mjs', 'profiles', '--topic', 'demo');

  assert.match(csv(), /^Both,,https:\/\/frigate\.video,https:\/\/github\.com\/blakeblackshear\/frigate,$/m);
  assert.match(csv(), /^SiteOnly,,https:\/\/acme\.dev,,$/m, 'no repo, empty cell');
});

// Which optional columns a run carries is decided per topic and recorded nowhere but the header.
test('a returned field with no column is not written, and is named in the summary', async () => {
  writeCsv(['Acme,,,,']);
  writeProfile('acme.json', {
    fetch_failed: false,
    positioning: 'kept',
    notable_customers: 'nobody asked for this',
  });

  const result = await sandbox.run('players.mjs', 'profiles', '--topic', 'demo');

  assert.equal(csv().includes('nobody asked for this'), false, 'no column, no cell');
  assert.equal(csv().split('\n')[0], HEADER, 'and no column invented for it');
  assert.deepEqual(result.json.unwritten, [{ name: 'Acme', fields: ['notable_customers'] }]);
});

test('a malformed profile is discarded and named, and the row keeps what it had', async () => {
  writeCsv(['Acme,already here,,,']);
  writeProfile('acme.json', { positioning: 'no fetch_failed anywhere' });

  const result = await sandbox.run('players.mjs', 'profiles', '--topic', 'demo');

  assert.equal(result.json.malformed[0]?.name, 'Acme');
  assert.match(result.json.malformed[0].problem, /fetch_failed/);
  assert.match(csv(), /^Acme,already here,,,$/m, 'the row is untouched, not blanked');
});

test('fetch_failed leaves the row empty and carries its reason', async () => {
  writeCsv(['Acme,,,,']);
  writeProfile('acme.json', { fetch_failed: true, reason: 'similarweb-blocked' });

  const result = await sandbox.run('players.mjs', 'profiles', '--topic', 'demo');

  assert.deepEqual(result.json.failed, [{ name: 'Acme', reason: 'similarweb-blocked' }]);
  assert.equal(result.json.filled, 0);
});

test('a row with no profile file is counted as still empty', async () => {
  writeCsv(['Acme,,,,', 'Ghost,,,,']);
  writeProfile('acme.json', { fetch_failed: false, positioning: 'here' });

  const result = await sandbox.run('players.mjs', 'profiles', '--topic', 'demo');

  assert.deepEqual(result.json.missing, ['Ghost']);
  assert.equal(result.json.stillEmpty, 1);
});

// The orchestrator decides retry-or-ask off this one number, and a row is as empty when its
// profiler failed as when it wrote nothing at all.
test('still empty counts every row that received no cells, not only the ones with no file', async () => {
  writeCsv(['Filled,,,,', 'Failed,,,,', 'Malformed,,,,', 'Ghost,,,,']);
  writeProfile('filled.json', { fetch_failed: false, positioning: 'here' });
  writeProfile('failed.json', { fetch_failed: true, reason: 'captcha' });
  writeProfile('malformed.json', { positioning: 'no fetch_failed flag' });

  const result = await sandbox.run('players.mjs', 'profiles', '--topic', 'demo');

  assert.equal(result.json.filled, 1);
  assert.equal(result.json.stillEmpty, 3);
});

// A merge does not get to widen the selection: that was the orchestrator's decision.
test('a profile matching no row is an orphan, not a new row', async () => {
  writeCsv(['Acme,,,,']);
  writeProfile('acme.json', { fetch_failed: false, positioning: 'here' });
  writeProfile('stranger.json', { fetch_failed: false, positioning: 'uninvited' });

  const result = await sandbox.run('players.mjs', 'profiles', '--topic', 'demo');

  assert.deepEqual(result.json.orphans, ['stranger.json']);
  assert.equal(result.json.rows, 1);
  assert.equal(csv().includes('uninvited'), false);
});

// Resume runs the merge before dispatching anything, so it has to be safe to run twice.
test('the merge is idempotent', async () => {
  writeCsv(['Acme Video,,,,']);
  writeProfile('acme-video.json', { fetch_failed: false, positioning: 'x', url: 'https://a.dev' });

  await sandbox.run('players.mjs', 'profiles', '--topic', 'demo');
  const once = csv();
  await sandbox.run('players.mjs', 'profiles', '--topic', 'demo');

  assert.equal(csv(), once);
});

test('no players.csv is an error — the rows are written before profiling starts', async () => {
  mkdirSync(topicDir(), { recursive: true });

  const result = await sandbox.run('players.mjs', 'profiles', '--topic', 'demo');

  assert.equal(result.code, 1);
  assert.match(result.err, /no players\.csv/);
});
