import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Sandbox } from './helpers.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

// The search cache name is two hashes: reddit-search-<branchhash5>-<queryhash5>.
const QUERY = 'video api providers';

/**
 * Both batched Reddit endpoints answer with an object keyed by exactly what was sent, each
 * value either the record or a short string saying why that one failed. `build` returns
 * either for a given key, so one helper covers the whole-batch, mixed and all-failed cases.
 */
const keyedBy = (param, build) => (req, res, url) => {
  const keys = String(url.searchParams.get(param) ?? '')
    .split(',')
    .filter(Boolean);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(Object.fromEntries(keys.map((key) => [key, build(key)]))));
};

// ---------------------------------------------------------------- search

/**
 * Every search call names its branch. The label is Plan's, carried unchanged from
 * `_returns/branch-searcher-<branch>.json`, and it is half of every cache filename.
 */
const BRANCH = 'video-api-providers-reddit';

/** What one call's `--branch`/`--query` pair looks like, so a test says only what it varies. */
const searchArgs = (queries, extra = []) => [
  'api.mjs', 'reddit', 'search',
  '--branch', BRANCH,
  ...queries.flatMap((query) => ['--query', query]),
  '--topic', 'demo',
  ...extra,
];

/** The branch's cache directory. `cachePath` names a file, so this drops the last segment. */
const searchDir = () => dirname(sandbox.cachePath('demo', 'reddit', 'any.json'));

const nameFor = async (branch, query) => {
  const { searchCacheName } = await import('../skill/scripts/api.mjs');
  return searchCacheName(branch, query);
};

test('the search cache name is the branch hash and the query hash', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs([QUERY]));
  assert.ok(
    existsSync(sandbox.cachePath('demo', 'reddit', await nameFor(BRANCH, QUERY))),
    'reddit-search-<branchhash5>-<queryhash5>.json',
  );
});

// The name is the identity, so it has to be the same string on every run and on every platform.
test('the name is two five-character hashes, and is stable', async () => {
  const { hash5, searchCacheName, searchCachePrefix } = await import('../skill/scripts/api.mjs');
  assert.match(hash5('anything'), /^[0-9a-f]{5}$/);
  assert.equal(hash5('anything'), hash5('anything'));
  assert.notEqual(hash5('anything'), hash5('anything else'));
  assert.equal(
    searchCacheName(BRANCH, QUERY),
    `${searchCachePrefix(BRANCH)}${hash5(QUERY)}.json`,
    'the prefix the cap counts on is the first half of the name',
  );
});

// The branch is half the name, so the same query asked by two branches is two searches — that is
// what makes a branch's spend attributable to it rather than shared.
test('two branches asking one query write two files', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs([QUERY]));
  await sandbox.run('api.mjs', 'reddit', 'search', '--branch', 'another-angle-reddit', '--query', QUERY, '--topic', 'demo');
  assert.equal(sandbox.requests.length, 2);
  assert.ok(existsSync(sandbox.cachePath('demo', 'reddit', await nameFor(BRANCH, QUERY))));
  assert.ok(existsSync(sandbox.cachePath('demo', 'reddit', await nameFor('another-angle-reddit', QUERY))));
});

test('one branch asking one query twice writes one file', async () => {
  const base = await sandbox.apiReturning({ results: [{ url: 'https://r.test/a', title: 'A', relevance: 1 }] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs([QUERY]));
  const { json } = await sandbox.run(...searchArgs([QUERY]));
  assert.equal(sandbox.requests.length, 1, 'the second call was served from cache');
  assert.equal(json.results[QUERY].results[0].title, 'A');
});

// One call is the branch's whole allowance, and each response is on disk before the next
// request goes out.
test('several queries in one call are one file each, in order', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  const { json } = await sandbox.run(...searchArgs(['one', 'two', 'three']));
  assert.equal(sandbox.requests.length, 3);
  assert.deepEqual(sandbox.requests.map((request) => request.query.query), ['one', 'two', 'three']);
  assert.deepEqual(Object.keys(json.results), ['one', 'two', 'three']);
  assert.equal(readdirSync(searchDir()).length, 3, 'one file per query');
});

test('the cap counts one branch and leaves another alone', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs(['q1', 'q2', 'q3', 'q4', 'q5']));
  const { json } = await sandbox.run(
    'api.mjs', 'reddit', 'search', '--branch', 'another-angle-reddit', '--query', 'q1', '--topic', 'demo',
  );
  assert.deepEqual(json.refused, [], 'a second branch starts with its whole budget');
  assert.equal(sandbox.requests.length, 6);
});

// A searcher that died before writing its list comes back for results it already paid for.
// Refusing it there would strand it, so a stored query is served whatever the count says.
test('a repeat is served from cache even with the budget spent', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs(['q1', 'q2', 'q3', 'q4', 'q5']));
  const { code, json } = await sandbox.run(...searchArgs(['q1', 'q2', 'q3', 'q4', 'q5']));
  assert.equal(code, 0, 'not refused');
  assert.equal(sandbox.requests.length, 5, 'nothing was fetched a second time');
  assert.deepEqual(Object.keys(json.results), ['q1', 'q2', 'q3', 'q4', 'q5']);
});

// A branch that overspends loses the surplus. It does not lose the queries that fit.
test('over the cap the queries that fit run and the rest are named', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  const { code, json } = await sandbox.run(...searchArgs(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']));
  assert.equal(code, 0, 'refusing the surplus is not a failure');
  assert.equal(sandbox.requests.length, 5);
  assert.deepEqual(json.refused, ['q6', 'q7']);
  assert.deepEqual(Object.keys(json.results), ['q1', 'q2', 'q3', 'q4', 'q5']);
});

test('a new query with the budget spent is refused, and nothing is requested', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs(['q1', 'q2', 'q3', 'q4', 'q5']));
  const { code, err } = await sandbox.run(...searchArgs(['q6']));
  assert.equal(code, 2, 'EXIT.USAGE');
  assert.equal(sandbox.requests.length, 5, 'no sixth request');
  assert.match(err, /already run its 5 searches/);
  assert.match(err, /read those files rather than searching again/);
});

// The files are the ledger, so a call recounts from disk and needs nothing carried into it.
test('a killed batch leaves whole files, and the next call runs only what is missing', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs(['q1', 'q2']));
  assert.equal(sandbox.requests.length, 2);
  const { json } = await sandbox.run(...searchArgs(['q1', 'q2', 'q3']));
  assert.equal(sandbox.requests.length, 3, 'only q3 was fetched');
  assert.deepEqual(Object.keys(json.results), ['q1', 'q2', 'q3'], 'all three answered');
  assert.equal(readdirSync(searchDir()).length, 3);
});

test('--fast lowers the cap', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  const { json } = await sandbox.run(...searchArgs(['q1', 'q2', 'q3', 'q4'], ['--fast']));
  assert.deepEqual(json.refused, ['q4'], 'the fast cap is 3, so the fourth does not fit');
  assert.equal(sandbox.requests.length, 3);
});

test('a branch and at least one query are both required', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  const noBranch = await sandbox.run('api.mjs', 'reddit', 'search', '--query', QUERY, '--topic', 'demo');
  assert.equal(noBranch.code, 2);
  assert.match(noBranch.err, /--branch/);
  const noQuery = await sandbox.run('api.mjs', 'reddit', 'search', '--branch', BRANCH, '--topic', 'demo');
  assert.equal(noQuery.code, 2);
  assert.match(noQuery.err, /--query/);
  assert.equal(sandbox.requests.length, 0);
});

// An unqualified search asks for the last year, not for all time.
test('search defaults are relevance, year, limit 20', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs([QUERY]));
  assert.equal(sandbox.requests[0].path, '/v1/reddit/search');
  assert.deepEqual(sandbox.requests[0].query, { query: QUERY, sort: 'relevance', time_window: 'year', limit: '20' });
});

// brain/recency.md's 2-year window is the caller's job, not a default. Both parameters are
// hints the API forwards upstream, not filters it enforces — the run states its window
// rather than trusting it, which is a reporting rule rather than anything this script does.
test('the 2-year window is --time-window all plus --after-date', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs([QUERY], ['--time-window', 'all', '--after-date', '2024-01-01']));
  assert.equal(sandbox.requests[0].query.time_window, 'all');
  assert.equal(sandbox.requests[0].query.after_date, '2024-01-01');
});

test('every search flag reaches the API', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs([QUERY], [
    '--sort', 'top', '--time-window', 'month', '--limit', '5', '--after-date', '2025-06-01',
  ]));
  assert.deepEqual(sandbox.requests[0].query, {
    query: QUERY, sort: 'top', time_window: 'month', limit: '5', after_date: '2025-06-01',
  });
});

// The site-wide rule: there is no subreddit restriction and nothing sends one.
test('there is no --subreddit flag, and nothing sends a subreddits parameter', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs([QUERY], ['--subreddit', 'webdev']));
  assert.equal(sandbox.requests[0].query.subreddits, undefined);
  assert.equal(sandbox.requests[0].query.subreddit, undefined);
});

test('a limit above the maximum is refused before the network', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  const { code } = await sandbox.run(...searchArgs([QUERY], ['--limit', '21']));
  assert.equal(code, 2);
  assert.equal(sandbox.requests.length, 0);
});

test('a limit of zero or a non-number is refused too', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  for (const limit of ['0', '-1', 'ten', '2.5']) {
    const { code } = await sandbox.run(...searchArgs([QUERY], ['--limit', limit]));
    assert.equal(code, 2, `--limit ${limit}`);
  }
  assert.equal(sandbox.requests.length, 0);
});

test('the merged list is returned exactly as the API sent it', async () => {
  const results = [
    { url: 'https://r.test/a', title: 'A', relevance: 1 },
    { url: 'https://r.test/b', title: 'B', relevance: 0.5 },
  ];
  const base = await sandbox.apiReturning({ results });
  sandbox.configured(base);
  const { json } = await sandbox.run(...searchArgs([QUERY]));
  assert.deepEqual(json.results[QUERY].results, results, 'no client-side re-ranking, dedupe or truncation');
});

// A stored request that does not match is the same query asked differently — the newer one wins.
test('a changed sort re-fetches over the same file', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  await sandbox.run(...searchArgs([QUERY]));
  await sandbox.run(...searchArgs([QUERY], ['--sort', 'top']));
  assert.equal(sandbox.requests.length, 2, 'the second was fetched, not served from the first');
  const stored = sandbox.cached('demo', 'reddit', await nameFor(BRANCH, QUERY));
  assert.equal(stored._request.sort, 'top', 'one file per query, holding the newest request');
  assert.equal(readdirSync(searchDir()).length, 1, 'no -2 file — there is no probing');
});

// Files written before the request was stored carry no `_request`, so they miss once.
test('a cache file with no stored request is a miss', async () => {
  const base = await sandbox.apiReturning({ results: [] });
  sandbox.configured(base);
  sandbox.writeCache('demo', 'reddit', await nameFor(BRANCH, QUERY), { results: [] });
  await sandbox.run(...searchArgs([QUERY]));
  assert.equal(sandbox.requests.length, 1, 're-fetched rather than trusted');
});

// scripts/subagent_returns.json — branch-searcher: {results:[{url,title,relevance}]}
test('each query carries the Branch searcher shape', async () => {
  const base = await sandbox.apiReturning({
    results: [{ url: 'https://r.test/a', title: 'A', relevance: 1 }],
  });
  sandbox.configured(base);
  const { json } = await sandbox.run(...searchArgs([QUERY]));
  // Three fields, and no count the script publishes about its own work: what it fetched and what
  // the branch now holds are both observable on disk.
  assert.deepEqual(Object.keys(json).sort(), ['branch', 'refused', 'results']);
  // `_request` rides along so the file says what it was fetched for; the shape is `results`.
  assert.deepEqual(Object.keys(json.results[QUERY]).sort(), ['_request', 'results']);
  assert.deepEqual(Object.keys(json.results[QUERY].results[0]).sort(), ['relevance', 'title', 'url']);
});


// ---------------------------------------------------------------- thread

/** One thread, as the endpoint keys it: the post flat, with its comments beside it. */
const threadFor = (threadId) => ({
  id: threadId,
  title: 'A thread',
  author: 'someone',
  subreddit: 'webdev',
  num_comments: 900,
  comments: [
    { id: 'c1', author: 'someone', body: 'first', score: 40, created_utc: 1700000000, permalink: `/r/webdev/comments/${threadId}/x/c1/`, parent_id: `t3_${threadId}` },
    { id: 'c2', author: 'other', body: 'a reply', score: 5, created_utc: 1700000100, permalink: `/r/webdev/comments/${threadId}/x/c2/`, parent_id: 't1_c1' },
  ],
});

test('thread caches as thread-<id>.json and accepts a permalink', async () => {
  const base = await sandbox.api(keyedBy('thread_ids', threadFor));
  sandbox.configured(base);
  const { json } = await sandbox.run('api.mjs', 'reddit', 'thread', '/r/webdev/comments/1a2b3c/', '--topic', 'demo');
  assert.equal(sandbox.requests[0].path, '/v1/reddit/threads');
  assert.equal(sandbox.requests[0].query.thread_ids, '1a2b3c', 'the normalised id, not the permalink');
  assert.equal(sandbox.requests[0].query.limit, '500', 'the documented default');
  assert.ok(existsSync(sandbox.cachePath('demo', 'reddit', 'reddit-thread-1a2b3c.json')));
  assert.deepEqual(json.threads['1a2b3c'], threadFor('1a2b3c'), 'the post passes through whole, comments and all');
  assert.equal(json.threads['1a2b3c'].comments[1].parent_id, 't1_c1', 'flat comments; parent_id rebuilds the tree');
});

// The whole point of the batch: many threads, one request, one file each.
test('many threads are one call and one file per thread', async () => {
  const base = await sandbox.api(keyedBy('thread_ids', threadFor));
  sandbox.configured(base);
  const ids = ['aaa111', 'bbb222', 'ccc333'];
  const { json } = await sandbox.run('api.mjs', 'reddit', 'thread', ...ids, '--topic', 'demo');
  assert.equal(sandbox.requests.length, 1, 'one request, not one per thread');
  assert.equal(sandbox.requests[0].query.thread_ids, ids.join(','));
  for (const threadId of ids) {
    assert.ok(existsSync(sandbox.cachePath('demo', 'reddit', `reddit-thread-${threadId}.json`)), threadId);
    assert.equal(json.threads[threadId].id, threadId, 'keyed by exactly what was sent');
  }
});

// A list longer than the endpoint accepts is split by the script; the caller never chunks.
test('more than twenty ids are split across calls', async () => {
  const base = await sandbox.api(keyedBy('thread_ids', threadFor));
  sandbox.configured(base);
  const ids = Array.from({ length: 21 }, (_, index) => `id${String(index).padStart(4, '0')}`);
  await sandbox.run('api.mjs', 'reddit', 'thread', ...ids, '--topic', 'demo');
  assert.equal(sandbox.requests.length, 2, '20 then 1');
  assert.equal(sandbox.requests[0].query.thread_ids.split(',').length, 20);
  assert.equal(sandbox.requests[1].query.thread_ids.split(',').length, 1);
});

test('only the cache misses are requested', async () => {
  const base = await sandbox.api(keyedBy('thread_ids', threadFor));
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'thread', 'aaa111', '--topic', 'demo');
  const { json } = await sandbox.run('api.mjs', 'reddit', 'thread', 'aaa111', 'bbb222', '--topic', 'demo');
  assert.equal(sandbox.requests.length, 2, 'a second call, not a second batch of both');
  assert.equal(sandbox.requests[1].query.thread_ids, 'bbb222', 'the warm one is not re-asked for');
  assert.equal(json.threads['aaa111'].id, 'aaa111', 'the cached one is still returned');
  assert.equal(json.threads['bbb222'].id, 'bbb222');
});

/**
 * One bad id never costs the rest of the batch: the call still returns 200 and the failure
 * arrives as a short string in that key. The failure is cached as a tombstone so that
 * nothing asks again — without one, every later pass re-requests the same dead id.
 */
test('a per-item failure is a tombstone, not a dropped item', async () => {
  const base = await sandbox.api(
    keyedBy('thread_ids', (threadId) => (threadId === 'dead111' ? 'not found' : threadFor(threadId))),
  );
  sandbox.configured(base);
  const { json } = await sandbox.run('api.mjs', 'reddit', 'thread', 'aaa111', 'dead111', '--topic', 'demo');

  assert.equal(json.threads['aaa111'].id, 'aaa111', 'the good one is unaffected');
  assert.equal(json.threads['dead111'].fetchFailed, 'not found', 'the caller is told which id failed and why');
  assert.ok(json.threads['dead111'].failedAt, 'and when');

  const stored = sandbox.cached('demo', 'reddit', 'reddit-thread-dead111.json');
  assert.equal(stored.fetchFailed, 'not found');
  assert.equal(typeof stored, 'object', 'stored as an object, never the bare string');
});

test('a tombstoned id is never requested a second time', async () => {
  const base = await sandbox.api(keyedBy('thread_ids', () => 'not found'));
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'thread', 'dead111', '--topic', 'demo');
  const { json } = await sandbox.run('api.mjs', 'reddit', 'thread', 'dead111', '--topic', 'demo');
  assert.equal(sandbox.requests.length, 1, 'the tombstone is a cache hit');
  assert.equal(json.threads['dead111'].fetchFailed, 'not found', 'and still reports the failure');
});

// `unavailable` is not retried either. Deleting the file is how a re-fetch is forced.
test('an unavailable item is tombstoned like a missing one', async () => {
  const base = await sandbox.api(keyedBy('thread_ids', () => 'unavailable'));
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'thread', 'aaa111', '--topic', 'demo');
  await sandbox.run('api.mjs', 'reddit', 'thread', 'aaa111', '--topic', 'demo');
  assert.equal(sandbox.requests.length, 1);
  assert.equal(sandbox.cached('demo', 'reddit', 'reddit-thread-aaa111.json').fetchFailed, 'unavailable');
});

// A key the API omits entirely would otherwise be neither a record nor a failure.
test('a key the API leaves out becomes unavailable', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.configured(base);
  const { json } = await sandbox.run('api.mjs', 'reddit', 'thread', 'aaa111', '--topic', 'demo');
  assert.equal(json.threads['aaa111'].fetchFailed, 'unavailable');
});

/**
 * The id is the segment after `comments/`, and the last path segment only when that
 * misses. A real Reddit permalink carries a title slug after the id, so taking the last
 * segment alone hands the API the slug and earns a 400. Phase A harvests these URLs from
 * search results, so this is the normal case.
 */
test('the post id is read from a real permalink, not its title slug', async () => {
  const forms = [
    'https://old.reddit.com/r/RDDT/comments/1tvs5jj/steve_jen_and_drew_here_ask_us_anything/',
    'https://www.reddit.com/r/RDDT/comments/1tvs5jj/steve_jen_and_drew_here_ask_us_anything',
    '/r/RDDT/comments/1tvs5jj/',
    '1tvs5jj',
  ];
  for (const form of forms) {
    const caseSandbox = new Sandbox();
    try {
      const caseBase = await caseSandbox.api(keyedBy('thread_ids', threadFor));
      caseSandbox.configured(caseBase);
      await caseSandbox.run('api.mjs', 'reddit', 'thread', form, '--topic', 'demo');
      assert.equal(caseSandbox.requests[0].query.thread_ids, '1tvs5jj', form);
      assert.ok(existsSync(caseSandbox.cachePath('demo', 'reddit', 'reddit-thread-1tvs5jj.json')), form);
    } finally {
      await caseSandbox.cleanup();
    }
  }
});

// A comment permalink carries a second id after the slug. The post id is still the one
// after `comments/` — the last segment is the comment.
test('a comment permalink still resolves to its post id', async () => {
  const base = await sandbox.api(keyedBy('thread_ids', threadFor));
  sandbox.configured(base);
  await sandbox.run(
    'api.mjs', 'reddit', 'thread',
    '/user/spez/comments/1vgbkge/modernizing_reddits_infrastructure/p1wosm9/',
    '--topic', 'demo',
  );
  assert.equal(sandbox.requests[0].query.thread_ids, '1vgbkge');
});

/**
 * A flat 30s was sized for a request that fetches one thing. Measured against the live
 * endpoint, 25 profiles take 40.3s — so a batch on the flat timeout failed as "the digmore
 * API could not be reached" while the API was answering perfectly well.
 */
test('a batched call gets longer than a single one, up to a ceiling', async () => {
  const { batchTimeoutMs, REQUEST_TIMEOUT_MS, MAX_BATCH_TIMEOUT_MS } = await import('../skill/scripts/api.mjs');
  assert.ok(batchTimeoutMs(1) > REQUEST_TIMEOUT_MS, 'even one item gets more than the flat timeout');
  assert.ok(batchTimeoutMs(25) > 40_300, 'above the measured 25-profile time');
  assert.ok(batchTimeoutMs(100) > batchTimeoutMs(25), 'it grows with the batch');
  assert.equal(batchTimeoutMs(10_000), MAX_BATCH_TIMEOUT_MS, 'and stops growing, or it is not a timeout');
});

// ---------------------------------------------------------------- user

/**
 * The merged reddit/users response: the snapshot and the verdict in one body.
 * `recent_comments` is one object per comment — never parallel lists matched by
 * position, because a field that cannot be read for one comment drops an entry and
 * silently shifts every entry after it.
 */
const userFor = (name) => ({
  name,
  link_karma: 10,
  comment_karma: 900,
  recent_comments: [
    { body: 'first', subreddit: 'webdev', created_utc: 1700000000, permalink: '/r/webdev/comments/a/', score: 12 },
    { body: 'second', subreddit: 'saas', created_utc: 1700000100, permalink: '/r/saas/comments/b/', score: 3 },
  ],
  verdict: 'legit',
  signals: { account_age_days: '900' },
  reason: 'multi-year history',
});

// One handle, one file — whatever size batch fetched it. It used to be three files, because
// the brain this came from made two requests and cached the verdict in a third. Nothing ever
// read the pieces separately, and three files meant three reads that all had to hit before
// the cache counted as warm.
test('user writes one cache file per handle, holding the whole response', async () => {
  const base = await sandbox.api(keyedBy('names', userFor));
  sandbox.configured(base);
  const { json } = await sandbox.run('api.mjs', 'reddit', 'user', 'someone', '--topic', 'demo');
  assert.equal(sandbox.requests.length, 1, 'the verdict costs no extra request');
  assert.equal(sandbox.requests[0].path, '/v1/reddit/users');
  assert.equal(sandbox.requests[0].query.names, 'someone');

  const vetted = sandbox.cached('demo', 'reddit', 'reddit-vet-someone.json');
  assert.equal(vetted.comment_karma, 900, 'the profile');
  assert.equal(vetted.verdict, 'legit', 'the verdict');
  assert.deepEqual(vetted.recent_comments, userFor('someone').recent_comments, 'and the comments, whole');
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

  assert.deepEqual(json.users.someone, userFor('someone'), 'stdout carries the whole body');
});

// A Handle Vetter serving a range of ten spends one request and leaves ten files.
test('a range of handles is one call and one file each', async () => {
  const base = await sandbox.api(keyedBy('names', userFor));
  sandbox.configured(base);
  const names = ['alice', 'bob', 'carol'];
  const { json } = await sandbox.run('api.mjs', 'reddit', 'user', ...names, '--topic', 'demo');
  assert.equal(sandbox.requests.length, 1, 'one request for the whole range');
  assert.equal(sandbox.requests[0].query.names, names.join(','));
  for (const name of names) {
    assert.equal(sandbox.cached('demo', 'reddit', `reddit-vet-${name}.json`).name, name);
    assert.equal(json.users[name].verdict, 'legit');
  }
});

test('a second user call is served from that one cache file', async () => {
  const base = await sandbox.api(keyedBy('names', userFor));
  sandbox.configured(base);
  await sandbox.run('api.mjs', 'reddit', 'user', 'someone', '--topic', 'demo');
  const { json } = await sandbox.run('api.mjs', 'reddit', 'user', 'someone', '--topic', 'demo');
  assert.equal(sandbox.requests.length, 1, 'the second call does not re-fetch');
  assert.equal(json.users.someone.name, 'someone');
  assert.deepEqual(json.users.someone.recent_comments, userFor('someone').recent_comments);
  assert.equal(json.users.someone.verdict, 'legit', 'the verdict survives the round trip through cache');
});

// A deleted or suspended account is one dead key, not a dead batch — the rule that lets one
// bad handle sit in a range of ten without costing the other nine.
test('a suspended handle fails alone, and is not asked for again', async () => {
  const base = await sandbox.api(
    keyedBy('names', (name) => (name === 'gone' ? 'not found' : userFor(name))),
  );
  sandbox.configured(base);
  const { json } = await sandbox.run('api.mjs', 'reddit', 'user', 'alice', 'gone', '--topic', 'demo');
  assert.equal(json.users.alice.verdict, 'legit');
  assert.equal(json.users.gone.fetchFailed, 'not found');

  await sandbox.run('api.mjs', 'reddit', 'user', 'alice', 'gone', '--topic', 'demo');
  assert.equal(sandbox.requests.length, 1, 'neither handle is re-requested');
});

// ---------------------------------------------------------------- surface

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

// The shared verdict vocabulary, unchanged by the batch.
test('every verdict in the vocabulary passes through untouched', async () => {
  for (const verdict of ['legit', 'unknown', 'promoter', 'spammer', 'throwaway']) {
    const caseSandbox = new Sandbox();
    try {
      const base = await caseSandbox.api(
        keyedBy('names', (name) => ({ name, verdict, signals: {}, reason: 'r' })),
      );
      caseSandbox.configured(base);
      const { json } = await caseSandbox.run('api.mjs', 'reddit', 'user', 'x', '--topic', 'demo');
      assert.equal(json.users.x.verdict, verdict);
    } finally {
      await caseSandbox.cleanup();
    }
  }
});

// `thread` and `user` take positionals; `search` takes --branch and --query. Either way a call
// with nothing to act on is refused rather than treated as an empty result.
test('each verb refuses a call with nothing to act on', async () => {
  const base = await sandbox.apiReturning({});
  sandbox.configured(base);
  for (const verb of ['search', 'thread', 'user']) {
    const { code } = await sandbox.run('api.mjs', 'reddit', verb, '--topic', 'demo');
    assert.notEqual(code, 0, verb);
  }
  assert.equal(sandbox.requests.length, 0);
});
