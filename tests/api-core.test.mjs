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
  // reddit user splits one response across three files, so a hit needs all three.
  sandbox.writeCache('my-topic', 'reddit', 'user-about-someone.json', { name: 'from-cache' });
  sandbox.writeCache('my-topic', 'reddit', 'user-comments-someone.json', []);
  sandbox.writeCache('my-topic', 'reddit', 'vet-someone.json', { verdict: 'legit', signals: {}, reason: '' });
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
