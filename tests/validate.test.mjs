/**
 * validate.mjs — the shape check every sub-agent return goes through.
 *
 * Structure only. These tests pin what it catches, what it deliberately does not, and
 * that the shapes in brain/schemas.md and scripts/schemas.json have not drifted apart.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox, repoRoot } from './helpers.mjs';

const schemasJson = JSON.parse(
  readFileSync(join(repoRoot, 'skill', 'scripts', 'schemas.json'), 'utf8'),
);

/** Write the payload beside the sandbox cwd and check it, the way the skill does. */
async function check(shape, payload) {
  const sandbox = new Sandbox();
  try {
    writeFileSync(join(sandbox.cwd, 'payload.json'), JSON.stringify(payload));
    return await sandbox.run('validate.mjs', shape, 'payload.json');
  } finally {
    await sandbox.cleanup();
  }
}

const paths = (result) => (result.json?.errors ?? []).map((error) => error.path);

// ------------------------------------------------------------------ payloads

const orientation = () => ({
  queries: ['video api providers 2026', 'video api pricing complaints'],
  vocabulary: ['per-minute billing', 'live-to-VOD', 'ingest latency'],
  recurring_names: ['Mux', 'Cloudflare Stream', 'Livepeer'],
  live_arguments: ['whether per-minute pricing survives at scale'],
});

const sourceExtract = () => ({
  sourceQuality: 'secondary',
  claims: [
    { claim: 'Mux charges per minute', quote: '$0.005 per minute', importance: 'central', kind: 'qualitative' },
  ],
});

// ------------------------------------------------------------------ the happy path

test('every shape in schemas.json has a name the CLI will accept', async () => {
  const sandbox = new Sandbox();
  try {
    const result = await sandbox.run('validate.mjs', '--shapes');
    assert.equal(result.code, 0);
    assert.deepEqual(result.json.shapes, Object.keys(schemasJson));
  } finally {
    await sandbox.cleanup();
  }
});

test('a well-formed payload exits 0 and says so', async () => {
  const result = await check('orientation', orientation());
  assert.equal(result.code, 0);
  assert.equal(result.json.valid, true);
  assert.deepEqual(result.json.errors, []);
});

test('optional fields may be absent', async () => {
  const result = await check('verifier', { verdict: 'verified' });
  assert.equal(result.code, 0);
});

// ------------------------------------------------------------------ what it catches

test('a missing required key is named by path', async () => {
  const payload = orientation();
  delete payload.vocabulary;
  const result = await check('orientation', payload);
  assert.equal(result.code, 1);
  assert.equal(result.json.valid, false);
  assert.deepEqual(result.json.errors, [{ path: 'vocabulary', message: 'required' }]);
});

test('a required key nested in an array item carries its index', async () => {
  // Two claims, and the second is the broken one — an error that named only the key
  // would leave the caller opening every item to find which.
  const payload = sourceExtract();
  payload.claims.push({ claim: 'Livepeer is cheaper', quote: 'about a tenth', importance: 'supporting', kind: 'qualitative' });
  delete payload.claims[1].importance;
  const result = await check('source-extractor', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['claims[1].importance']);
});

test('an empty string is missing, not present', async () => {
  // A sub-agent with no answer that does not want to say so returns "".
  const payload = sourceExtract();
  payload.claims[0].quote = '';
  const result = await check('source-extractor', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['claims[0].quote']);
});

test('a bad enum value lists what was allowed', async () => {
  const payload = sourceExtract();
  payload.sourceQuality = 'pretty-good';
  const result = await check('source-extractor', payload);
  assert.equal(result.code, 1);
  assert.match(result.json.errors[0].message, /must be one of/);
  assert.match(result.json.errors[0].message, /"primary-3p"/);
  assert.match(result.json.errors[0].message, /got "pretty-good"/);
});

test('the wrong JSON type is reported with both types', async () => {
  const payload = orientation();
  payload.vocabulary = 'per-minute billing, live-to-VOD';
  const result = await check('orientation', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(result.json.errors, [
    { path: 'vocabulary', message: 'expected array, got string' },
  ]);
});

test('a wrong-typed value is not then checked against the rules for its keys', async () => {
  // Otherwise one bad type produces a cascade of nonsense errors and the repair prompt
  // is unreadable.
  const payload = sourceExtract();
  payload.claims[0] = 'Mux charges per minute';
  const result = await check('source-extractor', payload);
  assert.equal(result.json.errors.length, 1);
});

test('number bounds are enforced', async () => {
  const result = await check('branch-searcher', {
    results: [{ url: 'https://example.com', title: 'Example', relevance: 1.4 }],
  });
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['results[0].relevance']);
});

test('every problem is reported at once, not just the first', async () => {
  // The repair pass gets one attempt, so it has to be told everything in one go.
  const payload = sourceExtract();
  delete payload.sourceQuality;
  delete payload.claims[0].claim;
  payload.claims[0].importance = 'vital';
  const result = await check('source-extractor', payload);
  assert.deepEqual(paths(result).sort(), [
    'claims[0].claim',
    'claims[0].importance',
    'sourceQuality',
  ]);
});

// ------------------------------------------------------------------ the conditional rule

test('a quantitative claim without its unit fails', async () => {
  const payload = sourceExtract();
  payload.claims[0] = {
    claim: 'Mux raised $105M',
    quote: 'raised $105 million',
    importance: 'central',
    kind: 'quantitative',
    value: 105,
  };
  const result = await check('source-extractor', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(result.json.errors, [
    { path: 'claims[0].unit', message: 'required when kind is "quantitative"' },
  ]);
});

test('a qualitative claim without a unit is fine', async () => {
  const result = await check('source-extractor', sourceExtract());
  assert.equal(result.code, 0);
});

// ------------------------------------------------------------------ the local branch

test('internal is an allowed source quality', async () => {
  // The user's own documents are tagged `internal`; before this the enum stopped at
  // `unreliable` and the branch could not label its own content.
  const payload = sourceExtract();
  payload.sourceQuality = 'internal';
  const result = await check('source-extractor', payload);
  assert.equal(result.code, 0);
});

test('internal is allowed on a synthesized finding source too', async () => {
  const result = await check('synthesizer', {
    findings: [
      {
        claim: 'churn is concentrated in month two',
        confidence: 'medium',
        sources: [{ url: 'digmore/x/cache/local/churn.md', sourceQuality: 'internal' }],
      },
    ],
    stats: {},
  });
  assert.equal(result.code, 0);
});

// ------------------------------------------------------------------ quick mode

test('one query is enough — orientation is not measured by volume', async () => {
  const payload = orientation();
  payload.queries = payload.queries.slice(0, 1);
  const result = await check('orientation', payload);
  assert.equal(result.code, 0);
});

// Coming back with no vocabulary means the agent never found out what the subject calls
// itself — which is the one thing every later branch query inherits.
test('an empty vocabulary fails', async () => {
  const payload = orientation();
  payload.vocabulary = [];
  const result = await check('orientation', payload);
  assert.equal(result.code, 1);
  assert.match(result.json.errors[0].message, /at least 1 item/);
});

// ------------------------------------------------------------------ bad invocations

test('a payload that is not JSON exits 2 — there is nothing to repair', async () => {
  const sandbox = new Sandbox();
  try {
    writeFileSync(join(sandbox.cwd, 'payload.json'), 'Here are the results I found:');
    const result = await sandbox.run('validate.mjs', 'orientation', 'payload.json');
    assert.equal(result.code, 2);
    assert.match(result.err, /is not JSON/);
    assert.equal(result.out, '');
  } finally {
    await sandbox.cleanup();
  }
});

test('an unknown shape name exits 2 and lists the real ones', async () => {
  const result = await check('claims', {});
  assert.equal(result.code, 2);
  assert.match(result.err, /unknown shape: claims/);
  assert.match(result.err, /source-extractor/);
});

test('a missing file exits 2', async () => {
  const sandbox = new Sandbox();
  try {
    const result = await sandbox.run('validate.mjs', 'orientation', 'nothing-here.json');
    assert.equal(result.code, 2);
    assert.match(result.err, /cannot read/);
  } finally {
    await sandbox.cleanup();
  }
});

test('no arguments exits 2 with the usage line', async () => {
  const sandbox = new Sandbox();
  try {
    const result = await sandbox.run('validate.mjs');
    assert.equal(result.code, 2);
    assert.match(result.err, /usage/);
  } finally {
    await sandbox.cleanup();
  }
});

// ------------------------------------------------------------------ drift guard

test('the shapes in brain/schemas.md are the shapes the checker uses', () => {
  // The doc's blocks are what gets pasted into a dispatch prompt; schemas.json is what
  // the checker reads. Two copies of one truth, so the build fails if they part ways.
  const doc = readFileSync(join(repoRoot, 'skill', 'brain', 'schemas.md'), 'utf8');
  const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)]
    .map((match) => JSON.parse(match[1]))
    // The vet_user block is an example of what a script prints, not a schema.
    .filter((block) => block.type === 'object' && block.properties);

  assert.deepEqual(blocks, Object.values(schemasJson));
});
