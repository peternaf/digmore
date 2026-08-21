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
 * Stands in for both hosts. Algolia's paths (/search, /items/, /users/) and Firebase's
 * (/user/<name>.json, /item/<id>/dead.json) never collide, so one server answers both.
 * Tests call the exported functions in process, so there is no blocking child.
 */
async function stub(handler) {
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    hits.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
    handler(req, res, url);
  });
  await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { algoliaBase: base, firebaseBase: base, cacheDir: dir, now: NOW };
}

const json = (res, body, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

/** A Firebase profile, in the shape fetchUser reads. `submitted` is newest first. */
function firebaseProfile({ karma = 500, created = NOW - 3 * 365 * DAY, about = '', submitted = [] } = {}) {
  return { id: 'someone', karma, created, about, submitted };
}

function algoliaComments(texts, { nbHits, lastTs = NOW - 10 * DAY } = {}) {
  return {
    nbHits: nbHits ?? texts.length,
    hits: texts.map((comment_text, index) => ({
      comment_text,
      objectID: String(9000 + index),
      story_id: 500 + index,
      story_title: `thread ${index}`,
      created_at_i: lastTs - index * DAY,
    })),
  };
}

/** The vetting rules only read `text`; the rest of the shape is Enrichment's. */
const commentsOf = (...texts) => texts.map((text) => ({ id: null, story_id: null, story_title: null, created_utc: null, text }));

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
  assert.ok(existsSync(join(dir, 'hackernews-item-42.json')));
});

// The comment tree flattens at hackernews.commentDepth. Five, because the argument on a long
// HN chain usually resolves below three.
test('the comment tree flattens to the configured depth and no deeper', async () => {
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
  profile = firebaseProfile(),
  comments = algoliaComments(['hello']),
  stories = { nbHits: 7 },
  commentsMeta,
  dead = new Set(),
} = {}) {
  return (req, res, url) => {
    // /users/<name> is Algolia's fallback endpoint; /user/<name>.json is Firebase's profile.
    if (url.pathname.startsWith('/users/')) return json(res, { karma: 999, about: 'fallback bio' });
    if (url.pathname.startsWith('/user/')) return json(res, profile);
    // Firebase answers a single-field read with the value alone, or null when it is absent.
    const deadRead = /^\/item\/(\d+)\/dead\.json$/.exec(url.pathname);
    if (deadRead) return json(res, dead.has(Number(deadRead[1])) ? true : null);
    // search_by_date, newest first: the lifetime count and the true last-comment date.
    if (url.pathname === '/search_by_date') {
      return json(res, commentsMeta ?? { nbHits: comments.nbHits, hits: comments.hits.slice(0, 1) });
    }
    const tags = url.searchParams.get('tags') ?? '';
    if (tags.startsWith('story')) return json(res, stories);
    return json(res, comments);
  };
}

test('user merges the Firebase profile with Algolia and caches both payloads', async () => {
  const opts = await stub(
    userStub({
      profile: firebaseProfile({ karma: 4321, created: NOW - 3 * 365 * DAY, about: 'I work on https://mine.test' }),
      comments: algoliaComments(['one', 'two', 'three'], { nbHits: 812 }),
      stories: { nbHits: 7 },
    }),
  );

  const user = await hackernews.fetchUser('someone', opts);
  assert.equal(user.name, 'someone');
  assert.equal(user.karma, 4321, 'karma comes from the Firebase profile');
  assert.equal(user.created_utc, NOW - 3 * 365 * DAY, 'the only source of account age');
  assert.match(user.about, /mine\.test/);
  assert.equal(user.comment_count_sampled, 3);
  assert.deepEqual(user.recent_comments.map((comment) => comment.text), ['one', 'two', 'three']);
  assert.deepEqual(user.recent_comments[0], {
    id: 9000,
    story_id: 500,
    story_title: 'thread 0',
    created_utc: NOW - 10 * DAY,
    text: 'one',
  }, 'the thread a comment sits in travels with it, so Enrichment can reach it');
  assert.equal(user.stories_submitted, 7);
  assert.equal(user.comments_submitted, 812, 'the lifetime count, not the sampled count');
  assert.equal(user.last_activity_utc, NOW - 10 * DAY, 'the newest comment timestamp');

  assert.ok(existsSync(join(dir, 'hackernews-user-firebase-someone.json')));
  assert.ok(existsSync(join(dir, 'hackernews-user-comments-someone.json')));
});

// The account age used to come from an HTML page throttled to one request per 15 seconds,
// which made Hacker News the slowest source in a run. Nothing may reach that host again.
test('nothing is fetched from news.ycombinator.com', async () => {
  assert.equal(hackernews.HN_FIREBASE_BASE, 'https://hacker-news.firebaseio.com/v0');
  const source = readFileSync(new URL('../skill/scripts/hackernews.mjs', import.meta.url), 'utf8');
  assert.ok(!source.includes('news.ycombinator.com/user'), 'the user page is not fetched');
  assert.ok(!/getText/.test(source), 'no HTML is fetched at all');
});

test('a profile Firebase does not have is an empty user, not a crash', async () => {
  const opts = await stub(
    userStub({ profile: null, comments: { nbHits: 0, hits: [] }, commentsMeta: { nbHits: 0, hits: [] } }),
  );
  const user = await hackernews.fetchUser('nobody', opts);
  assert.equal(user.karma, null);
  assert.equal(user.created_utc, null);
  assert.equal(user.about, '');
  assert.equal(hackernews.vetUser(user, NOW).reason, 'missing-profile');
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

// The script used to slice each comment to 280 characters before storing it. Algolia returns
// the whole thing, so the cut cost nothing to keep and could not be undone without
// re-fetching — and Enrichment extracts from these bodies.
test('comments are stored in full, never truncated', async () => {
  const opts = await stub(userStub({ comments: algoliaComments(['x'.repeat(5000)]) }));
  const user = await hackernews.fetchUser('someone', opts);
  assert.equal(user.recent_comments[0].text.length, 5000);
});

test('at most 50 recent comments are asked for', async () => {
  const opts = await stub(userStub());
  await hackernews.fetchUser('someone', opts);
  assert.ok(hits.some((hit) => hit.query.hitsPerPage === '50'));
});

// ---------------------------------------------------------------- the dead sample

// `submitted` is newest first, so the sample is the most recent submissions and nothing is
// fetched to discover them. /item/<id>/dead.json answers true or null.
test('the dead sample reads the newest submissions and counts the dead ones', async () => {
  const opts = await stub(
    userStub({ profile: firebaseProfile({ submitted: [10, 11, 12, 13, 14, 15, 16] }), dead: new Set([10, 12]) }),
  );
  const user = await hackernews.fetchUser('someone', { ...opts, deadSampleSize: 5 });
  assert.equal(user.recent_posts_checked, 5, 'the sample is the ceiling, not every submission');
  assert.equal(user.recent_posts_dead, 2);
  const read = hits.filter((hit) => hit.path.endsWith('/dead.json')).map((hit) => hit.path);
  assert.deepEqual(read, [10, 11, 12, 13, 14].map((id) => `/item/${id}/dead.json`));
});

test('a sample size of zero turns the shadowban test off and fetches nothing', async () => {
  const opts = await stub(userStub({ profile: firebaseProfile({ submitted: [10, 11, 12] }), dead: new Set([10, 11, 12]) }));
  const user = await hackernews.fetchUser('someone', { ...opts, deadSampleSize: 0 });
  assert.equal(user.recent_posts_checked, 0);
  assert.equal(user.recent_posts_dead, 0);
  assert.ok(!hits.some((hit) => hit.path.endsWith('/dead.json')));
  assert.notEqual(hackernews.vetUser(user, NOW).verdict, 'throwaway', 'untested is not clean and not damning');
});

test('a handle with fewer submissions than the sample checks what there is', async () => {
  const opts = await stub(userStub({ profile: firebaseProfile({ submitted: [10, 11] }), dead: new Set([10, 11]) }));
  const user = await hackernews.fetchUser('someone', { ...opts, deadSampleSize: 5 });
  assert.equal(user.recent_posts_checked, 2);
  assert.equal(user.recent_posts_dead, 2);
  assert.notEqual(
    hackernews.vetUser(user, NOW).verdict,
    'throwaway',
    'two dead cannot reach the threshold, so a thin account is never condemned by it',
  );
});

// ---------------------------------------------------------------- degraded paths

// A Firebase failure falls back to Algolia /users/<name> for karma + bio, losing the
// account age and the dead sample with it. vet_user tolerates a missing age.
test('a failed Firebase profile falls back to Algolia and loses the age and the dead sample', async () => {
  const opts = await stub((req, res, url) => {
    if (url.pathname.startsWith('/user/')) return json(res, { error: 'boom' }, 500);
    return userStub()(req, res, url);
  });

  const user = await hackernews.fetchUser('someone', { ...opts, backoffDelays: [0, 0, 0] });
  assert.equal(user.karma, 999, 'karma from the Algolia fallback');
  assert.equal(user.about, 'fallback bio');
  assert.equal(user.created_utc, null, 'account age is unavailable on this path');
  assert.equal(user.recent_posts_checked, 0, 'no submitted list, so nothing to sample');
  assert.ok(existsSync(join(dir, 'hackernews-user-algolia-someone.json')));
  assert.ok(!existsSync(join(dir, 'hackernews-user-firebase-someone.json')));
});

test('a 429 is retried on the backoff schedule before falling back', async () => {
  let profileAttempts = 0;
  const opts = await stub((req, res, url) => {
    if (url.pathname.startsWith('/user/')) {
      profileAttempts += 1;
      return json(res, { error: 'rate limited' }, 429);
    }
    return userStub()(req, res, url);
  });
  await hackernews.fetchUser('someone', { ...opts, backoffDelays: [0, 0, 0] });
  assert.equal(profileAttempts, 4, 'immediate attempt plus three retries');
});

test('the default backoff schedule is the documented schedule', () => {
  assert.deepEqual(hackernews.BACKOFF_DELAYS, [5000, 15000, 45000]);
});

test('an Algolia failure is an error, not a silent empty user', async () => {
  const opts = await stub((req, res, url) => {
    if (url.pathname.startsWith('/user/')) return json(res, firebaseProfile());
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
  recent_comments: commentsOf('a', 'b', 'c', 'd', 'e'),
  last_activity_utc: NOW - DAY,
  recent_posts_checked: 5,
  recent_posts_dead: 0,
  ...over,
});

const verdictOf = (over) => hackernews.vetUser(baseUser(over), NOW).verdict;

test('a profile that could not be read is unknown, not throwaway', () => {
  const vetted = hackernews.vetUser(
    baseUser({ karma: null, about: '', comment_count_sampled: 0, recent_comments: [] }),
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
    baseUser({ comment_count_sampled: 0, recent_comments: [], karma: 300 }),
    NOW,
  );
  assert.equal(vetted.verdict, 'unknown');
  assert.equal(vetted.reason, 'submitter-only');
});

// Algolia 404s a dead item, so this is the only way the run can see a shadowban at all.
// It is checked before the host counts, because nobody reads a shadowbanned account's
// comments and there is no point weighing them for promotion.
test('an account whose recent posts are mostly dead is shadowbanned', () => {
  const vetted = hackernews.vetUser(
    baseUser({ recent_posts_checked: 5, recent_posts_dead: 3, karma: 5000, created_utc: NOW - 5 * 365 * DAY }),
    NOW,
  );
  assert.equal(vetted.verdict, 'throwaway', 'it beats the karma>1000 legit rule');
  assert.equal(vetted.reason, 'shadowbanned');
  assert.equal(vetted.signals.recent_posts_dead, '3/5');
});

// One flagged comment is the noise floor on a healthy account — measured at one in
// nineteen known-good handles.
test('a couple of dead posts is a flagged comment, not a shadowban', () => {
  assert.equal(verdictOf({ recent_posts_checked: 5, recent_posts_dead: 2, karma: 5000 }), 'legit');
  assert.equal(verdictOf({ recent_posts_checked: 5, recent_posts_dead: 1, karma: 5000 }), 'legit');
});

test('an untested handle carries no dead signal at all', () => {
  const vetted = hackernews.vetUser(baseUser({ recent_posts_checked: 0, recent_posts_dead: 0 }), NOW);
  assert.equal(vetted.signals.recent_posts_dead, undefined, 'silence, not a clean bill of health');
});

test('a bio host repeated three times in comments is a promoter', () => {
  const vetted = hackernews.vetUser(
    baseUser({
      about: 'founder of https://mine.test',
      recent_comments: commentsOf('see https://mine.test/a', 'https://mine.test/b', 'and https://mine.test/c'),
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
      recent_comments: commentsOf('https://mine.test/a', 'https://mine.test/b'),
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
        recent_comments: commentsOf(...Array.from({ length: 8 }, (_, index) => `https://${host}/item?id=${index}`)),
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
      recent_comments: commentsOf(...Array.from({ length: 5 }, (_, index) => `buy at https://spam.test/${index}`)),
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
      recent_comments: commentsOf(...Array.from({ length: 4 }, (_, index) => `https://spam.test/${index}`)),
      karma: 5000,
    }),
    'legit',
  );
});

test('www. is stripped so the same host is counted once', () => {
  const vetted = hackernews.vetUser(
    baseUser({
      about: '',
      recent_comments: commentsOf(
        'https://www.spam.test/1',
        'https://spam.test/2',
        'https://www.spam.test/3',
        'https://spam.test/4',
        'https://www.spam.test/5',
      ),
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
    {}, { karma: 5000 }, { karma: 1 }, { comment_count_sampled: 0, recent_comments: [] },
    { karma: null, about: '', comment_count_sampled: 0, recent_comments: [] },
  ];
  for (const over of cases) assert.ok(allowed.has(verdictOf(over)));
});

// ---------------------------------------------------------------- cli

test('the three verbs are story, user and vet — there is no search', async () => {
  assert.deepEqual(hackernews.VERBS, ['story', 'user', 'vet']);
});

test('vet returns the name, verdict, signals and reason', async () => {
  const opts = await stub(userStub({ profile: firebaseProfile({ karma: 4321 }) }));
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
  assert.match(readFileSync(join(dir, 'hackernews-item-42.json'), 'utf8'), /\n {2}"/);
});
