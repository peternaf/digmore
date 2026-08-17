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
test('creates the file on first run with the five default fields', () => {
  const { code } = run('show');
  assert.equal(code, 0);
  assert.deepEqual(settings(), {
    apiBaseUrl: 'https://api.digmore.ai',
    apiKey: null,
    apiDeclined: false,
    fetchesPerBranch: 20,
    vetHandleCap: 50,
  });
});

test('the file has exactly five fields and no more', () => {
  run('show');
  assert.deepEqual(Object.keys(settings()).sort(), ['apiBaseUrl', 'apiDeclined', 'apiKey', 'fetchesPerBranch', 'vetHandleCap']);
});

test('the file is created 0600', { skip: !POSIX && 'POSIX modes only' }, () => {
  run('show');
  assert.equal(statSync(settingsPath()).mode & 0o777, 0o600);
});

test('creating is idempotent — a second run does not rewrite it', () => {
  run('show');
  writeSettings(JSON.stringify({ apiBaseUrl: 'https://example.test', apiKey: 'k', apiDeclined: false }));
  const before = readFileSync(settingsPath(), 'utf8');
  run('show');
  assert.equal(readFileSync(settingsPath(), 'utf8'), before);
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

test('neither write ever adds a sixth field', () => {
  run('decline');
  run('set-key', 'sk-test-123');
  assert.deepEqual(Object.keys(settings()).sort(), ['apiBaseUrl', 'apiDeclined', 'apiKey', 'fetchesPerBranch', 'vetHandleCap']);
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

// ---------------------------------------------------------------- run ceilings
//
// fetchesPerBranch bounds one angle-source pair; vetHandleCap bounds how many people a
// run vets. Both are the user's to change, and both are read by the skill rather than
// enforced by any script — see brain/phases/extract_phase_b.md and vet_phase_c.md.

test('the ceilings default to 20 and 50', () => {
  run('show');
  assert.equal(settings().fetchesPerBranch, 20);
  assert.equal(settings().vetHandleCap, 50);
});

test('a user-set ceiling survives a read', () => {
  writeSettings(JSON.stringify({ fetchesPerBranch: 8, vetHandleCap: 200 }));
  const { code, out } = run('show');
  assert.equal(code, 0);
  assert.equal(JSON.parse(out).fetchesPerBranch, 8);
  assert.equal(JSON.parse(out).vetHandleCap, 200);
});

test('a user-set ceiling survives a write', () => {
  writeSettings(JSON.stringify({ fetchesPerBranch: 8, vetHandleCap: 200 }));
  run('set-key', 'sk-test-123');
  assert.equal(settings().fetchesPerBranch, 8, 'setting a key does not reset the ceilings');
  assert.equal(settings().vetHandleCap, 200);
});

test('show reports the ceilings, so a run can read them without the key', () => {
  const { out } = run('show');
  const reported = JSON.parse(out);
  assert.equal(reported.fetchesPerBranch, 20);
  assert.equal(reported.vetHandleCap, 50);
  assert.ok(!('apiKey' in reported), 'the key itself is still never printed');
});

// A ceiling of zero, a negative, or a string would stop a run doing any work at all while
// looking configured. The default is safer than honouring it.
for (const bad of [0, -5, '20', 1.5, null]) {
  test(`a ceiling of ${JSON.stringify(bad)} reads back as the default`, () => {
    const written = JSON.stringify({ fetchesPerBranch: bad, vetHandleCap: bad });
    writeSettings(written);
    const { code, out } = run('show');
    assert.equal(code, 0, 'a bad ceiling is not a malformed file');
    assert.equal(JSON.parse(out).fetchesPerBranch, 20);
    assert.equal(JSON.parse(out).vetHandleCap, 50);
    assert.equal(readFileSync(settingsPath(), 'utf8'), written, 'and the file is left as the user typed it');
  });
}

test('a bad ceiling is corrected on the next write', () => {
  writeSettings(JSON.stringify({ fetchesPerBranch: 0, vetHandleCap: -1 }));
  run('set-key', 'sk-test-123');
  assert.equal(settings().fetchesPerBranch, 20, 'the file now holds the value the run will use');
  assert.equal(settings().vetHandleCap, 50);
});
