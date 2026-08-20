/**
 * validate.mjs — the shape check every sub-agent return goes through.
 *
 * Structure only. These tests pin what it catches, what it deliberately does not, and
 * scripts/subagent_returns.json is the single copy of every shape: the orchestrator pastes an
 * entry into a dispatch prompt, and this checker reads the same file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox, repoRoot } from './helpers.mjs';

const schemasJson = JSON.parse(
  readFileSync(join(repoRoot, 'skill', 'scripts', 'subagent_returns.json'), 'utf8'),
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

const scoutReturn = () => ({
  queries: ['video api providers 2026', 'video api pricing complaints'],
  vocabulary: ['per-minute billing', 'live-to-VOD', 'ingest latency'],
  recurring_names: ['Mux', 'Cloudflare Stream', 'Livepeer'],
  live_arguments: ['whether per-minute pricing survives at scale'],
});

const pageClaims = () => ({
  url: 'https://example.com/mux-pricing',
  sourceQuality: 'secondary',
  claims: [
    { claim: 'Mux charges per minute', quote: '$0.005 per minute', importance: 'central', kind: 'qualitative' },
  ],
});

// ------------------------------------------------------------------ the happy path

test('every shape in subagent_returns.json has a name the CLI will accept', async () => {
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
  const result = await check('scope', scoutReturn());
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
  const payload = scoutReturn();
  delete payload.vocabulary;
  const result = await check('scope', payload);
  assert.equal(result.code, 1);
  assert.equal(result.json.valid, false);
  assert.deepEqual(result.json.errors, [{ path: 'vocabulary', message: 'required' }]);
});

test('a required key nested in an array item carries its index', async () => {
  // Two claims, and the second is the broken one — an error that named only the key
  // would leave the caller opening every item to find which.
  const payload = pageClaims();
  payload.claims.push({ claim: 'Livepeer is cheaper', quote: 'about a tenth', importance: 'supporting', kind: 'qualitative' });
  delete payload.claims[1].importance;
  const result = await check('page-claims', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['claims[1].importance']);
});

test('an empty string is missing, not present', async () => {
  // A sub-agent with no answer that does not want to say so returns "".
  const payload = pageClaims();
  payload.claims[0].quote = '';
  const result = await check('page-claims', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['claims[0].quote']);
});

test('a bad enum value lists what was allowed', async () => {
  const payload = pageClaims();
  payload.sourceQuality = 'pretty-good';
  const result = await check('page-claims', payload);
  assert.equal(result.code, 1);
  assert.match(result.json.errors[0].message, /must be one of/);
  assert.match(result.json.errors[0].message, /"primary-3p"/);
  assert.match(result.json.errors[0].message, /got "pretty-good"/);
});

test('the wrong JSON type is reported with both types', async () => {
  const payload = scoutReturn();
  payload.vocabulary = 'per-minute billing, live-to-VOD';
  const result = await check('scope', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(result.json.errors, [
    { path: 'vocabulary', message: 'expected array, got string' },
  ]);
});

test('a wrong-typed value is not then checked against the rules for its keys', async () => {
  // Otherwise one bad type produces a cascade of nonsense errors and the repair prompt
  // is unreadable.
  const payload = pageClaims();
  payload.claims[0] = 'Mux charges per minute';
  const result = await check('page-claims', payload);
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
  const payload = pageClaims();
  delete payload.sourceQuality;
  delete payload.claims[0].claim;
  payload.claims[0].importance = 'vital';
  const result = await check('page-claims', payload);
  assert.deepEqual(paths(result).sort(), [
    'claims[0].claim',
    'claims[0].importance',
    'sourceQuality',
  ]);
});

// ------------------------------------------------------------------ the conditional rule

test('a quantitative claim without its unit fails', async () => {
  const payload = pageClaims();
  payload.claims[0] = {
    claim: 'Mux raised $105M',
    quote: 'raised $105 million',
    importance: 'central',
    kind: 'quantitative',
    value: 105,
  };
  const result = await check('page-claims', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(result.json.errors, [
    { path: 'claims[0].unit', message: 'required when kind is "quantitative"' },
  ]);
});

test('a qualitative claim without a unit is fine', async () => {
  const result = await check('page-claims', pageClaims());
  assert.equal(result.code, 0);
});

// ------------------------------------------------------------------ the local branch

test('internal is an allowed source quality', async () => {
  // The user's own documents are tagged `internal`; before this the enum stopped at
  // `unreliable` and the branch could not label its own content.
  const payload = pageClaims();
  payload.sourceQuality = 'internal';
  const result = await check('page-claims', payload);
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

// ------------------------------------------------------------------ fast mode

test('one query is enough — the scout’s return is not measured by volume', async () => {
  const payload = scoutReturn();
  payload.queries = payload.queries.slice(0, 1);
  const result = await check('scope', payload);
  assert.equal(result.code, 0);
});

// Coming back with no vocabulary means the agent never found out what the subject calls
// itself — which is the one thing every later branch query inherits.
test('an empty vocabulary fails', async () => {
  const payload = scoutReturn();
  payload.vocabulary = [];
  const result = await check('scope', payload);
  assert.equal(result.code, 1);
  assert.match(result.json.errors[0].message, /at least 1 item/);
});

// ------------------------------------------------------------------ bad invocations

test('a payload that is not JSON exits 2 — there is nothing to repair', async () => {
  const sandbox = new Sandbox();
  try {
    writeFileSync(join(sandbox.cwd, 'payload.json'), 'Here are the results I found:');
    const result = await sandbox.run('validate.mjs', 'scope', 'payload.json');
    assert.equal(result.code, 2);
    assert.match(result.err, /is not JSON/);
    assert.equal(result.out, '');
  } finally {
    await sandbox.cleanup();
  }
});

// ------------------------------------------------------------------ the claims stay on disk

// The Page Analyst hands back a receipt, not its extraction. Several hundred of these run
// in one job, and the claims arrays are what used to fill the orchestrator's context.
test('a page-analyst receipt is three fields and no claims', async () => {
  const result = await check('page-analyst', { outcome: 'ok', claimCount: 4, pagesRead: 1, fetchedWith: 'fetch.mjs' });
  assert.equal(result.code, 0);
});

test('a receipt without its page count is refused', async () => {
  // Only the orchestrator can total pages against the branch's fetch budget.
  const result = await check('page-analyst', { outcome: 'ok', claimCount: 4, fetchedWith: 'fetch.mjs' });
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['pagesRead']);
});

test('zero claims is a real outcome, not a missing one', async () => {
  // A page we could not read and a page that yielded nothing are different findings.
  for (const outcome of ['blocked', 'nothing-found']) {
    const result = await check('page-analyst', { outcome, claimCount: 0, pagesRead: 0, fetchedWith: 'none' });
    assert.equal(result.code, 0, outcome);
  }
});

test('a claim records who said it', async () => {
  const payload = pageClaims();
  payload.claims[0].handle = 'u/someone';
  const result = await check('page-claims', payload);
  assert.equal(result.code, 0);
});

// ------------------------------------------------------------------ the handle roster

const roster = () => ({
  source: 'reddit',
  handles: [
    { handle: 'u/someone', topImportance: 'central', claimCount: 3, documentCount: 2 },
    { handle: 'u/passerby', topImportance: 'none', claimCount: 0, documentCount: 1 },
  ],
});

test('a roster of ranked handles passes', async () => {
  const result = await check('handle-roster', roster());
  assert.equal(result.code, 0);
});

// A handle who appeared but said nothing still gets a row, so Vet can reach them on a thin
// source. "none" is what marks them, and it has to be a legal value.
test('none is an allowed topImportance', async () => {
  const payload = roster();
  payload.handles = [payload.handles[1]];
  const result = await check('handle-roster', payload);
  assert.equal(result.code, 0);
});

test('a roster for a source with no accounts is refused', async () => {
  // Only reddit, hackernews, twitter and forums have handles to rank.
  const payload = roster();
  payload.source = 'websearch';
  const result = await check('handle-roster', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['source']);
});

// Vet writes these back once per source, and they are the run's only record of a rejection.
test('the roster carries a vetting outcome once Vet has run', async () => {
  const payload = roster();
  Object.assign(payload.handles[0], {
    verdict: 'promoter',
    topicalRelevance: 'low',
    verdictReason: 'same URL host in 7 of 20 recent comments',
    inExperts: false,
  });
  const result = await check('handle-roster', payload);
  assert.equal(result.code, 0);
});

test('throwaway is a verdict everywhere a verdict appears', async () => {
  const judgment = await check('vet-judgment', { verdict: 'throwaway', reason: 'new account, no following, nothing posted' });
  assert.equal(judgment.code, 0);

  const payload = roster();
  payload.handles[0].verdict = 'throwaway';
  assert.equal((await check('handle-roster', payload)).code, 0);
});

test('troll is gone from the vocabulary', async () => {
  // Nothing ever produced it: not the API's enum, not a heuristic, not the voice rubric.
  const result = await check('vet-judgment', { verdict: 'troll', reason: 'unpleasant' });
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['verdict']);
});

test('an unknown shape name exits 2 and lists the real ones', async () => {
  const result = await check('claims', {});
  assert.equal(result.code, 2);
  assert.match(result.err, /unknown shape: claims/);
  assert.match(result.err, /page-claims/);
});

test('a missing file exits 2', async () => {
  const sandbox = new Sandbox();
  try {
    const result = await sandbox.run('validate.mjs', 'scope', 'nothing-here.json');
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
