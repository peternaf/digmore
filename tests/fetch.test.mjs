import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Sandbox } from './helpers.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

/** A plain web server — fetch.mjs talks to the open web, not to digmore's API. */
async function site(handler) {
  return sandbox.api(handler);
}

/**
 * The caller gives a directory, never a filename. There is deliberately no way to pass one:
 * that was the old --output, and it is how the same page ended up cached twice under two
 * near-miss names an agent typed.
 */
const DIR = join('digmore', 'demo', 'cache', 'forums');
const WEB = join('digmore', 'demo', 'cache', 'websearch');

const listing = (dir) => {
  try {
    return readdirSync(join(sandbox.cwd, dir));
  } catch {
    return [];
  }
};

test('streams a page into --output-dir and reports the name it chose on stdout', async () => {
  const base = await site((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<html><body>the whole thread</body></html>');
  });
  const { code, json } = await sandbox.run('fetch.mjs', `${base}/thread`, '--output-dir', DIR);
  assert.equal(code, 0);
  assert.equal(json.status, 200);
  assert.equal(json.content_type, 'text/html; charset=utf-8');
  assert.equal(json.bytes, '<html><body>the whole thread</body></html>'.length);
  assert.equal(json.url, `${base}/thread`);

  // Read the written name off `path` rather than assuming it: the extension is only known
  // once the response has arrived.
  assert.match(json.path, /_thread\.html$/);
  assert.equal(readFileSync(json.path, 'utf8'), '<html><body>the whole thread</body></html>');
  assert.deepEqual(listing(DIR).length, 1, 'one URL, one file');
});

// ---------------------------------------------------------------- the name is the URL

// One URL, one filename, every time. That is what makes a cache hit possible at all, and it
// is why the page title is not used: a title is unknown until the page has been fetched, so it
// cannot answer "is this already cached?" without doing the fetch the question exists to avoid.
test('the filename is derived from the URL — host first, then path and query', async () => {
  const { filenameOnlyFromUrl } = await import('../skill/scripts/fetch.mjs');
  assert.equal(
    filenameOnlyFromUrl('https://news.ycombinator.com/item?id=43426022'),
    'news.ycombinator.com_item_id_43426022',
  );
  assert.equal(filenameOnlyFromUrl('https://mux.com/pricing'), 'mux.com_pricing');
  assert.equal(
    filenameOnlyFromUrl('https://mux.com/pricing/'),
    'mux.com_pricing',
    'a trailing separator is not part of the name',
  );
});

test('two callers reaching one URL write one file, not two', async () => {
  const base = await site((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html>same page</html>');
  });
  await sandbox.run('fetch.mjs', `${base}/a`, '--output-dir', DIR);
  await sandbox.run('fetch.mjs', `${base}/a`, '--output-dir', DIR);
  assert.equal(listing(DIR).length, 1);
});

// A very long URL would otherwise blow the Windows 260-character path limit, and the filename
// is only its last part. The hash is over the whole URL, never over the truncation, so two
// long URLs sharing a prefix stay apart.
test('a long name is cut and hashed, and a short one is left clean', async () => {
  const { filenameOnlyFromUrl, FILENAME_ONLY_MAX } = await import('../skill/scripts/fetch.mjs');
  const long = `https://example.test/${'segment/'.repeat(40)}end`;
  const name = filenameOnlyFromUrl(long);
  assert.ok(name.length <= FILENAME_ONLY_MAX + 9, 'truncated plus _<8 hex>');
  assert.match(name, /_[0-9a-f]{8}$/);

  const sibling = filenameOnlyFromUrl(`${long}-other`);
  assert.notEqual(name, sibling, 'two long URLs sharing a prefix do not collide');
  assert.ok(!/_[0-9a-f]{8}$/.test(filenameOnlyFromUrl('https://mux.com/pricing')), 'short names stay clean');
});

test('a url that is not a url is a usage error, before anything is fetched', async () => {
  await site((req, res) => res.end('x'));
  const { code, err } = await sandbox.run('fetch.mjs', 'not-a-url', '--output-dir', DIR);
  assert.equal(code, 2);
  assert.match(err, /usage/);
  assert.equal(sandbox.requests.length, 0);
});

// ---------------------------------------------------------------- the extension

// Nothing downstream can tell a 600KB page from a 5KB text extract without opening it, so the
// response's own content type names the file.
test('the extension comes from the content type', async () => {
  const base = await site((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<html><body>a page</body></html>');
  });
  const { code, json } = await sandbox.run('fetch.mjs', `${base}/article`, '--output-dir', WEB);
  assert.equal(code, 0);
  assert.match(json.path, /\.html$/);
  assert.ok(existsSync(json.path));
});

// Guessing an extension is worse than leaving it off — a wrong one misleads every reader.
test('an unrecognised content type leaves the name alone', async () => {
  const base = await site((req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end('bytes');
  });
  const { code, json } = await sandbox.run('fetch.mjs', `${base}/payload`, '--output-dir', WEB);
  assert.equal(code, 0);
  assert.ok(existsSync(json.path), 'written under the name it derived');
  assert.ok(!/\.[a-z0-9]+$/i.test(json.path), 'and gained nothing');
});

// A dot inside a derived name is not an extension — every name starts with a hostname, so this
// is the common case rather than the edge one.
test('the dot in a hostname is not mistaken for an extension', async () => {
  const { withExtension } = await import('../skill/scripts/fetch.mjs');
  assert.equal(withExtension('a/b/mux.com_pricing', 'text/html'), 'a/b/mux.com_pricing.html');
  assert.equal(withExtension('a/b/page.html', 'text/plain'), 'a/b/page.html', 'no second extension stacked on');
});

test('the content-type map covers what a run fetches, and guesses at nothing else', async () => {
  const { extensionFor, withExtension } = await import('../skill/scripts/fetch.mjs');
  assert.equal(extensionFor('text/html; charset=utf-8'), '.html');
  assert.equal(extensionFor('application/xhtml+xml'), '.html');
  assert.equal(extensionFor('TEXT/PLAIN'), '.txt', 'case and whitespace do not matter');
  assert.equal(extensionFor('application/json'), '.json');
  assert.equal(extensionFor('application/pdf'), '.pdf');
  assert.equal(extensionFor('image/png'), '', 'unmapped types get nothing');
  assert.equal(extensionFor(''), '');
  assert.equal(withExtension('a/b/page', 'text/plain'), 'a/b/page.txt');
});

// ---------------------------------------------------------------- the cache hit

// The brain used to ask the caller to check for the file first, which never happened — the
// caller could not know the name. Now the name is this script's, so the check is too.
test('a page already on disk comes back without a request', async () => {
  const base = await site((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html>first</html>');
  });
  const first = await sandbox.run('fetch.mjs', `${base}/a`, '--output-dir', DIR);
  assert.equal(sandbox.requests.length, 1);
  assert.ok(!first.json.cached);

  const second = await sandbox.run('fetch.mjs', `${base}/a`, '--output-dir', DIR);
  assert.equal(sandbox.requests.length, 1, 'the second call spends no request');
  assert.equal(second.json.cached, true);
  assert.equal(second.json.bytes, '<html>first</html>'.length);

  // Resolved before comparing, because the two paths are not reported in the same form: a
  // fresh fetch returns an absolute path and a cache hit returns the one it was given. Both
  // name the same file, and every caller runs from the directory it was started in — the
  // dispatch template says never cd — so both open. Worth knowing rather than relying on:
  // a caller that compares two `path` values, or stores one and matches it later, gets two
  // different strings for one file.
  assert.equal(resolve(sandbox.cwd, second.json.path), resolve(sandbox.cwd, first.json.path));
});

// The extension is decided by the response, so the derived name alone does not match what is on
// disk: `…_item_id_43426022` was written as `….html`. The hit matches the name exactly or the
// name followed by a dot, which cannot collide with a `-p2` page because the separator differs.
test('the hit matches through the extension, and not across a page suffix', async () => {
  const { findCached } = await import('../skill/scripts/fetch.mjs');
  const base = await site((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html>x</html>');
  });
  await sandbox.run('fetch.mjs', `${base}/thread`, '--output-dir', DIR);

  const dir = join(sandbox.cwd, DIR);
  const written = listing(DIR)[0];
  const stem = written.replace(/\.html$/, '');
  assert.ok(findCached(dir, stem), 'the stem finds the file the extension was added to');
  assert.equal(findCached(dir, `${stem}-p2`), undefined, 'a second page is not this page');
  assert.equal(findCached(join(sandbox.cwd, 'no', 'such', 'dir'), stem), undefined, 'no directory is a miss');
});

// ---------------------------------------------------------------- transport

test('follows redirects and reports the final url', async () => {
  const base = await site((req, res) => {
    if (req.url === '/start') {
      res.writeHead(302, { location: '/end' });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('arrived');
  });
  const { code, json } = await sandbox.run('fetch.mjs', `${base}/start`, '--output-dir', DIR);
  assert.equal(code, 0);
  assert.equal(json.final_url, `${base}/end`);
  assert.equal(readFileSync(json.path, 'utf8'), 'arrived');
});

// non-2xx -> http_status, exit 1; transport failure -> exit 2. A wall is where the run switches
// to WebFetch, and whatever that returns has to land under the name this fetch would have used
// — or resume and dedupe see two files for one URL. So the failure carries the name with it and
// the caller never derives one.
test('a non-2xx exits 1, reports the status, writes no file, and hands back the filename', async () => {
  const base = await site((req, res) => {
    res.writeHead(404);
    res.end('nope');
  });
  const { code, err } = await sandbox.run('fetch.mjs', `${base}/missing`, '--output-dir', DIR);
  assert.equal(code, 1);
  const payload = JSON.parse(err);
  assert.equal(payload.error, 'http_status');
  assert.equal(payload.status, 404);
  assert.match(payload.filename_only, /_missing$/, 'the name WebFetch must save under');
  assert.ok(payload.path.includes(DIR), 'and where to put it');
  assert.equal(listing(DIR).length, 0, 'a failed fetch leaves no half-written file');
});

test('a transport failure exits 2, and still hands back the filename', async () => {
  const { code, err } = await sandbox.run('fetch.mjs', 'http://127.0.0.1:1/x', '--output-dir', DIR);
  assert.equal(code, 2);
  const payload = JSON.parse(err);
  assert.equal(payload.error, 'transport');
  assert.ok(payload.filename_only, 'a wall is a wall whichever way it fails');
});

// ---------------------------------------------------------------- where it may write

// The output path MUST resolve under the topic cache. Enforced here rather than left to the
// caller — nothing a run produces, even briefly, lands outside digmore/<topic-slug>/.
test('an --output-dir outside the topic cache is refused', async () => {
  const base = await site((req, res) => res.end('x'));
  const outside = [
    '.',
    join('digmore', 'demo'),
    join('elsewhere', 'pages'),
    join('digmore', 'demo', 'cache', '..', '..', '..', 'escape'),
    join('..', 'escape'),
  ];
  for (const target of outside) {
    const { code, err } = await sandbox.run('fetch.mjs', `${base}/a`, '--output-dir', target);
    assert.notEqual(code, 0, target);
    assert.match(err, /digmore/, target);
  }
  assert.equal(sandbox.requests.length, 0, 'a bad path is refused before anything is fetched');
});

test('an absolute directory inside the topic cache is allowed', async () => {
  const base = await site((req, res) => res.end('x'));
  const abs = join(sandbox.cwd, DIR);
  const { code, json } = await sandbox.run('fetch.mjs', `${base}/a`, '--output-dir', abs);
  assert.equal(code, 0);
  assert.ok(existsSync(json.path));
});

test('the directory is created if it does not exist', async () => {
  const base = await site((req, res) => res.end('x'));
  const deep = join('digmore', 'demo', 'cache', 'forums', 'nested', 'deeper');
  const { code, json } = await sandbox.run('fetch.mjs', `${base}/a`, '--output-dir', deep);
  assert.equal(code, 0);
  assert.ok(existsSync(json.path));
});

test('--output-dir is the only form of the flag, and both arguments are required', async () => {
  const base = await site((req, res) => res.end('x'));
  assert.notEqual((await sandbox.run('fetch.mjs')).code, 0, 'no url, no dir');
  assert.notEqual((await sandbox.run('fetch.mjs', `${base}/a`)).code, 0, 'no dir');
  assert.notEqual((await sandbox.run('fetch.mjs', '--output-dir', DIR)).code, 0, 'no url');

  // The old flag took a filename. It is gone, so it reads as the url and leaves no directory.
  const legacy = await sandbox.run('fetch.mjs', `${base}/a`, '--output', join(DIR, 'thread.html'));
  assert.notEqual(legacy.code, 0, '--output is not accepted');

  assert.equal(sandbox.requests.length, 0);
});

// ---------------------------------------------------------------- the workspace guard
//
// Every script that builds a path calls assertWorkspaceRoot. It refuses a caller standing inside
// a topic directory, because paths are built as digmore/<slug>/... and a recursive mkdir would
// nest a second copy without complaining — the run looks fine while its cache lands in a tree
// nothing else reads, and resume re-fetches everything.
//
// It judges by what is in the directory, never by its name. The name was the whole check once,
// and it refused every script for anyone whose projects live under a folder called `digmore` —
// which is most people who work on digmore.

const workspace = () => mkdtempSync(join(tmpdir(), 'digmore-workspace-'));
const at = (root, ...segments) => {
  const dir = join(root, ...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const asTopic = (dir) => {
  writeFileSync(join(dir, 'research_plan.json'), '{}');
  return dir;
};

test('a workspace under a folder named digmore is allowed', async () => {
  const { assertWorkspaceRoot } = await import('../skill/scripts/fetch.mjs');
  const root = workspace();
  try {
    // C:\dev\digmore\digmore-test — an ancestor called digmore, and a perfectly good workspace.
    assertWorkspaceRoot(at(root, 'dev', 'digmore', 'digmore-test'));

    // The same workspace once it has topics in it, which is the normal case.
    const ws = at(root, 'dev', 'digmore', 'digmore-test');
    asTopic(at(ws, 'digmore', 'elevenlabs'));
    assertWorkspaceRoot(ws);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('standing inside a topic directory is refused', async () => {
  const { assertWorkspaceRoot } = await import('../skill/scripts/fetch.mjs');
  const root = workspace();
  try {
    const topic = asTopic(at(root, 'ws', 'digmore', 'my-topic'));
    assert.throws(() => assertWorkspaceRoot(topic), /not from inside/);
    // And from anywhere below it — digmore/<slug>/cache nests just as badly.
    assert.throws(() => assertWorkspaceRoot(at(topic, 'cache', 'reddit')), /not from inside/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A topic interrupted before Plan settled has no research_plan.json, so the directory pair is
// the fallback marker.
test('a topic is recognised by its cache and analysis directories too', async () => {
  const { assertWorkspaceRoot } = await import('../skill/scripts/fetch.mjs');
  const root = workspace();
  try {
    const topic = at(root, 'ws', 'digmore', 'half-built');
    at(topic, 'cache');
    at(topic, 'full_source_analysis');
    assert.throws(() => assertWorkspaceRoot(topic), /not from inside/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the research root itself, and any ordinary directory, are allowed', async () => {
  const { assertWorkspaceRoot } = await import('../skill/scripts/fetch.mjs');
  const root = workspace();
  try {
    assertWorkspaceRoot(at(root, 'ws', 'digmore'), 'sitting in the research root is fine');
    assertWorkspaceRoot(at(root, 'dev', 'some-project'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- anonymity

// AGENTS.md, "New network code must not identify the user" — spoofed browser UA from a small
// pool, and nothing that names the user or the product.
test('requests carry a spoofed browser user agent, never a default', async () => {
  const seen = [];
  const base = await sandbox.api((req, res) => {
    seen.push(req.headers['user-agent']);
    res.end('x');
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // A different URL each time, or the cache would answer and no request would go out.
    await sandbox.run('fetch.mjs', `${base}/page-${attempt}`, '--output-dir', DIR);
  }
  assert.equal(seen.length, 8, 'every call reached the server');
  for (const ua of seen) {
    assert.match(ua, /^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\)/);
    assert.match(ua, /Chrome\/1(3[1-5])\./, 'Chrome 131-135 — current strings, not the stale doc');
    assert.ok(!/node|undici|digmore/i.test(ua));
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
  await sandbox.run('fetch.mjs', `${base}/a`, '--output-dir', DIR);
  assert.match(headers.accept, /text\/html/);
  assert.match(headers['accept-language'], /en-US/);
});

test('the fetched bytes are written verbatim, not re-encoded', async () => {
  const body = 'quotes: "curly" — em dash — and ünïcödé';
  const base = await site((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(body);
  });
  const { json } = await sandbox.run('fetch.mjs', `${base}/a`, '--output-dir', DIR);
  assert.equal(readFileSync(json.path, 'utf8'), body);
});
