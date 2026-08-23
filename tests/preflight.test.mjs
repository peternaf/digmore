import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { Sandbox } from './helpers.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREFLIGHT = join(repoRoot, 'skill', 'scripts', 'preflight.mjs');

let home;
let server;
let requests;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'digmore-preflight-'));
  requests = [];
});

afterEach(async () => {
  rmSync(home, { recursive: true, force: true });
  if (server) {
    await new Promise((closed) => server.close(closed));
    server = undefined;
  }
});

/** A stand-in for the digmore API. */
async function stubApi(handler) {
  server = createServer((req, res) => {
    requests.push({
      url: req.url,
      key: req.headers['x-api-key'],
      authorization: req.headers.authorization,
    });
    handler(req, res);
  });
  await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
  return `http://127.0.0.1:${server.address().port}`;
}

function writeSettings(config) {
  mkdirSync(join(home, '.digmore'), { recursive: true });
  writeFileSync(
    join(home, '.digmore', 'settings.json'),
    typeof config === 'string' ? config : JSON.stringify(config),
  );
}

/**
 * Async on purpose: the stub API runs in this process, so a blocking spawnSync would
 * stop the event loop and the server could never accept the child's connection.
 */
function run(overrides = {}) {
  return new Promise((resolveRun) => {
    // The limits are read from the environment as well as the settings files, and this
    // suite runs inside a session that may well have raised them. Strip them so a test
    // sees only what it set up, then let the caller put back what it is testing.
    const env = { ...process.env, HOME: home, USERPROFILE: home, ...overrides };
    for (const key of ['CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION', 'CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS']) {
      if (!(key in overrides)) delete env[key];
    }
    const child = spawn(process.execPath, [PREFLIGHT], { env, cwd: home });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (err += chunk));
    child.on('close', (code) => resolveRun({ code, out, err }));
  });
}

/**
 * README.md is the single source of the offer copy. The tests below hold no copy of
 * their own: they read the block out of the README and check that a keyless run prints
 * exactly that. Change the wording in one place and both the script and these tests
 * follow — or fail, which is the point.
 *
 * The block runs from the opening line to the line naming the joining address.
 */
function offerFromReadme() {
  // The README is CRLF on this machine and the script's output is LF, so a line lifted
  // straight out of it carries a trailing \r and matches nothing.
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8').replaceAll('\r\n', '\n');
  const start = readme.indexOf('To get access to enhanced');
  assert.notEqual(start, -1, 'README.md no longer contains the offer');
  // The block ends on the line carrying the address. Anchor on the address itself
  // rather than the sentence around it: the sentence has been reworded before, and a
  // marker that stops matching turns every check below into a comparison with "".
  const address = readme.indexOf('waitlist@digmore.ai', start);
  assert.notEqual(address, -1, 'the offer in README.md names no joining address');
  const end = readme.indexOf('\n', address);
  assert.notEqual(end, -1, 'the offer runs to the end of the file');
  // The README wraps the address in backticks; the terminal copy does not.
  const offer = readme.slice(start, end).replace(/`/g, '').trimEnd();
  assert.ok(offer.length > 200, 'the extracted offer is suspiciously short');
  return offer;
}

const OFFER = offerFromReadme();
const OFFER_FIRST_LINE = OFFER.split('\n')[0];

// The six states.
test('NO_KEY: a fresh install reports the state and shows the offer', async () => {
  const { code, out } = await run();
  assert.equal(code, 0);
  assert.match(out, /NO_KEY/);
  assert.ok(out.includes(OFFER_FIRST_LINE), 'the offer is shown on a keyless run');
  assert.match(out, /waitlist@digmore\.ai/);
});

test('NO_KEY: the run names the branches it cannot reach', async () => {
  const { out } = await run();
  assert.match(out, /Reddit/i);
  assert.match(out, /Twitter/i);
});

test('NO_KEY: the user is told they can decline, not left to guess', async () => {
  const { out } = await run();
  assert.match(out, /decline|do not want|don't want/i, 'declining must be offered, not guessed at');
});

test('DECLINED: no offer, no request, but the omission is still named', async () => {
  const base = await stubApi((req, res) => res.end('{}'));
  writeSettings({ apiBaseUrl: base, apiKey: null, apiDeclined: true });
  const { code, out } = await run();
  assert.equal(code, 0);
  assert.match(out, /DECLINED/);
  assert.equal(requests.length, 0, 'a declined run makes no API request');
  assert.ok(!out.includes(OFFER_FIRST_LINE), 'declining silences the offer');
  assert.match(out, /Reddit/i, 'declining silences the offer, not the omission');
  assert.match(out, /Twitter/i);
});

test('READY: a valid key makes Reddit and Twitter available', async () => {
  const base = await stubApi((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  writeSettings({ apiBaseUrl: base, apiKey: 'sk-good', apiDeclined: false });
  const { code, out } = await run();
  assert.equal(code, 0);
  assert.match(out, /READY/);
  assert.ok(!out.includes(OFFER_FIRST_LINE), 'no offer when the key works');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/v1/ping');
  assert.equal(requests[0].key, 'sk-good', 'X-API-KEY, not Authorization');
  assert.equal(requests[0].authorization, undefined);
});

// The ping contract: 200 means the key is valid, 401 means it is not. The body is not
// part of it, so a 200 with no body at all, or a body that is not JSON, is still READY.
test('READY: the ping body is never read', async () => {
  for (const body of ['', 'ok', '<html>not json</html>', '{"unexpected":']) {
    const caseSandbox = new Sandbox();
    try {
      const base = await caseSandbox.api((req, res) => {
        res.writeHead(200);
        res.end(body);
      });
      caseSandbox.settings({ apiBaseUrl: base, apiKey: 'sk-good', apiDeclined: false });
      const output = await new Promise((resolveRun) => {
        const child = spawn(process.execPath, [PREFLIGHT], {
          env: { ...process.env, HOME: caseSandbox.home, USERPROFILE: caseSandbox.home },
        });
        let out = '';
        child.stdout.setEncoding('utf8').on('data', (chunk) => (out += chunk));
        child.on('close', () => resolveRun(out));
      });
      assert.match(output, /READY/, `body: ${JSON.stringify(body)}`);
    } finally {
      await caseSandbox.cleanup();
    }
  }
});

test('KEY_REJECTED: 401 is reported as a bad key, with no offer', async () => {
  const base = await stubApi((req, res) => {
    res.writeHead(401);
    res.end();
  });
  writeSettings({ apiBaseUrl: base, apiKey: 'sk-bad', apiDeclined: false });
  const { code, out } = await run();
  assert.equal(code, 0);
  assert.match(out, /KEY_REJECTED/);
  assert.ok(!out.includes(OFFER_FIRST_LINE), 'the offer is for NO_KEY only');
});

// V0.1 has no authorization layer, so the API answers 401 for every rejection. A 403
// can only be a proxy or WAF blocking the request in transit — the key is fine.
test('403 is a transit failure, not a rejected key', async () => {
  const base = await stubApi((req, res) => {
    res.writeHead(403);
    res.end();
  });
  writeSettings({ apiBaseUrl: base, apiKey: 'sk-good', apiDeclined: false });
  const { out } = await run();
  assert.match(out, /UNREACHABLE/);
  assert.ok(!out.includes('KEY_REJECTED'), 'never tell the user to replace a working key');
});

// Telling someone their key is invalid when the network is down sends them to fix
// the wrong thing.
test('UNREACHABLE: a 5xx is never reported as a bad key', async () => {
  const base = await stubApi((req, res) => {
    res.writeHead(503);
    res.end();
  });
  writeSettings({ apiBaseUrl: base, apiKey: 'sk-good', apiDeclined: false });
  const { out } = await run();
  assert.match(out, /UNREACHABLE/);
  assert.ok(!out.includes('KEY_REJECTED'));
});

test('UNREACHABLE: nothing listening resolves the same way', async () => {
  writeSettings({ apiBaseUrl: 'http://127.0.0.1:1', apiKey: 'sk-good', apiDeclined: false });
  const { code, out } = await run();
  assert.equal(code, 0);
  assert.match(out, /UNREACHABLE/);
});

test('UNREACHABLE: a nonsense base url does not crash the run', async () => {
  writeSettings({ apiBaseUrl: 'not-a-url', apiKey: 'sk-good', apiDeclined: false });
  const { code, out } = await run();
  assert.equal(code, 0);
  assert.match(out, /UNREACHABLE/);
});

test('MALFORMED: reported with its path, and the file is left alone', async () => {
  const broken = '{ not json at all';
  writeSettings(broken);
  const { code, out } = await run();
  assert.equal(code, 0);
  assert.match(out, /MALFORMED/);
  assert.match(out, /settings\.json/);
  assert.ok(!out.includes(OFFER_FIRST_LINE), 'the offer is for NO_KEY only');
  assert.equal(readFileSync(join(home, '.digmore', 'settings.json'), 'utf8'), broken);
});

// If the file is hand-edited into that shape, the key wins.
test('a key present beats apiDeclined true', async () => {
  const base = await stubApi((req, res) => {
    res.writeHead(200);
    res.end('{}');
  });
  writeSettings({ apiBaseUrl: base, apiKey: 'sk-good', apiDeclined: true });
  assert.match((await run()).out, /READY/);
});

// Exits 0 on every path, including the last-ditch catch.
// A check that cannot run is a real error, unlike the six states it reports. It says why
// on stderr and exits 1, rather than leaving the caller with silence and a success code.
test('a check that cannot run reports why and exits 1', async () => {
  // A file where the home directory should be: ~/.digmore can never be created.
  const notADirectory = join(home, 'not-a-directory');
  writeFileSync(notADirectory, 'this is a file');
  const { code, out, err } = await run({ HOME: notADirectory, USERPROFILE: notADirectory });
  assert.equal(code, 1, 'the failure reaches the caller');
  assert.match(err, /preflight failed/, 'and says so');
  assert.ok(err.trim().length > 'digmore: preflight failed — '.length, 'with the reason attached');
  assert.equal(out, '', 'no half-written report on stdout');
});

// The six states are answers, not failures — each one still exits 0.
test('every path exits 0', async () => {
  const cases = [
    () => {},
    () => writeSettings('{ broken'),
    () => writeSettings({ apiBaseUrl: 'http://127.0.0.1:1', apiKey: 'k', apiDeclined: false }),
    () => writeSettings({ apiBaseUrl: 'not-a-url', apiKey: null, apiDeclined: true }),
  ];
  for (const setup of cases) {
    rmSync(join(home, '.digmore'), { recursive: true, force: true });
    setup();
    assert.equal((await run()).code, 0);
  }
});

test('the report is plain text for the model, not a hook envelope', async () => {
  const { out } = await run();
  assert.ok(!out.trimStart().startsWith('{'), 'no JSON envelope — it is a tool result the model reads');
  assert.ok(out.trim().length > 0);
});

test('the api key is never echoed', async () => {
  const base = await stubApi((req, res) => {
    res.writeHead(200);
    res.end('{}');
  });
  writeSettings({ apiBaseUrl: base, apiKey: 'sk-secret-value', apiDeclined: false });
  const { out, err } = await run();
  assert.ok(!out.includes('sk-secret-value'));
  assert.ok(!err.includes('sk-secret-value'));
});

test('the ping timeout is 5s', async () => {
  const mod = await import('../skill/scripts/preflight.mjs');
  assert.equal(mod.PING_TIMEOUT_MS, 5000);
});

// Every line, not a sample of two — and against what the user actually sees on stdout,
// so escaping in the source cannot make a passing test out of a wrong terminal.
test('a keyless run prints the README offer byte for byte', async () => {
  const { out } = await run();
  for (const line of OFFER.split('\n')) {
    assert.ok(out.includes(line), `the run does not print this README line: ${line}`);
  }
  assert.ok(out.includes(OFFER), 'the offer is printed as one contiguous block, in README order');
});

// ---------------------------------------------------------------- run configurations
//
// The whole reason this block is printed: the brain names a default, the settings file is what
// actually applies, and prose cannot know which. Two real runs on 2026-08-17 applied 20 and 8
// for the same cap with nothing flagging the difference. A run reads its numbers off this
// report, so a heading or a row that stops appearing is a run guessing again.

test('the run prints every configuration it will apply, under its own heading', async () => {
  writeSettings({ apiBaseUrl: 'https://unused.example.test', apiKey: 'sk-x', apiDeclined: false });
  const { out } = await run();

  assert.ok(out.includes('digmore: RUN CONFIGURATIONS — from '), 'the heading names the file they live in');
  assert.ok(out.includes(join(home, '.digmore', 'settings.json')), 'and the path, so the user can go and edit it');

  for (const key of [
    'plan.minAngles', 'plan.maxAngles', 'plan.scopingSearches',
    'extract.fetchesPerBranch', 'extract.maxPagesPerDocument', 'extract.urlsPerDispatch',
    'vet.handleCapPerSource', 'vet.handlesPerDispatch',
    'enrich.expertsFollowed', 'enrich.urlsPerExpert',
    'twitter.handlesDeepVetted', 'twitter.postsPerDeepVet',
    'hackernews.commentDepth', 'hackernews.recentCommentsSampled', 'hackernews.deadSampleSize',
    'subagents.repairAttempts',
  ]) {
    assert.ok(out.includes(key), `the report does not name ${key}`);
  }

  assert.ok(!out.includes('synthesize.'), 'the synthesize group is gone, not renamed in place');
  assert.ok(!out.includes('claimsFactChecked'), 'every rendered claim is checked, so there is no cap');
  assert.ok(!out.includes('manualVerifyFlagCap'), 'nothing is flagged for the user to chase');
});

// Where the two modes differ the row shows both, so a --fast run is not a different number
// arrived at silently. Where they do not, one number means one number in both modes.
test('a configuration reduced by --fast prints both values, and an unchanged one prints one', async () => {
  writeSettings({ apiBaseUrl: 'https://unused.example.test', apiKey: 'sk-x', apiDeclined: false });
  const { out } = await run();

  const rowFor = (key) => out.split('\n').find((line) => line.trim().startsWith(key));

  assert.match(rowFor('extract.fetchesPerBranch'), /20 → 5/, 'reduced in fast');
  assert.match(rowFor('enrich.expertsFollowed'), /10 → 3/);
  assert.match(rowFor('twitter.handlesDeepVetted'), /20 → 0/, 'zero is a skip and is shown as one');
  assert.match(rowFor('extract.maxPagesPerDocument'), /\s5\s/, 'the same in both modes');
  assert.ok(!/→/.test(rowFor('extract.urlsPerDispatch')), 'a batch size does not reduce in fast');
  assert.ok(!/→/.test(rowFor('vet.handlesPerDispatch')), 'a batch size does not reduce in fast');
  assert.ok(!/→/.test(rowFor('subagents.repairAttempts')), 'no arrow where nothing changes');

  // Whitespace-normalised: the sentence wraps in the printed block, so a raw substring match
  // depends on where the line break happens to fall.
  assert.match(
    out.replace(/\s+/g, ' '),
    /the second applies in --fast/,
    'and the report says how to read the arrow',
  );
});

// A number the user set is the one that gets printed. This is the failure the whole block
// exists to prevent, so it is worth asserting against a value no default could produce.
test('the report prints the user’s own numbers, not the defaults', async () => {
  writeSettings({
    apiBaseUrl: 'https://unused.example.test',
    apiKey: 'sk-x',
    apiDeclined: false,
    extract: { fetchesPerBranch: 8 },
    vet: { handleCapPerSource: 200 },
  });
  const { out } = await run();
  const rowFor = (key) => out.split('\n').find((line) => line.trim().startsWith(key));

  assert.match(rowFor('extract.fetchesPerBranch'), /\b8\b/);
  assert.match(rowFor('vet.handleCapPerSource'), /\b200\b/);
  assert.ok(!/\b20 → 5\b/.test(rowFor('extract.fetchesPerBranch')), 'the default is not shown beside it');
});

// A run whose settings file cannot be parsed has no numbers to report, and inventing the
// defaults there would be the same lie the block exists to prevent.
test('a malformed settings file prints no configuration report at all', async () => {
  writeSettings('{ not json');
  const { out } = await run();
  assert.ok(!out.includes('RUN CONFIGURATIONS'), 'no numbers rather than numbers nobody set');
});

// ---------------------------------------------------------------- harness limits
//
// Two Claude Code ceilings a deep run hits: 200 web searches per session, and 20
// concurrent sub-agents. Both are the user's to raise in their own settings file, which
// the plugin reads and never writes. A deep run can exhaust the search ceiling mid-way,
// so preflight says so before the run rather than after.

function writeHarnessSettings(config) {
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(
    join(home, '.claude', 'settings.json'),
    typeof config === 'string' ? config : JSON.stringify(config),
  );
}

const HARNESS_SETTINGS = () => join(home, '.claude', 'settings.json');

test('with no ~/.claude/settings.json, both limits are raised as advice', async () => {
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  const { code, out } = await run();
  assert.equal(code, 0);
  assert.match(out, /HARNESS LIMITS/);
  assert.match(out, /CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION/);
  assert.match(out, /CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS/);
});

test('the wording claims only that it could not confirm, never that the limit is low', async () => {
  // Project settings and environment variables are invisible to us, so a missing entry
  // is not proof of anything.
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  const { out } = await run();
  assert.match(out, /Could not confirm/);
});

test('a limit already raised is not mentioned', async () => {
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  writeHarnessSettings({ env: { CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: '1000' } });
  const { out } = await run();
  assert.match(out, /CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: 1000/, 'the value is reported either way');
  assert.match(out, /Could not confirm/, 'the unraised one still gets advice');
  assert.ok(!out.includes('- CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION'), 'the raised one is not in the advice list');
});

test('both raised means no harness block at all', async () => {
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  writeHarnessSettings({
    env: {
      CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: '1000',
      CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '100',
    },
  });
  const { out } = await run();
  assert.match(out, /HARNESS LIMITS/, 'the numbers are always reported');
  assert.ok(!out.includes('Could not confirm'), 'but there is nothing left to advise');
});

test('a value raised beyond what we ask for is still enough', async () => {
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  writeHarnessSettings({
    env: {
      CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: '5000',
      CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '250',
    },
  });
  const { out } = await run();
  assert.ok(!out.includes('Could not confirm'));
});

test('a value set below what we ask for still gets the advice', async () => {
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  writeHarnessSettings({ env: { CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: '300' } });
  const { out } = await run();
  assert.match(out, /CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION/);
});

test('an unreadable harness settings file is not an error', async () => {
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  writeHarnessSettings('{ not json at all');
  const { code, out } = await run();
  assert.equal(code, 0, 'never fails the run over someone else\u2019s file');
  assert.match(out, /Could not confirm/, 'unreadable is treated as unconfirmed');
});

// The one rule that matters more than the advice itself.
test('preflight never writes the harness settings file', async () => {
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  const original = JSON.stringify({ env: { SOMETHING_ELSE: 'untouched' } });
  writeHarnessSettings(original);
  await run();
  assert.equal(readFileSync(HARNESS_SETTINGS(), 'utf8'), original);
});

test('preflight does not create the harness settings file when it is absent', async () => {
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  await run();
  assert.ok(!existsSync(HARNESS_SETTINGS()), 'the plugin never touches the user\u2019s Claude settings');
});

test('a limit set in the environment wins over the settings file', async () => {
  // The file is one of several places a limit can be set; the environment is what the
  // harness actually applied, so it is the number the run will really get.
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  writeHarnessSettings({ env: { CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '20' } });
  const { out } = await run({ CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '100' });
  assert.match(out, /CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: 100/);
  assert.ok(!out.includes('CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: 20'));
});

test('a project settings file counts too, not just the user one', async () => {
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(
    join(home, '.claude', 'settings.local.json'),
    JSON.stringify({ env: { CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '100' } }),
  );
  const { out } = await run();
  assert.match(out, /CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: 100/);
});

test('a limit nowhere to be found is reported as not visible, not as unset', async () => {
  writeSettings({ apiBaseUrl: 'https://api.digmore.ai', apiKey: null, apiDeclined: true });
  const { out } = await run();
  assert.match(out, /CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: not visible to this run/);
  assert.match(out, /assume the stock 20/);
});
