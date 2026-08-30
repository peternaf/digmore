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
