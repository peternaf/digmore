import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox } from './helpers.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

// Exit codes. Every caller of this script branches on these.
test('success exits 0 and prints the API payload on stdout', async () => {
  const base = await sandbox.apiReturning({ results: [{ url: 'https://x.test', title: 't' }] });
  sandbox.configured(base);
  const { code, json, err } = await sandbox.run('api.mjs', 'reddit', 'user', 'someone', '--topic', 'demo');
  assert.equal(code, 0);
  assert.deepEqual(json, { results: [{ url: 'https://x.test', title: 't' }] });
  assert.equal(err, '', 'stdout carries JSON, stderr carries errors');
});

test('no key exits 4 — the branch is disabled, not failed', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.settings({ apiBaseUrl: base, apiKey: null, apiDeclined: false });
  const { code, err } = await sandbox.run('api.mjs', 'reddit', 'user', 'someone', '--topic', 'demo');
  assert.equal(code, 4);
  assert.equal(sandbox.requests.length, 0, 'no key means no request is attempted');
  assert.match(err, /key/i);
});

test('a declined key also exits 4', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.settings({ apiBaseUrl: base, apiKey: null, apiDeclined: true });
  assert.equal((await sandbox.run('api.mjs', 'reddit', 'user', 'x', '--topic', 'demo')).code, 4);
});

test('401 exits 5 — the key was rejected', async () => {
  const base = await sandbox.apiReturning({ error: 'unauthorized' }, 401);
  sandbox.configured(base);
  const { code } = await sandbox.run('api.mjs', 'reddit', 'user', 'x', '--topic', 'demo');
  assert.equal(code, 5);
});

// V0.1 has no authorization layer, so the API answers 401 for every rejection. A 403
// can only be a proxy or WAF blocking the request in transit — the key is fine, and
// telling the user to replace it sends them to fix the wrong thing.
test('403 is a transit failure, not a rejected key', async () => {
  const base = await sandbox.apiReturning({}, 403);
  sandbox.configured(base);
  const { code } = await sandbox.run('api.mjs', 'reddit', 'user', 'x', '--topic', 'demo');
  assert.equal(code, 1, 'exit 1, not 5');
});

test('400 exits 1', async () => {
  const base = await sandbox.apiReturning({ error: 'bad_request' }, 400);
  sandbox.configured(base);
  assert.equal((await sandbox.run('api.mjs', 'reddit', 'user', 'x', '--topic', 'demo')).code, 1);
});

test('503 exits 3 — the source is temporarily unavailable', async () => {
  const base = await sandbox.apiReturning({ error: 'source_unavailable' }, 503);
  sandbox.configured(base);
  const { code, err } = await sandbox.run('api.mjs', 'twitter', 'user', 'someone', '--topic', 'demo');
  assert.equal(code, 3);
  assert.match(err, /unavailable/i);
  assert.ok(!/credit|top up|developer\.x\.com/i.test(err), 'no internal cause reaches the user');
});

test('other 5xx exits 1', async () => {
  const base = await sandbox.apiReturning({}, 500);
  sandbox.configured(base);
  assert.equal((await sandbox.run('api.mjs', 'reddit', 'user', 'x', '--topic', 'demo')).code, 1);
});

// ---------------------------------------------------------------- 429 and the backoff
//
// A 429 used to be a hard failure at the moment it arrived — a Reddit branch that never ran, or
// a handle that never got vetted, in the middle of the run's widest fan-out. Worth surviving
// whether or not our own API ever throttles, because the X API and the residential proxy behind
// it can 429 us upstream and that reaches the user the same way.
//
// The schedule is tested here rather than end to end because living through it costs the sum of
// its own waits. The one test that does pay them is opt-in, below.

test('the schedule is three waits, so four attempts', async () => {
  const { BACKOFF_MS } = await import('../skill/scripts/api.mjs');
  assert.deepEqual([...BACKOFF_MS], [5000, 15000, 45000]);
});

test('backoffMs walks the schedule, and reuses the last wait past its end', async () => {
  const { backoffMs, BACKOFF_MS } = await import('../skill/scripts/api.mjs');
  assert.equal(backoffMs(null, 0), 5000);
  assert.equal(backoffMs(null, 1), 15000);
  assert.equal(backoffMs(null, 2), 45000);
  assert.equal(backoffMs(null, 9), BACKOFF_MS[BACKOFF_MS.length - 1], 'never undefined past the end');
});

// The server is the only party that knows when its window reopens, so a longer Retry-After is
// honoured. A shorter one is not: the schedule is also protecting the paid dependencies behind
// our own API, and a server asking us to come back sooner cannot speak for those.
test('a Retry-After longer than the schedule wins, and a shorter one does not', async () => {
  const { backoffMs } = await import('../skill/scripts/api.mjs');
  assert.equal(backoffMs('120', 0), 120_000, 'longer is honoured');
  assert.equal(backoffMs('1', 2), 45_000, 'shorter loses to the schedule');
  assert.equal(backoffMs('0', 0), 5000);
});

// The HTTP-date form is deliberately not read: it needs a trustworthy clock at both ends, and
// getting it wrong waits either far too long or not at all. Anything unusable is not an error —
// it falls back to the schedule, which the header refines rather than replaces.
for (const header of ['Wed, 21 Oct 2026 07:28:00 GMT', 'soon', '', '-5', 'NaN', undefined]) {
  test(`an unusable Retry-After ${JSON.stringify(header)} falls back to the schedule`, async () => {
    const { backoffMs } = await import('../skill/scripts/api.mjs');
    assert.equal(backoffMs(header, 1), 15000);
  });
}

// Out of waits is the source being unavailable, not a failed call — exit 3, the same code a 503
// gets, because the run has to name it as one it could not reach. Exit 1 would have read as a
// bug in the request. This is the one test that lives through the real schedule: ~65s.
test(
  'a 429 that never clears exits 3, not 1',
  { skip: !process.env.DIGMORE_SLOW_TESTS && 'set DIGMORE_SLOW_TESTS=1 — this one waits out 5s + 15s + 45s' },
  async () => {
    const base = await sandbox.apiReturning({ error: 'rate limited' }, 429);
    sandbox.configured(base);
    const { code, err } = await sandbox.run('api.mjs', 'reddit', 'user', 'x', '--topic', 'demo');
    assert.equal(code, 3, 'temporarily unavailable, not failed');
    assert.match(err, /rate limiting/i);
    assert.equal(sandbox.requests.length, 4, 'the first attempt plus one per wait');
  },
);

test('a network failure exits 1', async () => {
  sandbox.settings({ apiBaseUrl: 'http://127.0.0.1:1', apiKey: 'sk-test', apiDeclined: false });
  assert.equal((await sandbox.run('api.mjs', 'reddit', 'user', 'x', '--topic', 'demo')).code, 1);
});

// Without --topic there is nowhere to cache, so it is refused rather than defaulted:
// a silent no-op means a run that looks complete having saved nothing.
test('a missing --topic is refused rather than silently skipping the cache', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.configured(base);
  const { code, err } = await sandbox.run('api.mjs', 'reddit', 'user', 'someone');
  assert.notEqual(code, 0);
  assert.match(err, /--topic/);
  assert.equal(sandbox.requests.length, 0);
});

// The cache lives under digmore/<slug>/cache/<branch>/ in the working directory.
test('a response is cached under digmore/<slug>/cache/<branch>/', async () => {
  const base = await sandbox.apiReturning({ name: 'someone', link_karma: 5 });
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'user', 'someone', '--topic', 'my-topic');
  assert.ok(
    existsSync(join(sandbox.cwd, 'digmore', 'my-topic', 'cache', 'reddit')),
    'the cache lives in the working directory, never in the plugin',
  );
});

test('a cache hit skips the call entirely', async () => {
  const base = await sandbox.apiReturning({ name: 'fresh' });
  sandbox.configured(base);
  // One request, one file: the vetting record for one handle, profile and comments and verdict
  // together. It used to be three, and a hit needed all three of them to be present.
  sandbox.writeCache('my-topic', 'reddit', 'reddit-vet-someone.json', {
    name: 'from-cache',
    recent_comments: [],
    verdict: 'legit',
    signals: {},
    reason: '',
  });
  const { code, json } = await sandbox.run('api.mjs', 'reddit', 'user', 'someone', '--topic', 'my-topic');
  assert.equal(code, 0);
  assert.equal(sandbox.requests.length, 0, 'nothing is fetched when the cache has it');
  assert.equal(json.name, 'from-cache');
});

test('the request carries the key in X-API-KEY and hits the v1 path', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.configured(base, 'sk-abc');
  await sandbox.run('api.mjs', 'reddit', 'user', 'someone', '--topic', 'demo');
  assert.equal(sandbox.requests[0].key, 'sk-abc');
  assert.equal(sandbox.requests[0].authorization, undefined, 'not an Authorization header');
  assert.match(sandbox.requests[0].path, /^\/v1\//);
});

test('the api key is never echoed, on success or failure', async () => {
  const base = await sandbox.apiReturning({}, 500);
  sandbox.configured(base, 'sk-secret-value');
  const { out, err } = await sandbox.run('api.mjs', 'reddit', 'user', 'x', '--topic', 'demo');
  assert.ok(!out.includes('sk-secret-value'));
  assert.ok(!err.includes('sk-secret-value'));
});

test('an unknown branch or verb is an error, not a request', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.configured(base);
  for (const args of [
    ['mastodon', 'user', 'x', '--topic', 'demo'],
    ['reddit', 'frobnicate', 'x', '--topic', 'demo'],
    [],
  ]) {
    const { code } = await sandbox.run('api.mjs', ...args);
    assert.notEqual(code, 0, args.join(' '));
  }
  assert.equal(sandbox.requests.length, 0);
});

// Nothing in the plugin tracks or reports money.
test('no cost field is ever emitted, even if the API sends one', async () => {
  const base = await sandbox.apiReturning({ name: 'someone', estimated_cost_usd: 0.01 });
  sandbox.configured(base);
  const { out } = await sandbox.run('api.mjs', 'twitter', 'user', 'someone', '--topic', 'demo');
  assert.ok(!out.includes('estimated_cost_usd'), 'the cost field is stripped');
  assert.ok(!out.includes('0.01'));
});
