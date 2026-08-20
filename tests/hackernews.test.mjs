import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as hackernews from '../skill/scripts/hackernews.mjs';

const DAY = 86400;
const NOW = 1_800_000_000; // a fixed "now" so age assertions never drift

let dir;
let server;
let hits;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'digmore-hn-'));
  hits = [];
});

afterEach(async () => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  if (server) {
    server.closeAllConnections?.();
    await new Promise((closed) => server.close(() => closed()));
    server = undefined;
  }
});

/**
 * Stands in for both hosts. Tests call the exported functions in process, so there is
 * no blocking child and the server can answer.
 */
async function stub(handler) {
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    hits.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
    handler(req, res, url);
  });
  await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    algoliaBase: base,
    hnWebBase: `${base}/user`,
    cacheDir: dir,
    now: NOW,
    // The real 15s gap between HN web calls is asserted separately; waiting it out
    // here would cost 45s per retry test.
    hnWebMinIntervalMs: 0,
  };
}

const json = (res, body, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const html = (res, body, status = 200) => {
  res.writeHead(status, { 'content-type': 'text/html' });
  res.end(body);
};

/** An HN user page, in the shape the parser reads. */
function userPage({ karma = 500, created = NOW - 3 * 365 * DAY, about = '' } = {}) {
  return `<html><body><table>
    <tr><td>user:</td><td timestamp="${created}">someone</td></tr>
    <tr><td>created:</td><td><a href="x">October 9, 2006</a></td></tr>
    <tr><td>karma:</td><td>${karma}</td></tr>
    <tr><td>about:</td><td>${about}</td></tr>
  </table></body></html>`;
}

function algoliaComments(texts, { nbHits, lastTs = NOW - 10 * DAY } = {}) {
  return {
    nbHits: nbHits ?? texts.length,
    hits: texts.map((comment_text, index) => ({
      comment_text,
      created_at_i: lastTs - index * DAY,
    })),
  };
}

// ---------------------------------------------------------------- story

test('story fetches the Algolia item tree and caches it as item-<N>.json', async () => {
  const opts = await stub((req, res) =>
    json(res, {
      id: 42,
      title: 'Show HN: a thing',
      url: 'https://thing.test',
      points: 120,
      author: 'someone',
      created_at_i: NOW - DAY,
      children: [
        { type: 'comment', id: 43, author: 'a', text: '<p>first</p>', parent_id: 42, created_at_i: NOW },
        { type: 'comment', id: 44, author: 'b', text: 'second', parent_id: 42, created_at_i: NOW },
      ],
    }),
  );

  const story = await hackernews.fetchStory(42, opts);
  assert.equal(hits[0].path, '/items/42');
  assert.equal(story.id, 42);
  assert.equal(story.title, 'Show HN: a thing');
  assert.equal(story.points, 120);
  assert.equal(story.num_comments, 2, 'num_comments counts the flattened tree');
  assert.deepEqual(story.top_comments.map((comment) => comment.text), ['first', 'second']);
  assert.ok(existsSync(join(dir, 'item-42.json')));
});

// The comment tree flattens at depth 3.
test('the comment tree flattens to depth 3 and no deeper', async () => {
  const nest = (depth) =>
    depth > 6
      ? []
      : [{ type: 'comment', id: depth, text: `level ${depth}`, children: nest(depth + 1) }];
  const opts = await stub((req, res) => json(res, { id: 1, title: 't', children: nest(1) }));

  const story = await hackernews.fetchStory(1, opts);
  assert.deepEqual(
    story.top_comments.map((comment) => comment.text),
    ['level 1', 'level 2', 'level 3'],
    'deeper sub-threads are dropped',
  );
});

test('comments without text are skipped', async () => {
  const opts = await stub((req, res) =>
    json(res, {
      id: 1,
      title: 't',
      children: [
        { type: 'comment', id: 2, text: '' },
        { type: 'comment', id: 3, text: 'kept' },
        { type: 'story', id: 4, text: 'not a comment' },
      ],
    }),
  );
  const story = await hackernews.fetchStory(1, opts);
  assert.deepEqual(story.top_comments.map((comment) => comment.text), ['kept']);
});

test('html in comment text is stripped and entities are decoded', async () => {
  const opts = await stub((req, res) =>
    json(res, {
      id: 1,
      title: 't',
      children: [
        {
          type: 'comment',
          id: 2,
          text: '<p>first para</p><p>second &amp; &quot;quoted&quot;</p><a href="x">link</a>',
        },
      ],
    }),
  );
  const story = await hackernews.fetchStory(1, opts);
  const text = story.top_comments[0].text;
  assert.ok(!text.includes('<'), 'no tags survive');
  assert.match(text, /second & "quoted"/);
  assert.match(text, /first para/);
});

// ---------------------------------------------------------------- user

function userStub({
  page = userPage(),
  comments = algoliaComments(['hello']),
  stories = { nbHits: 7 },
  commentsMeta,
} = {}) {
  return (req, res, url) => {
    // /users/<name> is Algolia's fallback endpoint; /user is the HN web page.
    if (url.pathname.startsWith('/users/')) return json(res, { karma: 999, about: 'fallback bio' });
    if (url.pathname === '/user') return html(res, page);
    // search_by_date, newest first: the lifetime count and the true last-comment date.
    if (url.pathname === '/search_by_date') {
      return json(res, commentsMeta ?? { nbHits: comments.nbHits, hits: comments.hits.slice(0, 1) });
    }
    const tags = url.searchParams.get('tags') ?? '';
    if (tags.startsWith('story')) return json(res, stories);
    return json(res, comments);
  };
}

test('user merges the HN page with Algolia and caches all three artefacts', async () => {
  const opts = await stub(
    userStub({
      page: userPage({ karma: 4321, created: NOW - 3 * 365 * DAY, about: 'I work on https://mine.test' }),
      comments: algoliaComments(['one', 'two', 'three'], { nbHits: 812 }),
      stories: { nbHits: 7 },
    }),
  );

  const user = await hackernews.fetchUser('someone', opts);
  assert.equal(user.name, 'someone');
  assert.equal(user.karma, 4321, 'karma comes from the HN page');
  assert.equal(user.created_utc, NOW - 3 * 365 * DAY, 'the only source of account age');
  assert.match(user.about, /mine\.test/);
  assert.equal(user.comment_count_sampled, 3);
  assert.deepEqual(user.recent_comment_excerpts, ['one', 'two', 'three']);
  assert.equal(user.stories_submitted, 7);
  assert.equal(user.comments_submitted, 812, 'the lifetime count, not the sampled count');
  assert.equal(user.last_activity_utc, NOW - 10 * DAY, 'the newest comment timestamp');

  assert.ok(existsSync(join(dir, 'user-page-someone.html')));
  assert.ok(existsSync(join(dir, 'user-comments-someone.json')));
});

// brain/recency.md — "HN Algolia: pass numericFilters=created_at_i>{epoch_2yrs_ago}
// on every search call."
test('the recent-comment search is filtered to the last two years', async () => {
  const opts = await stub(userStub());
  await hackernews.fetchUser('someone', opts);
  const search = hits.find((hit) => hit.path === '/search' && hit.query.hitsPerPage === '50');
  assert.ok(search, 'the excerpt search is made');
  const cutoff = NOW - 2 * 365 * DAY;
  assert.equal(search.query.numericFilters, `created_at_i>${cutoff}`);
});

test('the lifetime counters are NOT recency-filtered, so they stay lifetime', async () => {
  const opts = await stub(userStub());
  await hackernews.fetchUser('someone', opts);
  const counting = hits.filter((hit) => hit.path === '/search_by_date' || hit.query.hitsPerPage === '0');
  assert.ok(counting.length >= 2, 'stories and comments are both counted');
  for (const hit of counting) {
    assert.equal(hit.query.numericFilters, undefined, `${hit.query.tags} must count all time`);
  }
});

// The Hubs table downweights people who have gone quiet. Reading last_active off the
// recency-filtered list would make anyone dormant longer than the window look as if
// they had never posted, which is the opposite of the signal wanted.
test('last_active is the real last-comment date, however old', async () => {
  const threeYearsAgo = NOW - 3 * 365 * DAY;
  const opts = await stub(
    userStub({
      // Nothing inside the two-year window.
      comments: { nbHits: 40, hits: [] },
      commentsMeta: { nbHits: 40, hits: [{ created_at_i: threeYearsAgo }] },
    }),
  );
  const user = await hackernews.fetchUser('someone', opts);
  assert.equal(user.last_activity_utc, threeYearsAgo, 'dormant, not missing');
  assert.equal(user.comment_count_sampled, 0, 'nothing recent to sample');
  assert.equal(user.comments_submitted, 40, 'the lifetime count still stands');
});

test('last_active is null only when the account has never commented', async () => {
  const opts = await stub(
    userStub({ comments: { nbHits: 0, hits: [] }, commentsMeta: { nbHits: 0, hits: [] } }),
  );
  const user = await hackernews.fetchUser('someone', opts);
  assert.equal(user.last_activity_utc, null);
});

test('excerpts are capped at 280 characters', async () => {
  const opts = await stub(userStub({ comments: algoliaComments(['x'.repeat(500)]) }));
  const user = await hackernews.fetchUser('someone', opts);
  assert.equal(user.recent_comment_excerpts[0].length, 280);
});

test('at most 50 recent comments are asked for', async () => {
  const opts = await stub(userStub());
  await hackernews.fetchUser('someone', opts);
  assert.ok(hits.some((hit) => hit.query.hitsPerPage === '50'));
});

// When the HN web backoff is exhausted, fall back to Algolia
// /users/<name> for karma + bio, losing account age. vet_user tolerates it.
test('a 429-exhausted HN page falls back to Algolia and loses only the age', async () => {
  const opts = await stub((req, res, url) => {
    if (url.pathname === '/user') {
      return html(res, 'rate limited', 429);
    }
    return userStub()(req, res, url);
  });

  const user = await hackernews.fetchUser('someone', { ...opts, backoffDelays: [0, 0, 0] });
  assert.equal(user.karma, 999, 'karma from the Algolia fallback');
  assert.equal(user.about, 'fallback bio');
  assert.equal(user.created_utc, null, 'account age is unavailable on this path');
  assert.ok(existsSync(join(dir, 'user-algolia-someone.json')));
  assert.ok(!existsSync(join(dir, 'user-page-someone.html')));
});

test('a 429 is retried on the backoff schedule before falling back', async () => {
  let pageAttempts = 0;
  const opts = await stub((req, res, url) => {
    if (url.pathname === '/user') {
      pageAttempts += 1;
      return html(res, 'rate limited', 429);
    }
    return userStub()(req, res, url);
  });
  await hackernews.fetchUser('someone', { ...opts, backoffDelays: [0, 0, 0] });
  assert.equal(pageAttempts, 4, 'immediate attempt plus three retries');
});

test('the default backoff schedule is the documented schedule', () => {
  assert.deepEqual(hackernews.BACKOFF_DELAYS, [5000, 15000, 45000]);
  assert.equal(hackernews.HN_WEB_MIN_INTERVAL_MS, 15000);
});

test('an Algolia failure is an error, not a silent empty user', async () => {
  const opts = await stub((req, res, url) => {
    if (url.pathname.startsWith('/user')) return html(res, userPage());
    return json(res, { error: 'boom' }, 500);
  });
  await assert.rejects(() => hackernews.fetchUser('someone', opts));
});

// ---------------------------------------------------------------- vetting

const baseUser = (over = {}) => ({
  name: 'someone',
  karma: 200,
  created_utc: NOW - 3 * 365 * DAY,
  about: '',
  stories_submitted: 1,
  comments_submitted: 10,
  comment_count_sampled: 5,
  recent_comment_excerpts: ['a', 'b', 'c', 'd', 'e'],
  last_activity_utc: NOW - DAY,
  ...over,
});

const verdictOf = (over) => hackernews.vetUser(baseUser(over), NOW).verdict;

test('a profile that could not be read is unknown, not throwaway', () => {
  const vetted = hackernews.vetUser(
    baseUser({ karma: null, about: '', comment_count_sampled: 0, recent_comment_excerpts: [] }),
    NOW,
  );
  assert.equal(vetted.verdict, 'unknown');
  assert.equal(vetted.reason, 'missing-profile');
});

test('karma over 1000 is legit on its own, even with no known age', () => {
  assert.equal(verdictOf({ karma: 1001, created_utc: null }), 'legit');
});

test('two years plus karma over 100 is legit', () => {
  assert.equal(verdictOf({ karma: 101, created_utc: NOW - 3 * 365 * DAY }), 'legit');
  assert.equal(verdictOf({ karma: 100, created_utc: NOW - 3 * 365 * DAY }), 'unknown', '100 is not over 100');
});

test('young, low-karma and barely posted is throwaway', () => {
  const vetted = hackernews.vetUser(baseUser({ karma: 49, created_utc: NOW - 30 * DAY }), NOW);
  assert.equal(vetted.verdict, 'throwaway');
  assert.equal(vetted.reason, 'young-low-karma-few-posts');
});

// All three conditions, never one alone. An account can be new because the person just
// arrived, and low karma says nothing on its own about someone who has been posting for
// months.
test('a young low-karma account that has posted a lot is not thrown away', () => {
  const vetted = hackernews.vetUser(
    baseUser({ karma: 49, created_utc: NOW - 30 * DAY, stories_submitted: 4, comments_submitted: 40 }),
    NOW,
  );
  assert.notEqual(vetted.verdict, 'throwaway');
});

test('a submitter with no sampled comments is unknown', () => {
  const vetted = hackernews.vetUser(
    baseUser({ comment_count_sampled: 0, recent_comment_excerpts: [], karma: 300 }),
    NOW,
  );
  assert.equal(vetted.verdict, 'unknown');
  assert.equal(vetted.reason, 'submitter-only');
});

test('a bio host repeated three times in comments is a promoter', () => {
  const vetted = hackernews.vetUser(
    baseUser({
      about: 'founder of https://mine.test',
      recent_comment_excerpts: ['see https://mine.test/a', 'https://mine.test/b', 'and https://mine.test/c'],
      karma: 5000,
    }),
    NOW,
  );
  assert.equal(vetted.verdict, 'promoter', 'promoter beats the karma>1000 legit rule');
  assert.match(vetted.signals.promoter_host, /mine\.test:3/);
});

test('two repeats is not enough for promoter', () => {
  assert.equal(
    verdictOf({
      about: 'https://mine.test',
      recent_comment_excerpts: ['https://mine.test/a', 'https://mine.test/b'],
      karma: 5000,
    }),
    'legit',
  );
});

// Moderators and regulars routinely link to HN itself.
test('linking to HN itself is never promotion or spam', () => {
  const platform = ['news.ycombinator.com', 'ycombinator.com', 'hn.algolia.com'];
  for (const host of platform) {
    assert.equal(
      verdictOf({
        about: `https://${host}/user?id=someone`,
        recent_comment_excerpts: Array.from({ length: 8 }, (_, i) => `https://${host}/item?id=${i}`),
        karma: 5000,
      }),
      'legit',
      host,
    );
  }
});

test('a non-bio host repeated five times is a spammer', () => {
  const vetted = hackernews.vetUser(
    baseUser({
      about: '',
      recent_comment_excerpts: Array.from({ length: 5 }, (_, i) => `buy at https://spam.test/${i}`),
      karma: 5000,
    }),
    NOW,
  );
  assert.equal(vetted.verdict, 'spammer');
  assert.match(vetted.signals.spammer_host, /spam\.test:5/);
});

test('four repeats is not enough for spammer', () => {
  assert.equal(
    verdictOf({
      about: '',
      recent_comment_excerpts: Array.from({ length: 4 }, (_, i) => `https://spam.test/${i}`),
      karma: 5000,
    }),
    'legit',
  );
});

test('www. is stripped so the same host is counted once', () => {
  const vetted = hackernews.vetUser(
    baseUser({
      about: '',
      recent_comment_excerpts: [
        'https://www.spam.test/1',
        'https://spam.test/2',
        'https://www.spam.test/3',
        'https://spam.test/4',
        'https://www.spam.test/5',
      ],
      karma: 5000,
    }),
    NOW,
  );
  assert.equal(vetted.verdict, 'spammer');
});

test('otherwise the verdict is unknown for insufficient signal', () => {
  const vetted = hackernews.vetUser(baseUser({ karma: 60, created_utc: NOW - 200 * DAY }), NOW);
  assert.equal(vetted.verdict, 'unknown');
  assert.equal(vetted.reason, 'insufficient-signal');
});

test('signals carry the numbers a reader can check', () => {
  const vetted = hackernews.vetUser(baseUser({ karma: 4321 }), NOW);
  assert.equal(vetted.signals.karma, '4321');
  assert.equal(vetted.signals.comment_count_sampled, '5');
  assert.equal(vetted.signals.account_age_days, String(3 * 365));
  assert.equal(vetted.signals.last_active, new Date((NOW - DAY) * 1000).toISOString().slice(0, 10));
});

// The shared verdict vocabulary.
test('verdicts only ever come from the shared vocabulary', () => {
  const allowed = new Set(['legit', 'unknown', 'promoter', 'spammer', 'throwaway']);
  const cases = [
    {}, { karma: 5000 }, { karma: 1 }, { comment_count_sampled: 0, recent_comment_excerpts: [] },
    { karma: null, about: '', comment_count_sampled: 0, recent_comment_excerpts: [] },
  ];
  for (const over of cases) assert.ok(allowed.has(verdictOf(over)));
});

// ---------------------------------------------------------------- cli

test('the three verbs are story, user and vet — there is no search', async () => {
  assert.deepEqual(hackernews.VERBS, ['story', 'user', 'vet']);
});

test('vet returns the name, verdict, signals and reason', async () => {
  const opts = await stub(userStub({ page: userPage({ karma: 4321 }) }));
  const payload = await hackernews.runCommand(['vet', 'someone', '--topic', 'demo'], opts);
  assert.deepEqual(Object.keys(payload).sort(), ['name', 'reason', 'signals', 'verdict']);
  assert.equal(payload.name, 'someone');
  assert.equal(payload.verdict, 'legit');
});

test('a run needs --topic, and an unknown verb is refused', async () => {
  const opts = await stub(userStub());
  await assert.rejects(() => hackernews.runCommand(['user', 'someone'], opts), /--topic/);
  await assert.rejects(() => hackernews.runCommand(['search', 'anything', '--topic', 'demo'], opts), /search/);
  assert.equal(hits.length, 0, 'nothing is fetched on a bad invocation');
});

test('cached json is written indented', async () => {
  const opts = await stub((req, res) => json(res, { id: 42, title: 't' }));
  await hackernews.fetchStory(42, opts);
  assert.match(readFileSync(join(dir, 'item-42.json'), 'utf8'), /\n {2}"/);
});
