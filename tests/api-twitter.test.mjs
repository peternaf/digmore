import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox, repoRoot, script } from './helpers.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

test('user caches as user-<handle>.json', async () => {
  const base = await sandbox.apiReturning({ username: 'someone', followers_count: 1200 });
  sandbox.configured(base);
  const { json } = await sandbox.run('api.mjs', 'twitter', 'user', 'someone', '--topic', 'demo');
  assert.equal(sandbox.requests[0].path, '/v1/twitter/user/someone');
  assert.equal(json.followers_count, 1200);
  assert.ok(existsSync(sandbox.cachePath('demo', 'twitter', 'twitter-user-someone.json')));
});

test('tweets caches as tweets-<handle>-<N>.json and defaults to 25', async () => {
  const base = await sandbox.apiReturning({ tweets: [] });
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'twitter', 'tweets', 'someone', '--topic', 'demo');
  assert.equal(sandbox.requests[0].path, '/v1/twitter/tweets/someone');
  assert.equal(sandbox.requests[0].query.limit, '25', 'the documented default');
  assert.ok(existsSync(sandbox.cachePath('demo', 'twitter', 'twitter-tweets-someone-25.json')));
});

test('tweets honours --limit, and each limit is its own cache file', async () => {
  const base = await sandbox.apiReturning({ tweets: [] });
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'twitter', 'tweets', 'someone', '--topic', 'demo', '--limit', '100');
  assert.equal(sandbox.requests[0].query.limit, '100');
  assert.ok(existsSync(sandbox.cachePath('demo', 'twitter', 'twitter-tweets-someone-100.json')));
});

// 5-100 is the X API's own range for one timeline page, so anything outside it is a
// guaranteed failed request. Refused before it becomes a round trip.
test('tweets refuses a --limit outside 5-100 without calling the API', async () => {
  const base = await sandbox.apiReturning({ tweets: [] });
  sandbox.configured(base);
  for (const limit of ['4', '0', '101', '1000', '-5', 'many', '25.5']) {
    const { code, err } = await sandbox.run(
      'api.mjs', 'twitter', 'tweets', 'someone', '--topic', 'demo', '--limit', limit,
    );
    assert.notEqual(code, 0, limit);
    assert.match(err, /5 to 100/, limit);
  }
  assert.equal(sandbox.requests.length, 0, 'nothing is fetched for a value that cannot work');
});

test('tweets accepts the boundaries', async () => {
  const base = await sandbox.apiReturning({ tweets: [] });
  sandbox.configured(base);
  for (const limit of ['5', '100']) {
    const { code } = await sandbox.run(
      'api.mjs', 'twitter', 'tweets', 'someone', '--topic', 'demo', '--limit', limit,
    );
    assert.equal(code, 0, limit);
  }
  assert.equal(sandbox.requests.length, 2);
});

// brain/sources/twitter.md — the only path to a quotable tweet body, because
// WebSearch sees only the og:title.
test('tweet fetches bodies by id, batched, one cache file per id', async () => {
  const base = await sandbox.api((req, res, url) => {
    const tweetIds = url.searchParams.get('tweet_ids').split(',');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ tweets: tweetIds.map((tweetId) => ({ id: tweetId, text: `body of ${tweetId}` })) }),
    );
  });
  sandbox.configured(base);
  const { json } = await sandbox.run('api.mjs', 'twitter', 'tweet', '111', '222', '--topic', 'demo');
  assert.equal(sandbox.requests.length, 1, 'one batched call, not one per id');
  assert.equal(sandbox.requests[0].path, '/v1/twitter/tweet');
  assert.equal(sandbox.requests[0].query.tweet_ids, '111,222');
  assert.deepEqual(json.tweets.map((tweet) => tweet.id), ['111', '222']);
  assert.equal(sandbox.cached('demo', 'twitter', 'twitter-tweet-111.json').text, 'body of 111');
  assert.equal(sandbox.cached('demo', 'twitter', 'twitter-tweet-222.json').text, 'body of 222');
});

test('re-quoting a tweet across runs does not re-fetch it', async () => {
  const base = await sandbox.api((req, res, url) => {
    const tweetIds = url.searchParams.get('tweet_ids').split(',');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ tweets: tweetIds.map((tweetId) => ({ id: tweetId, text: `body of ${tweetId}` })) }),
    );
  });
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'twitter', 'tweet', '111', '--topic', 'demo');
  const { json } = await sandbox.run('api.mjs', 'twitter', 'tweet', '111', '222', '--topic', 'demo');
  assert.equal(sandbox.requests.length, 2);
  assert.equal(sandbox.requests[1].query.tweet_ids, '222', 'only the uncached id is asked for');
  assert.deepEqual(json.tweets.map((tweet) => tweet.id), ['111', '222'], 'both are returned');
});

test('vet requires a post count and passes it through', async () => {
  const base = await sandbox.apiReturning({ verdict: 'unknown', signals: {}, reason: '' });
  sandbox.configured(base);

  const missing = await sandbox.run('api.mjs', 'twitter', 'vet', 'someone', '--topic', 'demo');
  assert.notEqual(missing.code, 0);
  assert.match(missing.err, /posts/);
  assert.equal(sandbox.requests.length, 0);

  const { code, json } = await sandbox.run(
    'api.mjs', 'twitter', 'vet', 'someone', '--topic', 'demo', '--posts', '50',
  );
  assert.equal(code, 0);
  assert.equal(sandbox.requests[0].path, '/v1/twitter/vet/someone');
  assert.equal(sandbox.requests[0].query.posts, '50');
  assert.equal(json.verdict, 'unknown');
});

// Zero is the profile pass, not a missing value, so it has to reach the API like any count.
test('--posts 0 is the profile pass and is sent as 0', async () => {
  const base = await sandbox.apiReturning({ verdict: 'unknown' });
  sandbox.configured(base);
  const { code } = await sandbox.run(
    'api.mjs', 'twitter', 'vet', 'someone', '--topic', 'demo', '--posts', '0',
  );
  assert.equal(code, 0);
  assert.equal(sandbox.requests[0].query.posts, '0');
});

// What counts X will serve is the API's business. This refuses only what is not a count.
test('a post count that is not a whole number is refused', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.configured(base);
  for (const posts of ['-1', '2.5', 'deep', '']) {
    const { code } = await sandbox.run(
      'api.mjs', 'twitter', 'vet', 'someone', '--topic', 'demo', '--posts', posts,
    );
    assert.notEqual(code, 0, posts);
  }
  assert.equal(sandbox.requests.length, 0);
});

// One handle, one file — the depth used to be in the name, because a handle could be vetted
// twice. It cannot any more: the depth is decided from the ranking before anything runs. What
// the comparison still protects is resume and re-runs.
test('vet caches under one name per handle, whatever the depth', async () => {
  const base = await sandbox.apiReturning({ verdict: 'unknown' });
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'twitter', 'vet', 'someone', '--topic', 'demo', '--posts', '50');
  assert.ok(existsSync(sandbox.cachePath('demo', 'twitter', 'twitter-vet-someone.json')));
  assert.deepEqual(
    readdirSync(sandbox.cachePath('demo', 'twitter', '.')).filter((name) => name.includes('someone')),
    ['twitter-vet-someone.json'],
    'no -<n>posts suffix, so no file per depth',
  );
  assert.equal(sandbox.cached('demo', 'twitter', 'twitter-vet-someone.json').posts_sampled, 50);
});

// Deeper supersedes shallower, never the other way round. Without the comparison, dropping the
// suffix would let a profile-only file answer a deep call — returning cached having never read
// the posts it was dispatched for.
test('a shallower cached file is a miss for a deeper call, and a deeper one is a hit', async () => {
  const base = await sandbox.apiReturning({ verdict: 'unknown' });
  sandbox.configured(base);

  await sandbox.run('api.mjs', 'twitter', 'vet', 'someone', '--topic', 'demo', '--posts', '0');
  assert.equal(sandbox.requests.length, 1);

  await sandbox.run('api.mjs', 'twitter', 'vet', 'someone', '--topic', 'demo', '--posts', '50');
  assert.equal(sandbox.requests.length, 2, 'the profile-only file cannot answer a deep call');
  assert.equal(sandbox.cached('demo', 'twitter', 'twitter-vet-someone.json').posts_sampled, 50);

  await sandbox.run('api.mjs', 'twitter', 'vet', 'someone', '--topic', 'demo', '--posts', '10');
  assert.equal(sandbox.requests.length, 2, 'a deeper file answers a shallower call');

  await sandbox.run('api.mjs', 'twitter', 'vet', 'someone', '--topic', 'demo', '--posts', '50');
  assert.equal(sandbox.requests.length, 2, 'and the same depth is a plain hit');
});

// A file written before posts_sampled existed reads as depth 0: it answers a profile-only call
// and is re-fetched for anything deeper. That is the right way round — the alternative is
// trusting an unknown depth to be sufficient.
test('a cached file with no posts_sampled is treated as the profile pass', async () => {
  const base = await sandbox.apiReturning({ verdict: 'unknown', fresh: true });
  sandbox.configured(base);
  sandbox.writeCache('demo', 'twitter', 'twitter-vet-someone.json', { verdict: 'unknown' });

  const shallow = await sandbox.run('api.mjs', 'twitter', 'vet', 'someone', '--topic', 'demo', '--posts', '0');
  assert.equal(sandbox.requests.length, 0, 'it answers --posts 0');
  assert.equal(shallow.json.fresh, undefined);

  await sandbox.run('api.mjs', 'twitter', 'vet', 'someone', '--topic', 'demo', '--posts', '25');
  assert.equal(sandbox.requests.length, 1, 'and is re-fetched for anything deeper');
});

// There is no user-side spend, so there is no verb for estimating one.
test('there is no plan-vet verb', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.configured(base);
  const { code, err } = await sandbox.run(
    'api.mjs', 'twitter', 'plan-vet', 'someone', '--posts', '0', '--topic', 'demo',
  );
  assert.notEqual(code, 0);
  assert.match(err, /unknown/i);
  assert.equal(sandbox.requests.length, 0);
});

test('the four verbs are exactly user, tweets, tweet and vet', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.configured(base);
  const { err } = await sandbox.run('api.mjs', 'twitter', 'nope', 'x', '--topic', 'demo');
  const offered = err.match(/expected ([^"]+)"/)?.[1] ?? err;
  for (const verb of ['user', 'tweets', 'tweet', 'vet']) {
    assert.ok(offered.includes(verb), `${verb} should be offered`);
  }
  assert.ok(!offered.includes('plan-vet'));
});

// No money anywhere, in the script or in what it emits.
test('the script itself carries no pricing', () => {
  const source = readFileSync(script('api.mjs'), 'utf8');
  assert.ok(!/\$[0-9]/.test(source), 'no dollar figures');
  assert.ok(!/plan-vet/.test(source));
});
