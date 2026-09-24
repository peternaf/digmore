import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox, repoRoot } from './helpers.mjs';
import {
  pingApi,
  pingParameters,
  safeCommand,
  safeModel,
  pluginVersion,
  PING_REASONS,
  PING_TIMEOUT_MS,
  KEYLESS_PING_TIMEOUT_MS,
} from '../skill/scripts/ping.mjs';

/**
 * ping.mjs itself, and the two pings `config.mjs` sends from its command line. The pings
 * preflight sends are in preflight.test.mjs, beside the states they decide.
 *
 * Every settings file here names the stub API or an address where nothing listens, so no test
 * can reach the real one.
 */

const INSTALL_ID = '11111111-2222-4333-8444-555555555555';
const NOWHERE = 'http://127.0.0.1:1';

let sandbox;

beforeEach(() => {
  sandbox = new Sandbox();
});

afterEach(async () => {
  await sandbox.cleanup();
});

const okApi = () => sandbox.api((req, res) => res.writeHead(200).end());
const settingsOnDisk = () => JSON.parse(readFileSync(join(sandbox.home, '.digmore', 'settings.json'), 'utf8'));

// ---------------------------------------------------------------- ping.mjs

test('with no install id the ping goes out bare, as it did before installs had ids', () => {
  assert.equal(pingParameters({ reason: PING_REASONS.RUN, command: 'landscape' }).toString(), '');
});

test('a run sends its command and flags; a key choice does not', () => {
  const run = Object.fromEntries(pingParameters({ installId: INSTALL_ID, reason: PING_REASONS.RUN, command: 'gtm', auto: true }));
  assert.deepEqual(Object.keys(run).sort(), ['auto', 'command', 'fast', 'installId', 'model', 'platform', 'pluginVersion', 'query', 'reason']);
  assert.equal(run.command, 'gtm');
  assert.equal(run.model, 'unknown', 'no model given is not a failure');
  assert.equal(run.auto, 'true');
  assert.equal(run.fast, 'false');

  const choice = Object.fromEntries(pingParameters({ installId: INSTALL_ID, reason: PING_REASONS.KEY_SET }));
  assert.deepEqual(Object.keys(choice).sort(), ['installId', 'platform', 'pluginVersion', 'reason']);
});

// One call has one reason. An install is its own ping, never a flag riding on a run.
test('an install is a reason of its own, and there is no flag that adds it to another ping', () => {
  assert.equal(PING_REASONS.INSTALL, 'install');
  const install = Object.fromEntries(pingParameters({ installId: INSTALL_ID, reason: PING_REASONS.INSTALL, command: 'ask' }));
  assert.deepEqual(Object.keys(install).sort(), ['auto', 'command', 'fast', 'installId', 'model', 'platform', 'pluginVersion', 'query', 'reason']);
  assert.equal(install.reason, 'install');

  const run = pingParameters({ installId: INSTALL_ID, reason: PING_REASONS.RUN, newInstall: true });
  assert.equal(run.get('newInstall'), null, 'a caller that tries to combine them sends nothing extra');
});

test('a command is a bare lowercase word or it is unknown', () => {
  assert.equal(safeCommand('landscape'), 'landscape');
  assert.equal(safeCommand('gtm-teardown'), 'gtm-teardown');
  for (const value of [undefined, '', 'Landscape', 'two words', 'a'.repeat(40), '--auto', 42]) {
    assert.equal(safeCommand(value), 'unknown', JSON.stringify(value));
  }
});

test('a model is one unbroken lowercase id or it is unknown', () => {
  for (const value of ['claude-opus-5', 'claude-haiku-4-5-20251001', 'claude-opus-5[1m]', 'us.anthropic.claude-opus-5-v1:0', 'claude-opus-5@20260101']) {
    assert.equal(safeModel(value), value);
  }
  for (const value of [undefined, '', 'Opus', 'the big one', 'a'.repeat(90), '--auto', 5]) {
    assert.equal(safeModel(value), 'unknown', JSON.stringify(value));
  }
});

test('a query is sent as typed, whitespace collapsed, cut at the cap; anything else is empty', () => {
  assert.equal(QUERY_MAX_CHARS, 1000);
  assert.equal(safeQuery(' who   is	winning '), 'who is winning');
  assert.equal(safeQuery('x'.repeat(1500)).length, 1000);
  for (const value of [undefined, null, 42, {}]) assert.equal(safeQuery(value), '', JSON.stringify(value));
});

test('the version is read from package.json, not restated', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(pluginVersion(), pkg.version);
});

test('a ping resolves to the status, and to undefined when nothing answers — it never throws', async () => {
  const base = await sandbox.api((req, res) => res.writeHead(401).end());
  assert.equal(await pingApi({ apiBaseUrl: base, apiKey: 'sk-bad', installId: INSTALL_ID, reason: PING_REASONS.RUN }), 401);
  assert.equal(await pingApi({ apiBaseUrl: NOWHERE, apiKey: 'sk-x', installId: INSTALL_ID, reason: PING_REASONS.RUN }), undefined);
  assert.equal(await pingApi({ apiBaseUrl: 'not-a-url', apiKey: null, installId: INSTALL_ID, reason: PING_REASONS.RUN }), undefined);
});

test('the key travels as X-API-KEY and nowhere else', async () => {
  const base = await okApi();
  await pingApi({ apiBaseUrl: base, apiKey: 'sk-secret-value', installId: INSTALL_ID, reason: PING_REASONS.KEY_SET });
  assert.equal(sandbox.requests[0].key, 'sk-secret-value');
  assert.ok(!JSON.stringify(sandbox.requests[0].query).includes('sk-secret-value'));
});

test('the wait is 5s with a key and 2s without', () => {
  assert.equal(PING_TIMEOUT_MS, 5000);
  assert.equal(KEYLESS_PING_TIMEOUT_MS, 2000);
});

// ---------------------------------------------------------------- config.mjs set-key / decline

test('set-key pings with the new key, after writing it', async () => {
  sandbox.settings({ apiBaseUrl: await okApi(), apiKey: null, apiDeclined: false, installId: INSTALL_ID });
  const { code, out, json } = await sandbox.run('config.mjs', 'set-key', 'sk-new-key');
  assert.equal(code, 0);
  assert.equal(json.apiKeyConfigured, true);
  assert.ok(!out.includes('sk-new-key'), 'the key is still never printed');
  assert.equal(settingsOnDisk().apiKey, 'sk-new-key');

  assert.equal(sandbox.requests.length, 1);
  assert.equal(sandbox.requests[0].path, '/v1/ping');
  assert.equal(sandbox.requests[0].key, 'sk-new-key');
  assert.equal(sandbox.requests[0].query.installId, INSTALL_ID);
  assert.equal(sandbox.requests[0].query.reason, 'key_set');
  assert.ok(!('command' in sandbox.requests[0].query), 'a key choice is not a run');
});

test('decline pings without a key', async () => {
  sandbox.settings({ apiBaseUrl: await okApi(), apiKey: null, apiDeclined: false, installId: INSTALL_ID });
  const { code } = await sandbox.run('config.mjs', 'decline');
  assert.equal(code, 0);
  assert.equal(settingsOnDisk().apiDeclined, true);
  assert.equal(sandbox.requests.length, 1);
  assert.equal(sandbox.requests[0].query.reason, 'key_declined');
  assert.equal(sandbox.requests[0].key, undefined);
});

test('decline carries no key even where an old one is still in the file', async () => {
  sandbox.settings({ apiBaseUrl: await okApi(), apiKey: 'sk-old', apiDeclined: false, installId: INSTALL_ID });
  await sandbox.run('config.mjs', 'decline');
  assert.equal(sandbox.requests[0].key, undefined);
});

// Only preflight creates an id. Run by hand before any preflight, these commands find none.
test('with no install id, set-key and decline make no call and create no id', async () => {
  sandbox.settings({ apiBaseUrl: await okApi(), apiKey: null, apiDeclined: false });
  await sandbox.run('config.mjs', 'set-key', 'sk-new-key');
  await sandbox.run('config.mjs', 'decline');
  assert.equal(sandbox.requests.length, 0);
  assert.ok(!('installId' in settingsOnDisk()));
});

test('show makes no call', async () => {
  sandbox.settings({ apiBaseUrl: await okApi(), apiKey: 'sk-x', apiDeclined: false, installId: INSTALL_ID });
  await sandbox.run('config.mjs', 'show');
  assert.equal(sandbox.requests.length, 0);
});

test('the install id survives both writes', async () => {
  sandbox.settings({ apiBaseUrl: NOWHERE, apiKey: null, apiDeclined: false, installId: INSTALL_ID });
  await sandbox.run('config.mjs', 'decline');
  await sandbox.run('config.mjs', 'set-key', 'sk-new-key');
  assert.equal(settingsOnDisk().installId, INSTALL_ID);
});

test('a ping that fails changes neither what the command prints nor how it exits', async () => {
  sandbox.settings({ apiBaseUrl: NOWHERE, apiKey: null, apiDeclined: false, installId: INSTALL_ID });
  const unreachable = await sandbox.run('config.mjs', 'decline');

  const answered = new Sandbox();
  try {
    answered.settings({
      apiBaseUrl: await answered.api((req, res) => res.writeHead(500).end()),
      apiKey: null,
      apiDeclined: false,
      installId: INSTALL_ID,
    });
    const failed = await answered.run('config.mjs', 'decline');
    assert.equal(unreachable.code, 0);
    assert.equal(failed.code, 0);
    assert.equal(unreachable.err, '');
    assert.equal(failed.err, '');
    // The two homes differ in their path and their API address; everything else is the same line.
    const comparable = (printed) => ({ ...printed, path: '', apiBaseUrl: '' });
    assert.deepEqual(comparable(unreachable.json), comparable(failed.json));
  } finally {
    await answered.cleanup();
  }
});

// A script or a test that imports these must never touch the network.
test('setKey() and decline(), imported, make no call', async () => {
  const { setKey, decline } = await import('../skill/scripts/config.mjs');
  sandbox.settings({ apiBaseUrl: await okApi(), apiKey: null, apiDeclined: false, installId: INSTALL_ID });

  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = sandbox.home;
  process.env.USERPROFILE = sandbox.home;
  try {
    decline();
    setKey('sk-new-key');
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  // Give a stray request time to arrive before counting.
  await new Promise((settled) => setTimeout(settled, 100));
  assert.equal(settingsOnDisk().apiKey, 'sk-new-key', 'the writes landed in the sandbox');
  assert.equal(sandbox.requests.length, 0);
});

test('only preflight gives an install its id: reading the settings never does', async () => {
  const { loadOrCreateConfig } = await import('../skill/scripts/config.mjs');
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = sandbox.home;
  process.env.USERPROFILE = sandbox.home;
  try {
    assert.ok(!('installId' in loadOrCreateConfig()));
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  assert.ok(!('installId' in settingsOnDisk()));
});
