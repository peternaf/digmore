/**
 * Hacker News research client.
 *
 * Two data sources:
 *  - Algolia HN API — item trees and per-user metadata. Public, no auth, permissive.
 *  - HN user pages — HTML, and the only source of account age. Rate-limited hard.
 *
 * Story discovery is WebSearch's job, not this script's: brain/sources/hackernews.md
 * records that Algolia keyword search is deliberately NOT a discovery path, because it
 * returns too many off-topic matches on ambiguous queries. WebSearch harvests
 * `item?id=<N>` URLs and this module fetches their trees. There is no `search` verb.
 *
 *   node hackernews.mjs story <item_id> --topic <slug>
 *   node hackernews.mjs user  <name>    --topic <slug>
 *   node hackernews.mjs vet   <name>    --topic <slug>
 *
 * Three verbs, three functions, and they come first below: fetchStory(), fetchUser(),
 * vetUser(). Everything after those is machinery — parsing, vetting signals, http,
 * cache — with the argv dispatcher runCommand() last, beside the CLI entry point it
 * serves. Every constant the three need is declared above them.
 *
 * stdout JSON, stderr errors.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserHeaders, assertWorkspaceRoot } from './fetch.mjs';

// ---------------------------------------------------------------- constants

export const ALGOLIA_BASE = 'https://hn.algolia.com/api/v1';
export const HN_USER_BASE = 'https://news.ycombinator.com/user';

export const VERBS = ['story', 'user', 'vet'];

const REQUEST_TIMEOUT_MS = 30000;
const MAX_COMMENT_DEPTH = 3;
const RECENT_COMMENT_CAP = 50;
const RECENT_EXCERPT_CHARS = 280;
const CONCURRENCY = 4;

/**
 * news.ycombinator.com rate-limits aggressively. The brain raised this to 15s on
 * 2026-06-13 after a Phase B sub-agent stalled mid-batch; 3s and 6s still 429'd.
 */
export const HN_WEB_MIN_INTERVAL_MS = 15000;

/** Immediate attempt, then these. ~65s of extra wall clock under repeated 429s. */
export const BACKOFF_DELAYS = Object.freeze([5000, 15000, 45000]);

const DAY = 86400;
const NINETY_DAYS = 90 * DAY;
const TWO_YEARS = 2 * 365 * DAY;

/** brain/recency.md — every search filters to the last two years. */
export const RECENCY_WINDOW_SECONDS = TWO_YEARS;

/**
 * Links to HN's own platform are not promotion: moderators and regulars routinely post
 * permalinks to threads, comments and guidelines.
 */
const PLATFORM_HOSTS = new Set(['news.ycombinator.com', 'ycombinator.com', 'hn.algolia.com']);

const URL_RE = /https?:\/\/([^\s/<>")]+)/gi;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#x27': "'", '#39': "'", nbsp: ' ' };

const KARMA_RE = /karma:\s*<\/td>\s*<td[^>]*>\s*(\d+)/i;
const USER_TS_RE = /user:\s*<\/td>\s*<td[^>]*\btimestamp="(\d+)"/i;
const CREATED_HUMAN_RE = /created:\s*<\/td>\s*<td[^>]*>(?:\s*<span[^>]*>)?\s*<a[^>]*>([^<]+)<\/a>/i;
const ABOUT_RE = /about:\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i;
const HN_DATE_RE = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/;

const sleep = (milliseconds) => new Promise((wake) => setTimeout(wake, milliseconds));

const makeVerdict = (name, value, signals, reason) => ({ name, verdict: value, signals, reason });

// ---------------------------------------------------------------- the three verbs

export async function fetchStory(itemId, options = {}) {
  const client = options.client ?? createHttpClient(options);
  const algolia = options.algoliaBase ?? ALGOLIA_BASE;
  const data = await client.getJson(`${algolia}/items/${itemId}`);
  writeCacheFile(options.cacheDir, `hackernews-item-${itemId}.json`, JSON.stringify(data, null, 2));

  const id = Number(data.id ?? itemId);
  const comments = [];
  flattenCommentTree(data, id, 1, comments);
  return {
    id,
    title: data.title ?? '',
    url: data.url ?? null,
    points: data.points ?? null,
    num_comments: comments.length,
    author: data.author ?? null,
    created_utc: data.created_at_i ?? null,
    top_comments: comments,
  };
}

/**
 * The HN page and the Algolia calls go out together. Algolia is reliable; HN web is
 * not, so a 429 there falls back to Algolia's /users/<name> for karma and bio and
 * leaves the account age unknown — vetting already tolerates that.
 *
 * brain/recency.md wants numericFilters on every Algolia search. It is sent on the
 * excerpt search only: the two hitsPerPage=0 calls
 * exist purely to read lifetime counts, and filtering those would quietly turn
 * "comments this account has ever posted" into "comments in the last two years".
 * That costs one extra Algolia call, which is free and unmetered.
 */
export async function fetchUser(name, options = {}) {
  const client = options.client ?? createHttpClient(options);
  const algolia = options.algoliaBase ?? ALGOLIA_BASE;
  const hnWeb = options.hnWebBase ?? HN_USER_BASE;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const cutoff = now - (options.recencyWindowSeconds ?? RECENCY_WINDOW_SECONDS);

  const settled = await Promise.allSettled([
    client.getText(hnWeb, { id: name }),
    client.getJson(`${algolia}/search`, {
      tags: `comment,author_${name}`,
      hitsPerPage: RECENT_COMMENT_CAP,
      numericFilters: `created_at_i>${cutoff}`,
    }),
    client.getJson(`${algolia}/search`, { tags: `story,author_${name}`, hitsPerPage: 0 }),
    // Newest first, one hit: this call carries both the lifetime comment count
    // (nbHits) and the true date of the last comment, however old. Reading
    // last_active off the recency-filtered list instead would make anyone dormant
    // for more than the window look like they had never posted at all — exactly
    // backwards, since dormancy is what the Hubs table downweights on.
    client.getJson(`${algolia}/search_by_date`, { tags: `comment,author_${name}`, hitsPerPage: 1 }),
  ]);
  const [page, comments, storiesMeta, commentsMeta] = settled;

  for (const result of [comments, storiesMeta, commentsMeta]) {
    if (result.status === 'rejected') throw result.reason;
  }

  let user;
  if (page.status === 'fulfilled') {
    writeCacheFile(options.cacheDir, `hackernews-user-page-${name}.html`, page.value);
    user = parseUserPage(page.value, name);
  } else {
    if (!(page.reason instanceof HttpStatusError) || page.reason.status !== 429) throw page.reason;
    const fallback = await client.getJson(`${algolia}/users/${name}`);
    writeCacheFile(options.cacheDir, `hackernews-user-algolia-${name}.json`, JSON.stringify(fallback, null, 2));
    user = {
      name,
      karma: fallback.karma ?? null,
      created_utc: null, // not available on this endpoint
      about: stripHtml(fallback.about ?? ''),
      stories_submitted: null,
      comments_submitted: null,
    };
  }

  writeCacheFile(options.cacheDir, `hackernews-user-comments-${name}.json`, JSON.stringify(comments.value, null, 2));

  const hits = comments.value.hits ?? [];
  const excerpts = [];
  for (const hit of hits) {
    const text = stripHtml(hit.comment_text ?? '');
    if (text) excerpts.push(text.slice(0, RECENT_EXCERPT_CHARS));
  }
  // The newest comment of all time, not the newest within the recency window.
  const newest = (commentsMeta.value.hits ?? [])[0]?.created_at_i;
  const windowed = hits
    .map((hit) => hit.created_at_i)
    .filter((timestamp) => Number.isInteger(timestamp));

  user.comment_count_sampled = excerpts.length;
  user.recent_comment_excerpts = excerpts;
  user.last_activity_utc = Number.isInteger(newest)
    ? newest
    : windowed.length
      ? Math.max(...windowed)
      : null;
  if (Number.isInteger(storiesMeta.value.nbHits)) user.stories_submitted = storiesMeta.value.nbHits;
  if (Number.isInteger(commentsMeta.value.nbHits)) user.comments_submitted = commentsMeta.value.nbHits;
  return user;
}

/** brain/sources/hackernews.md — the eight signals, in order. */
export function vetUser(user, now = Math.floor(Date.now() / 1000)) {
  const signals = {};

  if (user.karma === null && !user.about && user.comment_count_sampled === 0) {
    signals.page = 'missing-or-throwaway';
    return makeVerdict(user.name, 'unknown', signals, 'missing-or-throwaway');
  }

  const karma = user.karma ?? 0;
  signals.karma = String(karma);
  signals.comment_count_sampled = String(user.comment_count_sampled);
  signals.stories_submitted = String(user.stories_submitted ?? 0);
  signals.comments_submitted = String(user.comments_submitted ?? 0);
  if (user.last_activity_utc) {
    signals.last_active = new Date(user.last_activity_utc * 1000).toISOString().slice(0, 10);
  }

  let ageSeconds = null;
  if (user.created_utc) {
    ageSeconds = Math.max(0, now - user.created_utc);
    signals.account_age_days = String(Math.floor(ageSeconds / DAY));
  }

  const bioHosts = new Set(extractHosts(user.about));
  const commentHosts = countHostOccurrences(user.recent_comment_excerpts);
  if (bioHosts.size) signals.bio_hosts = [...bioHosts].sort().join(',');

  for (const host of bioHosts) {
    if (PLATFORM_HOSTS.has(host)) continue;
    const count = commentHosts.get(host) ?? 0;
    if (count >= 3) {
      signals.promoter_host = `${host}:${count}`;
      return makeVerdict(user.name, 'promoter', signals, `bio host ${host} repeated ${count} times in recent comments`);
    }
  }

  for (const [host, count] of commentHosts) {
    if (count >= 5 && !bioHosts.has(host) && !PLATFORM_HOSTS.has(host)) {
      signals.spammer_host = `${host}:${count}`;
      return makeVerdict(user.name, 'spammer', signals, `non-bio host ${host} repeated ${count} times in recent comments`);
    }
  }

  if (ageSeconds !== null && ageSeconds < NINETY_DAYS && karma < 50) {
    return makeVerdict(user.name, 'unknown', signals, 'young-low-karma');
  }
  if (user.comment_count_sampled === 0) {
    return makeVerdict(user.name, 'unknown', signals, 'submitter-only');
  }
  if (karma > 1000) {
    return makeVerdict(user.name, 'legit', signals, `karma ${karma}>1000`);
  }
  if (ageSeconds !== null && ageSeconds > TWO_YEARS && karma > 100) {
    return makeVerdict(user.name, 'legit', signals, `age>=2y + karma ${karma}>100`);
  }
  return makeVerdict(user.name, 'unknown', signals, 'insufficient-signal');
}

// ---------------------------------------------------------------- parsing

function unescapeHtml(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name) => {
    if (Object.hasOwn(ENTITIES, name)) return ENTITIES[name];
    if (name.startsWith('#x') || name.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return whole;
  });
}

/** <p> and <br> become newlines; every other tag is dropped. */
export function stripHtml(input) {
  if (!input) return '';
  return unescapeHtml(
    String(input)
      .replace(/<\s*(p|br)\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  ).trim();
}

export function parseHnDate(text) {
  const match = HN_DATE_RE.exec(text ?? '');
  if (!match) return null;
  const parsed = Date.parse(`${match[1]} ${match[2]}, ${match[3]} UTC`);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

/** The /user HTML carries no counts; those are filled in from Algolia. */
export function parseUserPage(html, name) {
  const karma = KARMA_RE.exec(html);
  const timestampMatch = USER_TS_RE.exec(html);
  const human = CREATED_HUMAN_RE.exec(html);
  const about = ABOUT_RE.exec(html);

  let created = null;
  if (timestampMatch) created = Number.parseInt(timestampMatch[1], 10);
  else if (human) created = parseHnDate(human[1].trim());

  return {
    name,
    karma: karma ? Number.parseInt(karma[1], 10) : null,
    created_utc: created,
    about: about ? stripHtml(about[1]) : '',
    stories_submitted: null,
    comments_submitted: null,
  };
}

/** Walks the Algolia item tree and collects comments down to MAX_COMMENT_DEPTH. */
function flattenCommentTree(node, storyId, depth, collected) {
  if (depth > MAX_COMMENT_DEPTH) return;
  for (const kid of node.children ?? []) {
    if (kid.type === 'comment' && kid.text) {
      collected.push({
        id: Number(kid.id ?? 0),
        author: kid.author ?? null,
        text: stripHtml(kid.text),
        parent_id: kid.parent_id ?? null,
        story_id: storyId,
        created_utc: kid.created_at_i ?? null,
      });
    }
    flattenCommentTree(kid, storyId, depth + 1, collected);
  }
}

// ---------------------------------------------------------------- vetting signals

/**
 * Strip "www." as a prefix, not as a set of leading characters — the naive version
 * turns "wow.test" into "ow.test".
 */
function normaliseHost(host) {
  const lower = host.toLowerCase();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

function extractHosts(text) {
  return [...String(text ?? '').matchAll(URL_RE)].map((match) => normaliseHost(match[1]));
}

/** How many times each host appears across a set of texts. */
function countHostOccurrences(texts) {
  const frequencies = new Map();
  for (const text of texts) {
    for (const host of extractHosts(text)) frequencies.set(host, (frequencies.get(host) ?? 0) + 1);
  }
  return frequencies;
}

// ---------------------------------------------------------------- http

/** A tiny concurrency gate — at most four requests in flight at once. */
function createConcurrencyLimiter(limit) {
  let active = 0;
  const queue = [];
  const startNext = () => {
    if (active >= limit || queue.length === 0) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    task().then(resolve, reject).finally(() => {
      active -= 1;
      startNext();
    });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      startNext();
    });
}

class HttpStatusError extends Error {
  constructor(status, url) {
    super(`http_status ${status}`);
    this.status = status;
    this.url = url;
  }
}

/**
 * Serialises calls to the HN web host and keeps a minimum gap between them. A no-op
 * for Algolia, which is fine under the concurrency cap.
 */
function createHnWebThrottle(minIntervalMs) {
  let last = 0;
  let chain = Promise.resolve();
  return (isHnWeb) => {
    if (!isHnWeb) return Promise.resolve();
    chain = chain.then(async () => {
      const wait = minIntervalMs - (Date.now() - last);
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    return chain;
  };
}

function createHttpClient(options) {
  const limit = createConcurrencyLimiter(options.concurrency ?? CONCURRENCY);
  const throttle = createHnWebThrottle(options.hnWebMinIntervalMs ?? HN_WEB_MIN_INTERVAL_MS);
  const delays = [0, ...(options.backoffDelays ?? BACKOFF_DELAYS)];

  /** GET with the per-host throttle and exponential backoff on 429. */
  async function requestWithBackoff(url, { params, html = false, isHnWeb = false } = {}) {
    const target = new URL(url);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null) continue;
      target.searchParams.set(key, String(value));
    }

    let response;
    for (const delay of delays) {
      if (delay) await sleep(delay);
      await throttle(isHnWeb);
      response = await fetch(target, {
        headers: browserHeaders(html ? {} : { Accept: 'application/json, text/plain, */*' }),
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status !== 429) break;
    }
    if (!response.ok) throw new HttpStatusError(response.status, String(target));
    return response;
  }

  return {
    getJson: (url, params) => limit(async () => (await requestWithBackoff(url, { params })).json()),
    getText: (url, params) =>
      limit(async () => (await requestWithBackoff(url, { params, html: true, isHnWeb: true })).text()),
  };
}

// ---------------------------------------------------------------- cache

/** The working directory, never the plugin's own directory. */
export function cacheDirForTopic(topic) {
  assertWorkspaceRoot();
  return join(process.cwd(), 'digmore', topic, 'cache', 'hackernews');
}

function writeCacheFile(dir, name, content) {
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), content, 'utf8');
  } catch {
    // A cache write failure must not lose the fetched data the caller already has.
  }
}

// ---------------------------------------------------------------- cli

/** Parse the command line, dispatch to the verb's function, return its result. */
export async function runCommand(argv, options = {}) {
  const [verb, target, ...rest] = argv;
  if (!VERBS.includes(verb)) {
    throw new Error(`unknown command: ${verb ?? '(none)'} — expected ${VERBS.join(', ')}`);
  }
  if (!target) throw new Error(`${verb} needs its argument`);

  let topic;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--topic') topic = rest[index + 1];
  }
  if (!topic) throw new Error('--topic <slug> is required on every call');

  const resolvedOptions = { ...options, cacheDir: options.cacheDir ?? cacheDirForTopic(topic) };

  if (verb === 'story') return fetchStory(Number.parseInt(target, 10), resolvedOptions);
  const user = await fetchUser(target, resolvedOptions);
  if (verb === 'user') return user;
  return vetUser(user, resolvedOptions.now);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(`${JSON.stringify(await runCommand(process.argv.slice(2)))}\n`);
  } catch (error) {
    const status = error instanceof HttpStatusError ? { status: String(error.status), url: error.url } : {};
    process.stderr.write(`${JSON.stringify({ error: error.message, ...status })}\n`);
    process.exit(error instanceof HttpStatusError ? 1 : 2);
  }
}
