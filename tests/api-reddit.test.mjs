import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { Sandbox } from './helpers.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

// The search cache name is readable, not hashed: reddit-search-<scope>-<four query words>.
const QUERY = 'video api providers';

test('the search cache name is the scope plus four words of the query', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo');
  assert.ok(
    existsSync(sandbox.cachePath('demo', 'reddit', 'reddit-search-sitewide-video-api-providers.json')),
    'reddit-search-<scope>-<query-in-4-words>.json',
  );
});

// Stopwords go, punctuation goes, and the name stops at four words however long the query.
test('the query is reduced to four meaningful words', async () => {
  const { queryWords, searchCacheName } = await import('../skill/scripts/api.mjs');
  assert.equal(queryWords('what are the vram requirements for local llm inference'), 'vram-requirements-local-llm');
  assert.equal(queryWords('Mux vs. Cloudflare Stream — pricing?'), 'mux-cloudflare-stream-pricing');
  assert.equal(queryWords('the a of for'), 'query', 'a query that is all stopwords still names a file');
  assert.equal(searchCacheName('video api providers', ['LocalLLaMA']), 'reddit-search-localllama-video-api-providers');
});

// An unqualified search asks for the last year, not for all time.
test('search defaults are relevance, year, limit 20', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo');
  assert.equal(sandbox.requests[0].path, '/v1/reddit/search');
  assert.deepEqual(sandbox.requests[0].query, { query: QUERY, sort: 'relevance', time_window: 'year', limit: '20' });
});

// brain/recency.md's 2-year window is the caller's job, not a default.
test('the 2-year window is --time-window all plus --after-date', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(
    'api.mjs', 'reddit', 'search', QUERY,
    '--topic', 'demo', '--time-window', 'all', '--after-date', '2024-08-07',
  );
  assert.equal(sandbox.requests[0].query.time_window, 'all');
  assert.equal(sandbox.requests[0].query.after_date, '2024-08-07');
});

test('every search flag reaches the API', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(
    'api.mjs', 'reddit', 'search', QUERY,
    '--topic', 'demo', '--subreddit', 'webdev', '--sort', 'top', '--time-window', 'month',
    '--limit', '50', '--after-date', '2024-08-06',
  );
  assert.deepEqual(sandbox.requests[0].query, {
    query: QUERY, subreddits: 'webdev', sort: 'top', time_window: 'month', limit: '50', after_date: '2024-08-06',
  });
  assert.ok(existsSync(sandbox.cachePath('demo', 'reddit', 'reddit-search-webdev-video-api-providers.json')));
});

// sub is repeatable and the fan-out stays server-side. Order, `limit` and
// `relevance` are properties of the merged set and cannot be rebuilt from per-sub calls.
test('multi-sub is one request with a repeated sub parameter', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(
    'api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'webdev', '--subreddit', 'saas',
  );
  assert.equal(sandbox.requests.length, 1, 'one call, not one per sub');
  assert.deepEqual(sandbox.requests[0].params.getAll('subreddits'), ['webdev', 'saas'], '?sub=a&sub=b');
});

test('the merged list is returned exactly as the API sent it', async () => {
  const results = [
    { url: 'https://r.test/a', title: 'A', relevance: 1 },
    { url: 'https://r.test/b', title: 'B', relevance: 0.5 },
  ];
  const base = await sandbox.apiReturning({ results });
  sandbox.configured(base);
  const { json } = await sandbox.run(
    'api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'webdev', '--subreddit', 'saas',
  );
  assert.deepEqual(json.results, results, 'no client-side re-ranking, dedupe or truncation');
});

// Only the first sub is in the name; the rest are in the stored request, which is what
// tells two files apart.
test('multi-sub names the file after the first sub and keeps every sub in the request', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(
    'api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'webdev', '--subreddit', 'saas',
  );
  const stored = sandbox.cached('demo', 'reddit', 'reddit-search-webdev-video-api-providers.json');
  assert.deepEqual(stored._request.subreddits, ['webdev', 'saas'], 'order as given, never sorted');
});

// Order carries meaning — the first sub's hits rank above the second's — so the two
// orderings are different requests and must not share a cache entry.
test('reversing the subs is a different request, not a cache hit', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'a', '--subreddit', 'b');
  await sandbox.run('api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'b', '--subreddit', 'a');
  assert.equal(sandbox.requests.length, 2, 'both were fetched');
  assert.ok(existsSync(sandbox.cachePath('demo', 'reddit', 'reddit-search-a-video-api-providers.json')));
  assert.ok(existsSync(sandbox.cachePath('demo', 'reddit', 'reddit-search-b-video-api-providers.json')));
});

test('a repeated search is served from the one cache file', async () => {
  const base = await sandbox.apiReturning({ results: [{ url: 'https://r.test/a', title: 'A', relevance: 1 }] });
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'webdev');
  const { json } = await sandbox.run('api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'webdev');
  assert.equal(sandbox.requests.length, 1);
  assert.equal(json.results[0].title, 'A');
});

// Four words cannot carry the sort, so these two land on one name. Without the stored
// request the second would open the first one's file and report its results as its own.
test('two requests on one name do not share a file', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'webdev');
  await sandbox.run(
    'api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'webdev', '--sort', 'top',
  );
  assert.equal(sandbox.requests.length, 2, 'the second was fetched, not served from the first');
  const first = sandbox.cached('demo', 'reddit', 'reddit-search-webdev-video-api-providers.json');
  const second = sandbox.cached('demo', 'reddit', 'reddit-search-webdev-video-api-providers-2.json');
  assert.equal(first._request.sort, 'relevance');
  assert.equal(second._request.sort, 'top', 'the collision probed to -2');
});

// Order decides which number a request lands on, never which data it reads back.
test('a probed request finds its own file on a re-run', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'webdev');
  await sandbox.run(
    'api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'webdev', '--sort', 'top',
  );
  await sandbox.run(
    'api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo', '--subreddit', 'webdev', '--sort', 'top',
  );
  assert.equal(sandbox.requests.length, 2, 'the third call hit -2 rather than fetching again');
});

// Files written before the request was stored carry no `_request`, so they miss once.
test('a cache file with no stored request is a miss', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  sandbox.writeCache('demo', 'reddit', 'reddit-search-sitewide-video-api-providers.json', { results: [] });
  await sandbox.run('api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo');
  assert.equal(sandbox.requests.length, 1, 're-fetched rather than trusted');
  assert.ok(existsSync(sandbox.cachePath('demo', 'reddit', 'reddit-search-sitewide-video-api-providers-2.json')));
});

// scripts/subagent_returns.json — branch-searcher: {results:[{url,title,relevance}]}
test('search returns the Branch searcher shape', async () => {
  const base = await sandbox.apiReturning({
    results: [{ url: 'https://r.test/a', title: 'A', relevance: 1 }],
  });
  sandbox.configured(base);
  const { json } = await sandbox.run('api.mjs', 'reddit', 'search', QUERY, '--topic', 'demo');
  // `_request` rides along so the file says what it was fetched for; the shape is `results`.
  assert.deepEqual(Object.keys(json).sort(), ['_request', 'results']);
  assert.deepEqual(Object.keys(json.results[0]).sort(), ['relevance', 'title', 'url']);
});

test('thread caches as thread-<id>.json and accepts a permalink', async () => {
  // The array is `comments`, not `top_comments` — what it holds is decided by `limit`
  // and by the sort we ask for, neither of which is a property of the field.
  const thread = {
    id: '1a2b3c',
    title: 'A thread',
    num_comments: 900,
    comments: [
      { id: 'c1', author: 'someone', body: 'first', score: 40, created_utc: 1700000000, permalink: '/r/webdev/comments/1a2b3c/x/c1/', parent_id: 't3_1a2b3c' },
      { id: 'c2', author: 'other', body: 'a reply', score: 5, created_utc: 1700000100, permalink: '/r/webdev/comments/1a2b3c/x/c2/', parent_id: 't1_c1' },
    ],
  };
  const base = await sandbox.apiReturning(thread);
  sandbox.configured(base);
  const { json } = await sandbox.run('api.mjs', 'reddit', 'thread', '/r/webdev/comments/1a2b3c/', '--topic', 'demo');
  assert.equal(sandbox.requests[0].path, '/v1/reddit/thread/1a2b3c');
  assert.equal(sandbox.requests[0].query.limit, '500', 'the documented default');
  assert.ok(existsSync(sandbox.cachePath('demo', 'reddit', 'reddit-thread-1a2b3c.json')));
  assert.deepEqual(json, thread, 'the Post passes through whole, comments and all');
  assert.equal(json.comments[1].parent_id, 't1_c1', 'flat comments; parent_id rebuilds the tree');
});

/**
 * The id is the segment after `comments/`, and the last path segment only when that
 * misses. A real Reddit permalink carries a title slug
 * after the id, so taking the last segment alone hands the API the slug and earns a 400.
 * Phase A harvests these URLs from search results, so this is the normal case.
 */
test('the post id is read from a real permalink, not its title slug', async () => {
  const base = await sandbox.apiReturning({ id: '1tvs5jj', comments: [] });
  sandbox.configured(base);

  const forms = [
    'https://old.reddit.com/r/RDDT/comments/1tvs5jj/steve_jen_and_drew_here_ask_us_anything/',
    'https://www.reddit.com/r/RDDT/comments/1tvs5jj/steve_jen_and_drew_here_ask_us_anything',
    '/r/RDDT/comments/1tvs5jj/',
    '1tvs5jj',
  ];
  for (const form of forms) {
    const caseSandbox = new Sandbox();
    try {
      const caseBase = await caseSandbox.apiReturning({ id: '1tvs5jj', comments: [] });
      caseSandbox.configured(caseBase);
      await caseSandbox.run('api.mjs', 'reddit', 'thread', form, '--topic', 'demo');
      assert.equal(caseSandbox.requests[0].path, '/v1/reddit/thread/1tvs5jj', form);
      assert.ok(existsSync(caseSandbox.cachePath('demo', 'reddit', 'reddit-thread-1tvs5jj.json')), form);
    } finally {
      await caseSandbox.cleanup();
    }
  }
});

// A comment permalink carries a second id after the slug. The post id is still the one
// after `comments/` — the last segment is the comment.
test('a comment permalink still resolves to its post id', async () => {
  const base = await sandbox.apiReturning({ id: '1vgbkge', comments: [] });
  sandbox.configured(base);
  await sandbox.run(
    'api.mjs', 'reddit', 'thread',
    '/user/spez/comments/1vgbkge/modernizing_reddits_infrastructure/p1wosm9/',
    '--topic', 'demo',
  );
  assert.equal(sandbox.requests[0].path, '/v1/reddit/thread/1vgbkge');
});

/**
 * The merged reddit/user response: the snapshot and the verdict in one body.
 * `recent_comments` is one object per comment — never parallel lists matched by
 * position, because a field that cannot be read for one comment drops an entry and
 * silently shifts every entry after it.
 */
const userWithVerdict = {
  name: 'someone',
  link_karma: 10,
  comment_karma: 900,
  recent_comments: [
    { body: 'first', subreddit: 'webdev', created_utc: 1700000000, permalink: '/r/webdev/comments/a/', score: 12 },
    { body: 'second', subreddit: 'saas', created_utc: 1700000100, permalink: '/r/saas/comments/b/', score: 3 },
  ],
  verdict: 'legit',
  signals: { account_age_days: '900' },
  reason: 'multi-year history',
};

// One request, one file: the vetting record for one handle. It used to be three — profile,
// comments and verdict apart — because the brain this came from made two requests and cached
// the verdict in a third. Nothing ever read the pieces separately, and three files meant three
// reads that all had to hit before the cache counted as warm.
test('user writes one cache file, holding the whole response', async () => {
  const base = await sandbox.apiReturning(userWithVerdict);
  sandbox.configured(base);
  const { json } = await sandbox.run('api.mjs', 'reddit', 'user', 'someone', '--topic', 'demo');
  assert.equal(sandbox.requests.length, 1, 'the verdict costs no extra request');
  assert.equal(sandbox.requests[0].path, '/v1/reddit/user/someone');

  const vetted = sandbox.cached('demo', 'reddit', 'reddit-vet-someone.json');
  assert.equal(vetted.comment_karma, 900, 'the profile');
  assert.equal(vetted.verdict, 'legit', 'the verdict');
  assert.deepEqual(vetted.recent_comments, userWithVerdict.recent_comments, 'and the comments, whole');
  assert.equal(
    vetted.recent_comments[1].subreddit,
    'saas',
    'each comment keeps its own subreddit beside its own body',
  );

  assert.deepEqual(
    readdirSync(sandbox.cachePath('demo', 'reddit', '.')).filter((name) => name.includes('someone')),
    ['reddit-vet-someone.json'],
    'no user-about- or user-comments- beside it',
  );

  assert.deepEqual(json, userWithVerdict, 'stdout carries the whole body');
});

test('a second user call is served from that one cache file', async () => {
  const base = await sandbox.apiReturning(userWithVerdict);
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'user', 'someone', '--topic', 'demo');
  const { json } = await sandbox.run('api.mjs', 'reddit', 'user', 'someone', '--topic', 'demo');
  assert.equal(sandbox.requests.length, 1, 'the second call does not re-fetch');
  assert.equal(json.name, 'someone');
  assert.deepEqual(json.recent_comments, userWithVerdict.recent_comments);
  assert.equal(json.verdict, 'legit', 'the verdict survives the round trip through cache');
});

// There is no reddit/vet endpoint. The verdict rides along with the snapshot,
// because it is computation over comments that call has already fetched.
test('there is no reddit vet verb', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.configured(base);
  const { code, err } = await sandbox.run('api.mjs', 'reddit', 'vet', 'someone', '--topic', 'demo');
  assert.notEqual(code, 0);
  assert.match(err, /unknown/i);
  assert.ok(!err.includes('/v1/reddit/vet'), 'nothing tries the removed endpoint');
  assert.equal(sandbox.requests.length, 0);
});

test('the three verbs are exactly search, thread and user', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.configured(base);
  const { err } = await sandbox.run('api.mjs', 'reddit', 'nope', 'x', '--topic', 'demo');
  const offered = err.match(/expected ([^"]+)"/)?.[1] ?? err;
  for (const verb of ['search', 'thread', 'user']) {
    assert.ok(offered.includes(verb), `${verb} should be offered`);
  }
  assert.ok(!offered.includes('vet'), 'vet is gone from the surface');
});

// The shared verdict vocabulary, unchanged by the merge.
test('every verdict in the vocabulary passes through untouched', async () => {
  for (const verdict of ['legit', 'unknown', 'promoter', 'spammer', 'throwaway']) {
    const caseSandbox = new Sandbox();
    try {
      const base = await caseSandbox.apiReturning({ name: 'x', verdict, signals: {}, reason: 'r' });
      caseSandbox.configured(base);
      const { json } = await caseSandbox.run('api.mjs', 'reddit', 'user', 'x', '--topic', 'demo');
      assert.equal(json.verdict, verdict);
    } finally {
      await caseSandbox.cleanup();
    }
  }
});

test('each verb needs its positional argument', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.configured(base);
  for (const verb of ['search', 'thread', 'user']) {
    const { code } = await sandbox.run('api.mjs', 'reddit', verb, '--topic', 'demo');
    assert.notEqual(code, 0, verb);
  }
  assert.equal(sandbox.requests.length, 0);
});
