/**
 * Anonymous one-shot fetch of long-form web pages to the topic cache.
 *
 * The canonical fetch path for articles, docs and long
 * forum threads, where WebFetch truncation is unacceptable and the truncation point is
 * invisible. brain/long-form.md decides when to reach for it.
 *
 *   node fetch.mjs <url> --output digmore/<slug>/cache/<source>/<safe-name>
 *
 * stdout JSON, stderr errors. Exit 1 on a non-2xx, 2 on a transport failure.
 *
 * This module also owns the shared user-agent pool (brain/anonymity.md), which the
 * other local source scripts import.
 */

import { createWriteStream } from 'node:fs';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve, relative, sep, isAbsolute } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

export const REQUEST_TIMEOUT_MS = 60000;

/**
 * brain/anonymity.md — a small pool on purpose: "large pools are themselves a
 * fingerprint". These are current Chrome strings; anonymity.md's own list still says
 * Chrome 120-124 and is stale.
 * To rotate, replace the oldest entry with a current Chrome string. Don't grow past 6-8.
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
 * brain/long-form.md: "The --output path must resolve under
 * <topic>/cache/<source>/<safe-filename>. Any other path leaves the file outside the
 * topic subtree, in violation of the research-output policy." Checked here rather than
 * left to the caller's discipline, because a run that writes outside its topic is the
 * one thing the layout rule exists to prevent.
 */
export function isInsideTopicCache(outPath, cwd = process.cwd()) {
  const target = isAbsolute(outPath) ? resolve(outPath) : resolve(cwd, outPath);
  const rel = relative(resolve(cwd, 'digmore'), target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return false;
  const parts = rel.split(sep);
  // <slug>/cache/<source-or-file>/... — at least slug, "cache", and a filename.
  return parts.length >= 3 && parts[1] === 'cache';
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
  let out;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--output') {
      out = argv[index + 1];
      index += 1;
    } else if (!url) {
      url = token;
    }
  }
  return { url, out };
}

/** Stream url to outPath. Raises on non-2xx, and leaves no file behind when it does. */
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

  mkdirSync(dirname(outPath), { recursive: true });
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
      createWriteStream(outPath),
    );
  } catch (err) {
    rmSync(outPath, { force: true });
    throw new FetchError({ error: 'transport', detail: String(err?.message ?? err) }, 2);
  }

  return {
    url,
    final_url: response.url,
    status: response.status,
    content_type: response.headers.get('content-type') ?? '',
    bytes: written,
    path: outPath,
  };
}

async function main(argv) {
  const { url, out } = parseArgs(argv);
  if (!url || !out) {
    process.stderr.write(
      `${JSON.stringify({ error: 'usage', detail: 'fetch.mjs <url> --output digmore/<slug>/cache/<source>/<name>' })}\n`,
    );
    process.exit(2);
  }
  if (!isInsideTopicCache(out)) {
    process.stderr.write(
      `${JSON.stringify({
        error: 'output_outside_topic_cache',
        detail: 'the --output path must resolve under digmore/<slug>/cache/<source>/',
        path: out,
      })}\n`,
    );
    process.exit(2);
  }

  try {
    const result = await fetchToPath(url, resolve(process.cwd(), out));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (err) {
    if (err instanceof FetchError) {
      process.stderr.write(`${JSON.stringify(err.payload)}\n`);
      process.exit(err.exitCode);
    }
    process.stderr.write(`${JSON.stringify({ error: 'transport', detail: String(err?.message ?? err) })}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main(process.argv.slice(2));
}
