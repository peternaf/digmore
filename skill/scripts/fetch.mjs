/**
 * Anonymous one-shot fetch of long-form web pages to the topic cache.
 *
 * The canonical fetch path for articles, docs and long
 * forum threads, where WebFetch truncation is unacceptable and the truncation point is
 * invisible. brain/page_analyst_agent/index.md decides when to reach for it, and what to do
 * when a bot wall makes WebFetch the only way through.
 *
 *   node fetch.mjs <url> --output-dir digmore/<slug>/cache/<source>
 *
 * The caller says where; this script says what. The filename is derived from the URL, so
 * one URL always produces one file: two branches that find the same page write one file
 * instead of two copies under two invented names, and a page already on disk is returned
 * rather than fetched again.
 *
 * There is deliberately no way to pass a filename. That was the old --output, and it is
 * how the same page ended up cached twice under two near-miss names an agent typed.
 *
 * stdout JSON, stderr errors. Exit 1 on a non-2xx, 2 on a transport failure.
 *
 * This module also owns the shared user-agent pool, which the other local source
 * scripts import. See AGENTS.md, "New network code must not identify the user".
 */

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, sep, isAbsolute } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

export const REQUEST_TIMEOUT_MS = 60000;

/**
 * A small pool on purpose: large pools are themselves a fingerprint. These are current
 * Chrome strings. To rotate, replace the oldest entry with a current one. Don't grow
 * past 6-8.
 */
export const BROWSER_USER_AGENTS = Object.freeze([
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
]);

export function randomBrowserUa() {
  return BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)];
}

/**
 * Accept-Encoding is left off deliberately: the runtime
 * sets its own and decodes the response, whereas a hand-set value can hand back bytes
 * still compressed, and this script writes the body straight to disk.
 */
export const BROWSER_HEADERS = Object.freeze({
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
});

export function browserHeaders(extra = {}) {
  return { ...BROWSER_HEADERS, 'User-Agent': randomBrowserUa(), ...extra };
}

/**
 * Everything a run writes lands under digmore/<slug>/cache/<source>/. Checked here rather
 * than left to the caller's discipline, because a run that writes outside its own topic is
 * the one thing the layout rule exists to prevent.
 *
 * The filename is this script's now, so only the directory is the caller's to get wrong.
 */
export function isInsideTopicCache(outPath, cwd = process.cwd()) {
  const target = isAbsolute(outPath) ? resolve(outPath) : resolve(cwd, outPath);
  const rel = relative(resolve(cwd, 'digmore'), target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return false;
  const parts = rel.split(sep);
  // <slug>/cache/<source-or-file>/... — at least slug, "cache", and a filename.
  return parts.length >= 3 && parts[1] === 'cache';
}

/**
 * Every script builds its paths as <cwd>/digmore/<slug>/..., which is right only when the
 * cwd is the directory the user is working in. A caller that has stepped into the topic
 * directory first gets digmore/<slug>/digmore/<slug>/... — created without complaint by a
 * recursive mkdir, so the run looks fine while its cache lands in a tree nothing else
 * reads, and resume re-fetches everything.
 *
 * Refuse it instead. The same reasoning as a missing --topic: a silent no-op leaves a run
 * that looks complete having saved nothing where anyone will look for it.
 */
export function assertWorkspaceRoot(cwd = process.cwd()) {
  const parts = resolve(cwd).split(sep);
  const index = parts.lastIndexOf('digmore');
  // A 'digmore' segment with a slug under it means we are inside a topic directory.
  // A trailing 'digmore' is just the research root, which is fine to sit in.
  if (index !== -1 && index < parts.length - 1) {
    throw new Error(
      `run from the directory you are working in, not from inside ${parts.slice(index).join(sep)} — ` +
        'paths are built as digmore/<slug>/... and would nest a second copy under this one',
    );
  }
}

class FetchError extends Error {
  constructor(payload, exitCode) {
    super(payload.error);
    this.payload = payload;
    this.exitCode = exitCode;
  }
}

export function parseArgs(argv) {
  let url;
  let outputDir;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--output-dir') {
      outputDir = argv[index + 1];
      index += 1;
    } else if (!url) {
      url = token;
    }
  }
  return { url, outputDir };
}

/**
 * How long a filename may get before it is truncated and hashed.
 *
 * Windows caps a path at 260 characters, and the filename is only its last part: the rest
 * is the working directory plus digmore/<slug>/cache/<source>/. 120 leaves roughly half the
 * budget for those, and the extension.
 */
export const FILENAME_ONLY_MAX = 120;

/**
 * The cache filename for a URL, without extension. One URL, one filename, every time.
 *
 * That is the whole point, and it is why the page title is not used: a title is unknown
 * until the page has been fetched, so it cannot answer "is this already cached?" without
 * doing the fetch the question exists to avoid. Titles also repeat across a thread's pages
 * and change between runs. The title belongs in the extracted page's first heading, where
 * it makes the directory readable without making the name unstable.
 *
 * Host first so a directory listing groups by site, then the path and query with every
 * character a filesystem might object to collapsed to an underscore.
 *
 * A name past FILENAME_ONLY_MAX is cut and given `_<md5(url)[:8]>`, so a long URL stays
 * unique while a short one stays clean. The hash is over the whole URL, never the truncation.
 */
export function filenameOnlyFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`not a URL: ${url}`);
  }

  const tail = `${decodeURIComponent(parsed.pathname)}${decodeURIComponent(parsed.search)}`;
  const filenameOnly = `${parsed.hostname}${tail}`
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (filenameOnly.length <= FILENAME_ONLY_MAX) return filenameOnly;
  const digest = createHash('md5').update(url, 'utf8').digest('hex').slice(0, 8);
  return `${filenameOnly.slice(0, FILENAME_ONLY_MAX).replace(/_+$/, '')}_${digest}`;
}

/**
 * What the response actually is, as a file extension — or '' when we would be guessing.
 *
 * Only the types a research run fetches are mapped. An unrecognised type keeps the name
 * it was given rather than acquiring a wrong extension, which would be worse than none.
 */
export function extensionFor(contentType) {
  const type = String(contentType).split(';')[0].trim().toLowerCase();
  return {
    'text/html': '.html',
    'application/xhtml+xml': '.html',
    'text/plain': '.txt',
    'application/json': '.json',
    'text/xml': '.xml',
    'application/xml': '.xml',
    'application/pdf': '.pdf',
    'text/markdown': '.md',
  }[type] ?? '';
}

/**
 * A caller passes a slug — `engadget-elevenlabs-banned-biden` — and nothing downstream can
 * then tell a 600KB HTML page from a 5KB text extract without opening it. So the response's
 * own content type names the file.
 *
 * Only when the caller left the extension off. `…-p2.html` and `…-notes.md` are deliberate
 * and are kept. The test is a dot plus one to five alphanumerics, so a slug that merely
 * contains a dot — `mux.com-pricing` — is not mistaken for an extension.
 */
export function withExtension(outPath, contentType) {
  if (/\.[a-z0-9]{1,5}$/i.test(outPath)) return outPath;
  return outPath + extensionFor(contentType);
}

/**
 * Stream url to outPath. Raises on non-2xx, and leaves no file behind when it does.
 * The extension may be appended from the content type, so read the written name off the
 * returned `path` rather than assuming the one passed in.
 */
export async function fetchToPath(url, outPath) {
  let response;
  try {
    response = await fetch(url, {
      headers: browserHeaders(),
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new FetchError({ error: 'transport', detail: String(err?.message ?? err) }, 2);
  }

  if (!response.ok) {
    throw new FetchError(
      { error: 'http_status', status: response.status, final_url: response.url },
      1,
    );
  }

  // The content type is only known now, so the final name is settled here rather than by
  // the caller. The returned `path` is what was actually written.
  const target = withExtension(outPath, response.headers.get('content-type') ?? '');

  mkdirSync(dirname(target), { recursive: true });
  let written = 0;
  try {
    const counter = new TransformStream({
      transform(chunk, controller) {
        written += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body.pipeThrough(counter)),
      createWriteStream(target),
    );
  } catch (err) {
    rmSync(target, { force: true });
    throw new FetchError({ error: 'transport', detail: String(err?.message ?? err) }, 2);
  }

  return {
    url,
    final_url: response.url,
    status: response.status,
    content_type: response.headers.get('content-type') ?? '',
    bytes: written,
    path: target,
  };
}

const USAGE = 'fetch.mjs <url> --output-dir digmore/<slug>/cache/<source>';

/**
 * The file this name already has in dir, if any.
 *
 * The extension is decided by the response's content type, so the name alone does not match
 * what is on disk — `…_item_id_43426022` was written as `….html`. Match it exactly, or
 * followed by a dot, which cannot collide with a `-p2` page because the separator differs.
 */
export function findCached(dir, filenameOnly) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return undefined; // no directory yet is a miss, not a failure
  }
  const hit = entries.find((name) => name === filenameOnly || name.startsWith(`${filenameOnly}.`));
  return hit ? join(dir, hit) : undefined;
}

async function main(argv) {
  const { url, outputDir } = parseArgs(argv);

  if (!url || !outputDir) {
    process.stderr.write(`${JSON.stringify({ error: 'usage', detail: USAGE })}\n`);
    process.exit(2);
  }

  let target;
  let cached;
  let filenameOnly;
  try {
    // The caller says where, this script says what.
    filenameOnly = filenameOnlyFromUrl(url);
    target = join(outputDir, filenameOnly);
    cached = findCached(outputDir, filenameOnly);
  } catch (err) {
    process.stderr.write(`${JSON.stringify({ error: 'usage', detail: String(err?.message ?? err) })}\n`);
    process.exit(2);
  }

  if (!isInsideTopicCache(target)) {
    process.stderr.write(
      `${JSON.stringify({
        error: 'output_outside_topic_cache',
        detail: 'the output path must resolve under digmore/<slug>/cache/<source>/',
        path: target,
      })}\n`,
    );
    process.exit(2);
  }

  // Already on disk: return it rather than spend a request. The brain used to ask the caller
  // to check first, which never happened — the caller could not know the name. Now the name
  // is this script's, so the check belongs here too.
  if (cached) {
    process.stdout.write(
      `${JSON.stringify({ url, path: cached, bytes: statSync(cached).size, cached: true })}\n`,
    );
    return;
  }

  try {
    const result = await fetchToPath(url, resolve(process.cwd(), target));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (err) {
    // A failure here is usually a bot wall, and a wall is where the run switches to
    // WebFetch — which reaches sites a plain HTTP client cannot. Whatever WebFetch returns
    // has to be saved under the name this fetch would have used, or resume and dedup see
    // two files for one URL. So the failure carries the name and the path with it: the
    // caller never derives one, and there is no second call to ask for it.
    const fallback = { filename_only: filenameOnly, path: target };
    if (err instanceof FetchError) {
      process.stderr.write(`${JSON.stringify({ ...err.payload, ...fallback })}\n`);
      process.exit(err.exitCode);
    }
    process.stderr.write(
      `${JSON.stringify({ error: 'transport', detail: String(err?.message ?? err), ...fallback })}\n`,
    );
    process.exit(2);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main(process.argv.slice(2));
}
