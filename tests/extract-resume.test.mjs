import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox } from './helpers.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

const topicDir = () => join(sandbox.cwd, 'digmore', 'demo');
const returnsDir = () => join(topicDir(), 'cache', '_returns');

function writeBranch(branch, results) {
  mkdirSync(returnsDir(), { recursive: true });
  writeFileSync(
    join(returnsDir(), `branch-searcher-${branch}.json`),
    JSON.stringify({ results, droppedCount: 0, lowestSurvivingScore: 0.5 }),
  );
}

function writeReceipts(label, receipts) {
  mkdirSync(returnsDir(), { recursive: true });
  writeFileSync(join(returnsDir(), `page-analyst-${label}.json`), JSON.stringify(receipts));
}

function writePlan(history) {
  mkdirSync(topicDir(), { recursive: true });
  writeFileSync(join(topicDir(), 'research_plan.json'), JSON.stringify({ run_history: history }));
}

const found = (url, relevance = 0.8) => ({ url, title: url, relevance });
const read = (url, pagesRead = 1) => ({ url, outcome: 'ok', claimCount: 2, pagesRead, fetchedWith: 'fetch.mjs' });

const resume = (...args) => sandbox.run('extract_resume.mjs', ...args);
const branchNamed = (json, name) => json.branches.find((row) => row.branch === name);

// ---------------------------------------------------------------- the tally

test('a branch with no receipts has everything left to read', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1'), found('https://a.test/2')]);
  const { code, json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.equal(code, 0);
  const branch = branchNamed(json, 'pricing-reddit');
  assert.equal(branch.pagesRead, 0);
  assert.equal(branch.urlsRead, 0);
  assert.equal(branch.state, 'outstanding');
  assert.deepEqual(branch.remaining, ['https://a.test/1', 'https://a.test/2']);
});

test('pages are totalled, not URLs — a paginated document spends its whole depth', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1'), found('https://a.test/2')]);
  writeReceipts('pricing-reddit-b1', [read('https://a.test/1', 5)]);
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  const branch = branchNamed(json, 'pricing-reddit');
  assert.equal(branch.pagesRead, 5, 'one URL, five pages');
  assert.equal(branch.urlsRead, 1);
  assert.equal(branch.budgetLeft, 5);
});

test('receipts are matched by URL, whatever the batch file is called', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  // A label that no regex could turn back into the branch name.
  writeReceipts('repair-pass-7', [read('https://a.test/1')]);
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.equal(branchNamed(json, 'pricing-reddit').urlsRead, 1);
  assert.deepEqual(json.orphanReceipts, [], 'and it is not reported as belonging to nobody');
});

test('a URL is matched through its fragment, its trailing slash and an http/https switch', async () => {
  writeBranch('pricing-reddit', [found('http://a.test/one/'), found('https://a.test/two')]);
  writeReceipts('b1', [read('https://a.test/one'), read('https://a.test/two#comments')]);
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.deepEqual(branchNamed(json, 'pricing-reddit').remaining, []);
});

// ---------------------------------------------------------------- the three states

test('a branch that spent its budget is capped, even with URLs left', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1'), found('https://a.test/2')]);
  writeReceipts('b1', [read('https://a.test/1', 10)]);
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  const branch = branchNamed(json, 'pricing-reddit');
  assert.equal(branch.state, 'capped');
  assert.equal(branch.budgetLeft, 0);
  assert.equal(json.outstanding, 0, 'a capped branch is not work');
  assert.equal(json.urlsLeft, 0, 'and its unread URLs are not counted as work either');
});

test('a branch that read everything it found while under the cap is exhausted, not capped', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  writeReceipts('b1', [read('https://a.test/1')]);
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  const branch = branchNamed(json, 'pricing-reddit');
  assert.equal(branch.state, 'exhausted', 'it ran out of material, not budget');
  assert.equal(branch.budgetLeft, 9);
});

test('overspending past the cap does not produce a negative budget', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1'), found('https://a.test/2')]);
  writeReceipts('b1', [read('https://a.test/1', 14)]);
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.equal(branchNamed(json, 'pricing-reddit').budgetLeft, 0);
});

test('branches are independent — one capped does not stop another', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  writeBranch('complaints-reddit', [found('https://b.test/1'), found('https://b.test/2')]);
  writeReceipts('b1', [read('https://a.test/1', 10), read('https://b.test/1')]);
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.equal(branchNamed(json, 'pricing-reddit').state, 'capped');
  assert.equal(branchNamed(json, 'complaints-reddit').state, 'outstanding');
  assert.equal(json.outstanding, 1);
  assert.equal(json.urlsLeft, 1);
});

// ---------------------------------------------------------------- the dedupe rule

test('a URL two branches found is charged to the one that scored it highest', async () => {
  writeBranch('pricing-reddit', [found('https://shared.test/1', 0.9)]);
  writeBranch('complaints-reddit', [found('https://shared.test/1', 0.4)]);
  writeReceipts('b1', [read('https://shared.test/1', 3)]);
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.equal(branchNamed(json, 'pricing-reddit').pagesRead, 3);
  assert.equal(branchNamed(json, 'complaints-reddit').pagesRead, 0, 'never charged twice');
  assert.equal(branchNamed(json, 'complaints-reddit').urlsTotal, 0);
});

test('a tie goes to the branch that sorts first, so two runs agree', async () => {
  writeBranch('zulu-reddit', [found('https://shared.test/1', 0.5)]);
  writeBranch('alpha-reddit', [found('https://shared.test/1', 0.5)]);
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.equal(branchNamed(json, 'alpha-reddit').urlsTotal, 1);
  assert.equal(branchNamed(json, 'zulu-reddit').urlsTotal, 0);
});

// ---------------------------------------------------------------- which cap applies

test('the cap comes from the interrupted run’s own recorded configuration', async () => {
  writePlan([{ ts: '2026-06-10T00:00:00Z', configurations: { extract: { fetchesPerBranch: 20 } } }]);
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  writeReceipts('b1', [read('https://a.test/1', 14)]);
  const { json } = await resume('worklist', '--topic', 'demo');

  assert.equal(json.cap, 20, 'not the current default');
  assert.equal(json.capSource, 'run_history');
  assert.equal(branchNamed(json, 'pricing-reddit').budgetLeft, 6, 'and the branch is not over budget');
});

test('the latest recorded configuration wins, not the first', async () => {
  writePlan([
    { ts: '2026-06-10T00:00:00Z', configurations: { extract: { fetchesPerBranch: 20 } } },
    { ts: '2026-06-12T00:00:00Z', configurations: { extract: { fetchesPerBranch: 5 } } },
  ]);
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  const { json } = await resume('worklist', '--topic', 'demo');

  assert.equal(json.cap, 5);
});

test('a history entry with no extract group falls back to the one before it', async () => {
  writePlan([
    { ts: '2026-06-10T00:00:00Z', configurations: { extract: { fetchesPerBranch: 20 } } },
    { ts: '2026-06-12T00:00:00Z', configurations: { vet: { handleCapPerSource: 50 } } },
  ]);
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  const { json } = await resume('worklist', '--topic', 'demo');

  assert.equal(json.cap, 20, 'a group the run never reached is not a cap of zero');
});

test('a topic predating the field falls back to the configured settings', async () => {
  writePlan([{ ts: '2026-06-10T00:00:00Z' }]);
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  const { json } = await resume('worklist', '--topic', 'demo');

  assert.equal(json.capSource, 'settings');
  assert.equal(json.cap, 10, 'which is the documented default');
});

test('no research_plan.json at all is still answerable', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  const { code, json } = await resume('worklist', '--topic', 'demo');

  assert.equal(code, 0);
  assert.equal(json.capSource, 'settings');
});

// ---------------------------------------------------------------- what it refuses to guess

test('a receipt for a URL no branch lists is reported, never charged to anyone', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  writeReceipts('b1', [read('https://a.test/1'), read('https://gone.test/9')]);
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.equal(branchNamed(json, 'pricing-reddit').pagesRead, 1);
  assert.deepEqual(json.orphanReceipts, ['https://gone.test/9']);
});

test('a malformed return is named rather than read as an empty one', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  mkdirSync(returnsDir(), { recursive: true });
  writeFileSync(join(returnsDir(), 'page-analyst-broken.json'), '{ not json');
  writeFileSync(join(returnsDir(), 'branch-searcher-torn.json'), '{ not json');
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.deepEqual(json.unreadable.sort(), ['branch-searcher-torn.json', 'page-analyst-broken.json']);
});

test('one URL read twice counts its pages once', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  writeReceipts('b1', [read('https://a.test/1', 4)]);
  writeReceipts('b2-retry', [read('https://a.test/1', 4)]);
  const { json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.equal(branchNamed(json, 'pricing-reddit').pagesRead, 4);
});

test('an absent _returns directory is an empty run, not a crash', async () => {
  mkdirSync(topicDir(), { recursive: true });
  const { code, json } = await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.equal(code, 0);
  assert.deepEqual(json.branches, []);
  assert.equal(json.urlsLeft, 0);
});

// ---------------------------------------------------------------- cli

test('the topic is required', async () => {
  const { code, err } = await resume('worklist');
  assert.equal(code, 1);
  assert.match(err, /--topic/);
});

test('an unknown verb names the one that exists', async () => {
  const { code, err } = await resume('tally', '--topic', 'demo');
  assert.equal(code, 1);
  assert.match(err, /worklist/);
});

test('it writes nothing — the work list is held, not stored', async () => {
  writeBranch('pricing-reddit', [found('https://a.test/1')]);
  const before = readdirSync(returnsDir()).sort();
  await resume('worklist', '--topic', 'demo', '--cap', '10');

  assert.deepEqual(readdirSync(returnsDir()).sort(), before, 'no file appears beside the returns');
  assert.equal(existsSync(join(topicDir(), 'cache', '_misc')), false, 'and none in the scratch directory');
});
