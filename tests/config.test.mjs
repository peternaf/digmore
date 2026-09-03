import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(repoRoot, 'skill', 'scripts', 'config.mjs');
const POSIX = process.platform !== 'win32';

/** Every top-level key the file carries. Grouped by where each configuration applies. */
const TOP_LEVEL_KEYS = [
  'apiBaseUrl', 'apiDeclined', 'apiKey', 'audit',
  'enrich', 'extract', 'fast', 'forums', 'hackernews', 'plan', 'reddit', 'subagents', 'twitter', 'vet',
];

let home;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'digmore-config-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** Run config.mjs as the skill runs it — through Bash, with argv. */
function run(...args) {
  const result = spawnSync(process.execPath, [CONFIG, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const settingsPath = () => join(home, '.digmore', 'settings.json');
const settings = () => JSON.parse(readFileSync(settingsPath(), 'utf8'));

function writeSettings(text) {
  mkdirSync(join(home, '.digmore'), { recursive: true });
  writeFileSync(settingsPath(), text);
}

// ~/.digmore/settings.json, created on first run, mode 0600.
test('creates the file on first run with every parameter present', () => {
  const { code } = run('show');
  assert.equal(code, 0);
  const written = settings();
  assert.deepEqual(Object.keys(written).sort(), TOP_LEVEL_KEYS);
  assert.equal(written.apiBaseUrl, 'https://api.digmore.ai');
  assert.equal(written.apiKey, null);
  assert.equal(written.apiDeclined, false);
});

// Every configuration is written out, in both modes, so a user can see and change one without
// having to know it exists. A file listing only the reductions would hide most of them.
test('the fast block lists every configuration group, not only the ones it reduces', () => {
  run('show');
  const { plan, extract, vet, enrich, reddit, twitter, hackernews, subagents, fast } = settings();
  assert.deepEqual(Object.keys(fast).sort(),
    ['audit', 'enrich', 'extract', 'forums', 'hackernews', 'plan', 'reddit', 'subagents', 'twitter', 'vet']);
  assert.equal(plan.maxAngles, 6);
  assert.equal(extract.fetchesPerBranch, 10);
  assert.equal(extract.maxPagesPerDocument, 5);
  assert.equal(extract.urlsPerDispatch, 10);
  assert.equal(extract.observationsPerDispatch, 6);
  assert.equal(vet.handleCapPerSource, 20);
  assert.equal(vet.handlesPerDispatch, 10);
  assert.equal(twitter.handlesPerDispatch, 5, 'Twitter batches smaller — a deep vet reads its posts');
  assert.equal(enrich.expertsFollowed, 5);
  assert.equal(enrich.urlsPerExpert, 10);
  assert.equal(enrich.minPlayerDocuments, 5);
  assert.equal(twitter.handlesDeepVetted, 10);
  assert.equal(twitter.postsPerDeepVet, 50);
  assert.equal(hackernews.commentDepth, 5);
  assert.equal(hackernews.deadSampleSize, 5);
  assert.equal(subagents.repairAttempts, 1);
  assert.equal(fast.extract.fetchesPerBranch, 5);
  assert.equal(fast.enrich.expertsFollowed, 0);
  assert.equal(fast.enrich.urlsPerExpert, 3);
  assert.equal(fast.enrich.minPlayerDocuments, 2,
    'a floor, not a budget — the lower fast value admits more players, not fewer');
  assert.equal(fast.twitter.handlesDeepVetted, 0, 'zero means the step is skipped');
  assert.equal(fast.hackernews.commentDepth, 5, 'unchanged in fast, but still listed');
  // The one bound a source's own script enforces rather than an agent obeying in prose.
  assert.equal(reddit.searchesPerBranch, 5);
  assert.equal(fast.reddit.searchesPerBranch, 3);
});

// A batch size is how many items one sub-agent works through in sequence, and fast mode already
// cuts how many items there are. Reducing it as well would raise the dispatch count in the mode
// that exists to lower it, so both stay out of the reductions.
test('every batch size is the same in both modes', () => {
  run('show');
  const { extract, vet, twitter, fast } = settings();
  assert.equal(fast.extract.urlsPerDispatch, extract.urlsPerDispatch);
  // Fast already gives each source less material to observe, and the agent has read all of it
  // either way; writing six lines instead of three costs nothing it has not already paid.
  assert.equal(fast.extract.observationsPerDispatch, extract.observationsPerDispatch);
  assert.equal(fast.vet.handlesPerDispatch, vet.handlesPerDispatch);
  // Twitter keeps its lower batch even in fast, where handlesDeepVetted is 0 and no posts are
  // read — a second conditional to win back a handful of dispatches is not worth the branch.
  assert.equal(fast.twitter.handlesPerDispatch, twitter.handlesPerDispatch);
});

// Zero is not a real instruction for either: it would not skip a step, it would mean an agent
// is handed no work at all. So it falls back to the default like any other invalid value, which
// is what gives both a floor of 1.
test('a batch size of zero falls back to its default', () => {
  writeSettings(JSON.stringify({
    extract: { urlsPerDispatch: 0 }, vet: { handlesPerDispatch: 0 }, twitter: { handlesPerDispatch: 0 },
  }));
  run('show');
  assert.equal(settings().extract.urlsPerDispatch, 10);
  assert.equal(settings().vet.handlesPerDispatch, 10);
  assert.equal(settings().twitter.handlesPerDispatch, 5);
});

// The group is named for the phase that spends it, and two phases spend nothing: every rendered
// claim is fact-checked, so there is no checked subset to size and nothing is flagged for the
// user to chase. A `synthesize` group reappearing here means one of those caps came back.
// Synthesize still has none. Audit has one, and it is a batch size rather than a depth: it sizes
// the range one Claim Fact Checker is handed, never how many paragraphs are checked. Every rendered
// claim is checked in both modes, so there is still no checked subset to configure.
test('there is no synthesize group, and audit has only a batch size', () => {
  run('show');
  const written = settings();
  assert.ok(!('synthesize' in written), 'its two survivors were renamed to enrich.*');
  assert.ok(!('synthesize' in written.fast));
  assert.deepEqual(Object.keys(written.audit), ['paragraphsPerDispatch']);
  assert.equal(written.fast.audit.paragraphsPerDispatch, written.audit.paragraphsPerDispatch,
    'a batch size never reduces in fast mode');
});

test('the file is created 0600', { skip: !POSIX && 'POSIX modes only' }, () => {
  run('show');
  assert.equal(statSync(settingsPath()).mode & 0o777, 0o600);
});

test('a complete file is not rewritten — the same read twice changes nothing', () => {
  run('show');
  const before = readFileSync(settingsPath(), 'utf8');
  run('show');
  assert.equal(readFileSync(settingsPath(), 'utf8'), before);
});

// A file written by an earlier version is missing whatever was added since. Completing it
// on read is what makes a new configuration visible to someone who installed before it existed:
// filling the gap only in memory would leave the knob undiscoverable forever.
test('a file from an older version gains the new parameters, keeping what the user set', () => {
  writeSettings(JSON.stringify({ apiKey: 'sk-kept', vet: { handleCapPerSource: 7 } }));
  run('show');
  const healed = settings();
  assert.equal(healed.apiKey, 'sk-kept', 'the key survives');
  assert.equal(healed.vet.handleCapPerSource, 7, 'a tuned configuration survives');
  assert.equal(healed.extract.fetchesPerBranch, 10, 'a missing configuration is filled in');
  assert.ok('fast' in healed, 'and so is the whole fast block');
});

test('an unknown key is dropped rather than left to look meaningful', () => {
  writeSettings(JSON.stringify({ apiKey: 'sk-kept', nonsenseSetting: 42 }));
  run('show');
  assert.ok(!('nonsenseSetting' in settings()), 'a typo disappears instead of being silently ignored');
  assert.equal(settings().apiKey, 'sk-kept');
});

// config.mjs owns both writes.
test('decline sets apiDeclined true', () => {
  const { code } = run('decline');
  assert.equal(code, 0);
  assert.equal(settings().apiDeclined, true);
  assert.equal(settings().apiKey, null);
});

test('set-key sets the key and clears apiDeclined', () => {
  run('decline');
  const { code } = run('set-key', 'sk-test-123');
  assert.equal(code, 0);
  assert.equal(settings().apiKey, 'sk-test-123');
  assert.equal(settings().apiDeclined, false, 'a key present with apiDeclined true cannot occur');
});

test('set-key preserves a customised apiBaseUrl', () => {
  writeSettings(JSON.stringify({ apiBaseUrl: 'https://not-the-default.example.test', apiKey: null, apiDeclined: false }));
  run('set-key', 'sk-test-123');
  assert.equal(settings().apiBaseUrl, 'https://not-the-default.example.test');
});

test('neither write ever adds a field beyond the known set', () => {
  run('decline');
  run('set-key', 'sk-test-123');
  assert.deepEqual(Object.keys(settings()).sort(), TOP_LEVEL_KEYS);
});

// Found running against the real API: PowerShell's `-Encoding utf8` writes a BOM, and
// so do Notepad and plenty of editors. JSON.parse rejects it, so a hand-edited config
// read as MALFORMED with nothing on screen to explain why.
test('a UTF-8 BOM does not make the file unreadable', () => {
  writeSettings(`﻿${JSON.stringify({ apiBaseUrl: 'https://api.digmore.ai', apiKey: 'sk-abc', apiDeclined: false })}`);
  const { code, out } = run('show');
  assert.equal(code, 0, 'a BOM is not a malformed file');
  assert.equal(JSON.parse(out).apiKeyConfigured, true);
});

test('a BOM survives a write, rather than being doubled or lost', () => {
  writeSettings(`﻿${JSON.stringify({ apiBaseUrl: 'https://not-the-default.example.test', apiKey: null, apiDeclined: false })}`);
  assert.equal(run('set-key', 'sk-new').code, 0);
  const raw = readFileSync(settingsPath(), 'utf8');
  assert.ok(!raw.includes('﻿'), 'rewritten without one');
  assert.equal(settings().apiKey, 'sk-new');
  assert.equal(settings().apiBaseUrl, 'https://not-the-default.example.test', 'the rest of the file survived');
});

// A malformed file is reported, never overwritten.
test('a malformed file is reported and left byte-identical', () => {
  const broken = '{ this is not json';
  writeSettings(broken);
  const { code, err } = run('show');
  assert.notEqual(code, 0, 'a malformed file is an error for config.mjs itself');
  assert.equal(readFileSync(settingsPath(), 'utf8'), broken, 'the file must not be touched');
  assert.match(err, /settings\.json/, 'the error names the path');
});

test('set-key refuses to write over a malformed file', () => {
  const broken = 'nonsense';
  writeSettings(broken);
  const { code } = run('set-key', 'sk-test-123');
  assert.notEqual(code, 0);
  assert.equal(readFileSync(settingsPath(), 'utf8'), broken);
});

// The key is a secret; it must not be echoed into the session transcript.
test('no verb ever prints the api key', () => {
  const afterSet = run('set-key', 'sk-secret-value');
  const afterShow = run('show');
  for (const result of [afterSet, afterShow]) {
    assert.ok(!result.out.includes('sk-secret-value'), 'stdout must not carry the key');
    assert.ok(!result.err.includes('sk-secret-value'), 'stderr must not carry the key');
  }
});

test('show reports whether a key is configured, without the key', () => {
  run('set-key', 'sk-secret-value');
  const { out } = run('show');
  const report = JSON.parse(out);
  assert.equal(report.apiKeyConfigured, true);
  assert.equal(report.apiDeclined, false);
  assert.equal(report.apiBaseUrl, 'https://api.digmore.ai');
});

test('set-key with no value is an error and writes nothing', () => {
  const { code } = run('set-key');
  assert.notEqual(code, 0);
  assert.ok(!existsSync(settingsPath()), 'a bad invocation must not create the file');
});

test('an unknown verb is an error', () => {
  const { code, err } = run('frobnicate');
  assert.notEqual(code, 0);
  assert.ok(err.length > 0, 'errors go to stderr');
});

// ---------------------------------------------------------------- run configurations
//
// Every number that bounds a run lives here rather than in brain prose, because prose is
// obeyed on trust: two real runs on 2026-08-17 applied 20 and 8 for the same cap with
// nothing flagging the difference. Grouped by where each applies — the phase for a
// phase-wide one, the source for a source-specific one.

test('the configurations default as documented', () => {
  run('show');
  const config = settings();
  assert.equal(config.extract.fetchesPerBranch, 10);
  assert.equal(config.vet.handleCapPerSource, 20);
  // Three, not ten: the user waits on this step before any other work in the run begins, and ten
  // sequential searches put Plan over a minute before it had anything to show.
  assert.equal(config.plan.scopingSearches, 3);
  assert.equal(config.enrich.urlsPerExpert, 10);
});

test('a user-set configuration survives a read', () => {
  writeSettings(JSON.stringify({ extract: { fetchesPerBranch: 8 }, vet: { handleCapPerSource: 200 } }));
  const { code, out } = run('show');
  assert.equal(code, 0);
  assert.equal(JSON.parse(out).extract.fetchesPerBranch, 8);
  assert.equal(JSON.parse(out).vet.handleCapPerSource, 200);
});

test('a user-set configuration survives a write', () => {
  writeSettings(JSON.stringify({ extract: { fetchesPerBranch: 8 }, vet: { handleCapPerSource: 200 } }));
  run('set-key', 'sk-test-123');
  assert.equal(settings().extract.fetchesPerBranch, 8, 'setting a key does not reset the configurations');
  assert.equal(settings().vet.handleCapPerSource, 200);
});

test('show reports the configurations, so a run can read them without the key', () => {
  const { out } = run('show');
  const reported = JSON.parse(out);
  assert.equal(reported.extract.fetchesPerBranch, 10);
  assert.equal(reported.vet.handleCapPerSource, 20);
  assert.ok(!('apiKey' in reported), 'the key itself is still never printed');
});

// A configuration of zero, a negative, or a string would stop a run doing any work at all while
// looking configured. The default is safer than honouring it — and the file is corrected,
// so it never says one number on disk while the run uses another.
for (const bad of [0, -5, '20', 1.5, null]) {
  test(`a configuration of ${JSON.stringify(bad)} reads back as the default`, () => {
    writeSettings(JSON.stringify({ extract: { fetchesPerBranch: bad }, vet: { handleCapPerSource: bad } }));
    const { code, out } = run('show');
    assert.equal(code, 0, 'a bad configuration is not a malformed file');
    assert.equal(JSON.parse(out).extract.fetchesPerBranch, 10);
    assert.equal(JSON.parse(out).vet.handleCapPerSource, 20);
    assert.equal(settings().extract.fetchesPerBranch, 10, 'and the file is corrected to match');
  });
}

// Zero is a real instruction for the configurations that can be switched off, and must not be
// treated as the mistake it would be elsewhere.
test('zero is honoured where it means "skip this step"', () => {
  writeSettings(
    JSON.stringify({
      twitter: { handlesDeepVetted: 0 },
      subagents: { repairAttempts: 0 },
      hackernews: { deadSampleSize: 0 },
    }),
  );
  const { out } = run('show');
  assert.equal(JSON.parse(out).twitter.handlesDeepVetted, 0);
  assert.equal(JSON.parse(out).subagents.repairAttempts, 0);
  assert.equal(JSON.parse(out).hackernews.deadSampleSize, 0, 'the shadowban test can be switched off');
});
