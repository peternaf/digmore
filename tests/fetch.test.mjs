import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox, script } from './helpers.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

/** A plain web server — fetch.mjs talks to the open web, not to digmore's API. */
async function site(handler) {
  return sandbox.api(handler);
}

const OUT = join('digmore', 'demo', 'cache', 'forums', 'thread.html');

test('streams a page to the --output path and reports it on stdout', async () => {
  const base = await site((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<html><body>the whole thread</body></html>');
  });
  const { code, json } = await sandbox.run('fetch.mjs', `${base}/thread`, '--output', OUT);
  assert.equal(code, 0);
  assert.equal(readFileSync(join(sandbox.cwd, OUT), 'utf8'), '<html><body>the whole thread</body></html>');
  assert.equal(json.status, 200);
  assert.equal(json.content_type, 'text/html; charset=utf-8');
  assert.equal(json.bytes, '<html><body>the whole thread</body></html>'.length);
  assert.match(json.path, /thread\.html$/);
  assert.equal(json.url, `${base}/thread`);
});

test('--output is the only form of the flag', async () => {
  const base = await site((req, res) => res.end('x'));
  const { code } = await sandbox.run('fetch.mjs', `${base}/a`, '--output', OUT);
  assert.equal(code, 0);
  assert.ok(existsSync(join(sandbox.cwd, OUT)));
});

test('creates the parent directory', async () => {
  const base = await site((req, res) => res.end('x'));
  const deep = join('digmore', 'demo', 'cache', 'forums', 'nested', 'deeper', 'page.html');
  assert.equal((await sandbox.run('fetch.mjs', `${base}/a`, '--output', deep)).code, 0);
  assert.ok(existsSync(join(sandbox.cwd, deep)));
});

test('follows redirects and reports the final url', async () => {
  const base = await site((req, res) => {
    if (req.url === '/start') {
      res.writeHead(302, { location: '/end' });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('arrived');
  });
  const { code, json } = await sandbox.run('fetch.mjs', `${base}/start`, '--output', OUT);
  assert.equal(code, 0);
  assert.equal(json.final_url, `${base}/end`);
  assert.equal(readFileSync(join(sandbox.cwd, OUT), 'utf8'), 'arrived');
});

// non-2xx -> http_status, exit 1; transport failure -> exit 2.
test('a non-2xx exits 1, reports the status, and writes no file', async () => {
  const base = await site((req, res) => {
    res.writeHead(404);
    res.end('nope');
  });
  const { code, err } = await sandbox.run('fetch.mjs', `${base}/missing`, '--output', OUT);
  assert.equal(code, 1);
  assert.match(err, /http_status/);
  assert.match(err, /404/);
  assert.ok(!existsSync(join(sandbox.cwd, OUT)), 'a failed fetch leaves no half-written file');
});

test('a transport failure exits 2', async () => {
  const { code, err } = await sandbox.run('fetch.mjs', 'http://127.0.0.1:1/x', '--output', OUT);
  assert.equal(code, 2);
  assert.match(err, /transport/);
});

// Task 8 — added behaviour, not ported. brain/long-form.md says the --output path MUST
// resolve under the topic cache. Enforced here rather than left to the caller.
test('an --output outside the topic cache is refused', async () => {
  const base = await site((req, res) => res.end('x'));
  const outside = [
    'notes.html',
    join('digmore', 'demo', 'summary.md'),
    join('elsewhere', 'thing.html'),
    join('digmore', 'demo', 'cache', '..', '..', '..', 'escape.html'),
    join('..', 'escape.html'),
  ];
  for (const target of outside) {
    const { code, err } = await sandbox.run('fetch.mjs', `${base}/a`, '--output', target);
    assert.notEqual(code, 0, target);
    assert.match(err, /digmore/, target);
    assert.ok(!existsSync(join(sandbox.cwd, target)), target);
  }
  assert.equal(sandbox.requests.length, 0, 'a bad path is refused before anything is fetched');
});

test('an absolute path inside the topic cache is allowed', async () => {
  const base = await site((req, res) => res.end('x'));
  const abs = join(sandbox.cwd, OUT);
  assert.equal((await sandbox.run('fetch.mjs', `${base}/a`, '--output', abs)).code, 0);
  assert.ok(existsSync(abs));
});

test('a missing url or --output is a usage error', async () => {
  const base = await site((req, res) => res.end('x'));
  assert.notEqual((await sandbox.run('fetch.mjs')).code, 0);
  assert.notEqual((await sandbox.run('fetch.mjs', `${base}/a`)).code, 0);
  assert.notEqual((await sandbox.run('fetch.mjs', '--output', OUT)).code, 0);
  assert.equal(sandbox.requests.length, 0);
});

// brain/anonymity.md — spoofed browser UA, rotated from a small pool.
test('requests carry a spoofed browser user agent, never a default', async () => {
  const seen = [];
  const base = await sandbox.api((req, res) => {
    seen.push(req.headers['user-agent']);
    res.end('x');
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sandbox.run('fetch.mjs', `${base}/a`, '--output', OUT);
  }
  for (const ua of seen) {
    assert.match(ua, /^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\)/);
    assert.match(ua, /Chrome\/1(3[1-5])\./, 'Chrome 131-135 — current strings, not the stale doc');
    assert.ok(!/node|undici/i.test(ua));
  }
  assert.ok(new Set(seen).size > 1, 'the pool is rotated across calls');
});

test('the pool is five entries', async () => {
  const { BROWSER_USER_AGENTS } = await import('../skill/scripts/fetch.mjs');
  assert.equal(BROWSER_USER_AGENTS.length, 5);
  assert.equal(new Set(BROWSER_USER_AGENTS).size, 5);
  // anonymity.md: "large pools are themselves a fingerprint" — don't grow past 6-8.
  assert.ok(BROWSER_USER_AGENTS.length <= 8);
});

test('the browser header set travels with it', async () => {
  let headers;
  const base = await sandbox.api((req, res) => {
    headers = req.headers;
    res.end('x');
  });
  await sandbox.run('fetch.mjs', `${base}/a`, '--output', OUT);
  assert.match(headers.accept, /text\/html/);
  assert.match(headers['accept-language'], /en-US/);
});

test('the fetched bytes are written verbatim, not re-encoded', async () => {
  const body = 'quotes: "curly" — em dash — and ünïcödé';
  const base = await site((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(body);
  });
  await sandbox.run('fetch.mjs', `${base}/a`, '--output', OUT);
  assert.equal(readFileSync(join(sandbox.cwd, OUT), 'utf8'), body);
});
