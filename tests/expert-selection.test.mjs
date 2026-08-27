import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox } from './helpers.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

const topicDir = () => join(sandbox.cwd, 'digmore', 'demo');

function writeRoster(source, handles) {
  const dir = join(topicDir(), 'full_source_analysis');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${source}-handles.json`), JSON.stringify({ source, handles }));
}

function writeList(branch, results) {
  const dir = join(topicDir(), 'cache', '_returns');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `branch-searcher-${branch}.json`),
    JSON.stringify({ results, droppedCount: 0, lowestSurvivingScore: 0.5 }),
  );
}

function writeCached(source, filename) {
  const dir = join(topicDir(), 'cache', source);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), '{}');
}

const legit = (handle, relevance = 'high') => ({
  handle,
  topImportance: 'central',
  claimCount: 2,
  documentCount: 2,
  documents: ['x'],
  verdict: 'legit',
  topicalRelevance: relevance,
});

const es = (...args) => sandbox.run('expert_selection.mjs', ...args);

// ---------------------------------------------------------------- select

test('only legit and on-topic handles are followed', async () => {
  writeRoster('reddit', [
    legit('u/a'),
    { ...legit('u/unknown'), verdict: 'unknown' },
    { ...legit('u/offtopic'), topicalRelevance: undefined },
    { ...legit('u/promo'), verdict: 'promoter' },
  ]);
  const { code, json } = await es('select', '--topic', 'demo');
  assert.equal(code, 0);
  assert.deepEqual(json.experts.map((expert) => expert.handle), ['u/a']);
});

// One busy source must not spend the whole budget, so the first from each roster comes before
// the second from any of them.
test('the budget round-robins across sources rather than draining one', async () => {
  writeRoster('reddit', [legit('u/a'), legit('u/b'), legit('u/c')]);
  writeRoster('hackernews', [legit('hn/d'), legit('hn/e')]);

  const { json } = await es('select', '--topic', 'demo', '--budget', '4');
  assert.deepEqual(json.experts.map((expert) => expert.handle), ['u/a', 'hn/d', 'u/b', 'hn/e']);
});

test('the roster order is the ranking, and is not re-sorted', async () => {
  writeRoster('reddit', [legit('u/first'), legit('u/second')]);
  const { json } = await es('select', '--topic', 'demo', '--budget', '2');
  assert.deepEqual(json.experts.map((expert) => expert.handle), ['u/first', 'u/second']);
});

// A model round-robining four lists by hand returns a different ten on a re-run, and this decides
// which experts the run follows.
test('the same inputs give the same experts every time', async () => {
  writeRoster('reddit', [legit('u/a'), legit('u/b')]);
  writeRoster('twitter', [legit('x/c')]);
  const first = await es('select', '--topic', 'demo', '--budget', '2');
  const second = await es('select', '--topic', 'demo', '--budget', '2');
  assert.deepEqual(first.json.experts, second.json.experts);
});

test('each expert carries the path to its own vetting cache', async () => {
  writeRoster('hackernews', [legit('hn/dave')]);
  const { json } = await es('select', '--topic', 'demo');
  assert.equal(json.experts[0].vettingCache, 'cache/hackernews/hackernews-vet-dave.json');
  assert.equal(json.experts[0].branch, 'expert-hn_dave');
});

test('a source with no roster is named rather than silently absent', async () => {
  writeRoster('reddit', [legit('u/a')]);
  const { json } = await es('select', '--topic', 'demo');
  assert.deepEqual(json.sourcesRead, ['reddit']);
  assert.deepEqual(json.sourcesMissing, ['hackernews', 'twitter', 'forums']);
});

test('more eligible experts than budget stops at the budget, and says how many there were', async () => {
  writeRoster('reddit', [legit('u/a'), legit('u/b'), legit('u/c')]);
  const { json } = await es('select', '--topic', 'demo', '--budget', '2');
  assert.equal(json.experts.length, 2);
  assert.equal(json.eligible, 3);
});

// ---------------------------------------------------------------- dedupe

test('a URL Extract already read is dropped entirely, not merely deduplicated', async () => {
  writeRoster('reddit', [legit('u/a')]);
  writeCached('reddit', 'reddit-thread-abc123.json');
  writeList('expert-u_a', [
    { url: 'https://www.reddit.com/r/x/comments/abc123/title/', title: 'read', relevance: 0.9 },
    { url: 'https://example.com/fresh', title: 'fresh', relevance: 0.8 },
  ]);

  const { json } = await es('dedupe', '--topic', 'demo');
  assert.equal(json.alreadyRead, 1);
  assert.deepEqual(json.toRead.map((page) => page.url), ['https://example.com/fresh']);
});

// fetch.mjs chooses the extension from the response, so the stem is what matches.
test('a page fetch.mjs already wrote is matched through its extension', async () => {
  writeRoster('forums', [legit('someone')]);
  writeCached('forums', 'example.com_thread_12.md');
  writeList('expert-someone', [{ url: 'https://example.com/thread/12', title: 't', relevance: 0.9 }]);

  const { json } = await es('dedupe', '--topic', 'demo');
  assert.equal(json.alreadyRead, 1);
  assert.deepEqual(json.toRead, []);
});

test('one URL two experts found is read once, charged to the first in select order', async () => {
  writeRoster('reddit', [legit('u/a'), legit('u/b')]);
  writeList('expert-u_a', [{ url: 'https://example.com/shared', title: 's', relevance: 0.5 }]);
  writeList('expert-u_b', [{ url: 'https://example.com/shared?utm_source=x', title: 's', relevance: 0.99 }]);

  const { json } = await es('dedupe', '--topic', 'demo');
  assert.equal(json.duplicates, 1);
  assert.equal(json.toRead.length, 1);
  assert.equal(json.toRead[0].handle, 'u/a', 'round-robin order breaks the tie, never relevance');
});

test('an expert whose searcher wrote no list is named, not counted as empty', async () => {
  writeRoster('reddit', [legit('u/a'), legit('u/b')]);
  writeList('expert-u_a', [{ url: 'https://example.com/one', title: 'o', relevance: 0.5 }]);

  const { json } = await es('dedupe', '--topic', 'demo');
  assert.deepEqual(json.listsMissing, ['u/b']);
  assert.equal(json.toRead.length, 1);
});

test('the handles/ subdirectory is not mistaken for a read page', async () => {
  writeRoster('reddit', [legit('u/a')]);
  mkdirSync(join(topicDir(), 'cache', 'reddit', 'handles'), { recursive: true });
  writeList('expert-u_a', [{ url: 'https://example.com/handles', title: 'h', relevance: 0.5 }]);

  const { json } = await es('dedupe', '--topic', 'demo');
  assert.equal(json.alreadyRead, 0);
  assert.equal(json.toRead.length, 1);
});

// ---------------------------------------------------------------- cli

test('an unknown verb names the two', async () => {
  const { code, err } = await es('follow', '--topic', 'demo');
  assert.equal(code, 1);
  assert.match(err, /select or dedupe/);
});

test('the topic is required', async () => {
  const { code, err } = await es('select');
  assert.equal(code, 1);
  assert.match(err, /--topic/);
});
