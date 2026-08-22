/**
 * Hacker News research client.
 *
 * Two data sources, both public, no auth, and neither rate-limited in practice:
 *  - Algolia HN API — item trees, and the per-author searches that count and sample a
 *    handle's comments. One call returns a whole thread.
 *  - The official Firebase HN API — the raw item and profile store. It is the only source
 *    of account age, and the only place `dead` is visible: Algolia 404s a dead item, so a
 *    shadowbanned account looks merely quiet there.
 *
 * The two are complements rather than alternatives. Firebase has no query layer — a
 * profile's `submitted` is bare item ids, so rebuilding one Algolia thread call would cost
 * one Firebase call per comment, and rebuilding the lifetime story/comment split would cost
 * one per submission ever made.
 *
 * Until 2026-08-21 the profile was scraped from the `news.ycombinator.com/user` HTML page,
 * which allows roughly one request per 15 seconds and made Hacker News the slowest source in
 * a run by two orders of magnitude — 50 handles took twelve minutes, and only one agent could
 * work the source at a time. Firebase serves the same three fields unthrottled and in
 * parallel; the page, its parser and its throttle are gone.
 *
 * Story discovery is WebSearch's job, not this script's: brain/subagents/branch_searcher_agent/hackernews.md
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

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserHeaders, assertWorkspaceRoot } from './fetch.mjs';
import { loadOrCreateConfig, MALFORMED, CONFIGURATION_DEFAULTS } from './config.mjs';

// ---------------------------------------------------------------- constants

export const ALGOLIA_BASE = 'https://hn.algolia.com/api/v1';
export const HN_FIREBASE_BASE = 'https://hacker-news.firebaseio.com/v0';

export const VERBS = ['story', 'user', 'vet'];

const REQUEST_TIMEOUT_MS = 30000;
const CONCURRENCY = 8;

/**
 * The configurations the user owns, in ~/.digmore/settings.json under `hackernews`. Read once in
 * runCommand() and passed down as options, so the functions below stay pure — a test hands
 * them a number instead of writing a settings file. These are the values used when the
 * caller passes none.
 */
const COMMENT_DEPTH_FALLBACK = CONFIGURATION_DEFAULTS.hackernews.commentDepth;
const RECENT_COMMENTS_SAMPLED_FALLBACK = CONFIGURATION_DEFAULTS.hackernews.recentCommentsSampled;
const DEAD_SAMPLE_FALLBACK = CONFIGURATION_DEFAULTS.hackernews.deadSampleSize;

/**
 * How many of the sampled submissions must come back `dead` before the account is called
 * shadowbanned. An absolute count, not a ratio, so it cannot fire on a handle with one or
 * two submissions to its name.
 *
 * Measured on 2026-08-21 over twenty handles at a sample of fifteen: eighteen of nineteen
 * known-good handles had none dead, the nineteenth had one — a single flagged comment —
 * and the suspected account had 40%. A shadowbanned account has every post killed, so at
 * the default sample of five this asks for a clear majority and still clears the
 * one-flagged-comment noise floor by two.
 */
export const DEAD_POSTS_FOR_SHADOWBAN = 3;

/**
 * Immediate attempt, then these. Neither host throttles us in normal use, so this is the
 * path out of a transient 429 rather than a schedule the run is expected to pay.
 */
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

const sleep = (milliseconds) => new Promise((wake) => setTimeout(wake, milliseconds));

const makeVerdict = (name, value, signals, reason) => ({ name, verdict: value, signals, reason });

// ---------------------------------------------------------------- the three verbs

export async function fetchStory(itemId, options = {}) {
  const client = options.client ?? createHttpClient(options);
  const algolia = options.algoliaBase ?? ALGOLIA_BASE;
  // Cached tree first. The depth it is flattened to is a configuration the user can change, so
  // the raw tree is what gets stored and the flattening is redone on every read.
  const data =
    readCacheJson(options.cacheDir, `hackernews-item-${itemId}.json`) ??
    (await client.getJson(`${algolia}/items/${itemId}`));
  writeCacheFile(options.cacheDir, `hackernews-item-${itemId}.json`, JSON.stringify(data, null, 2));

  const id = Number(data.id ?? itemId);
  const comments = [];
  flattenCommentTree(data, id, 1, comments, options.commentDepth ?? COMMENT_DEPTH_FALLBACK);
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
 * The Firebase profile and the Algolia calls go out together, then the dead sample follows
 * — it cannot start earlier, because the ids it reads are the profile's own `submitted`.
 *
 * Firebase is reliable, but a failure there still falls back to Algolia's /users/<name>
 * for karma and bio. That path loses the account age and the dead sample both, and vetting
 * already tolerates a missing age. A profile that comes back `null` is not that case: it
 * means no such account, and the empty user it produces is what `missing-profile` reads.
 *
 * `recent_comments` carries each comment **in full**, with the story it sits under. Algolia
 * returns the whole text and this script used to slice it to 280 characters before storing,
 * which cost nothing to keep and could not be recovered without re-fetching. Enrichment
 * reads these bodies to extract from, and `story_id` is what lets it pull the surrounding
 * thread when one is worth reading; vetting only ever counts hosts in them. Reddit already
 * caches full bodies the same way.
 *
 * brain/recency.md wants numericFilters on every Algolia search. It is sent on the
 * comment search only: the two hitsPerPage=0 calls
 * exist purely to read lifetime counts, and filtering those would quietly turn
 * "comments this account has ever posted" into "comments in the last two years".
 * That costs one extra Algolia call, which is free and unmetered.
 */
export async function fetchUser(name, options = {}) {
  const client = options.client ?? createHttpClient(options);
  const algolia = options.algoliaBase ?? ALGOLIA_BASE;
  const firebase = options.firebaseBase ?? HN_FIREBASE_BASE;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const cutoff = now - (options.recencyWindowSeconds ?? RECENCY_WINDOW_SECONDS);

  const cached = readCachedUser(name, options);
  if (cached !== undefined) return cached;

  const settled = await Promise.allSettled([
    client.getJson(`${firebase}/user/${name}.json`),
    client.getJson(`${algolia}/search`, {
      tags: `comment,author_${name}`,
      hitsPerPage: options.recentCommentsSampled ?? RECENT_COMMENTS_SAMPLED_FALLBACK,
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
  const [profile, comments, storiesMeta, commentsMeta] = settled;

  for (const result of [comments, storiesMeta, commentsMeta]) {
    if (result.status === 'rejected') throw result.reason;
  }

  let user;
  let submitted = [];
  if (profile.status === 'fulfilled') {
    user = {
      name,
      karma: profile.value?.karma ?? null,
      created_utc: profile.value?.created ?? null,
      about: stripHtml(profile.value?.about ?? ''),
      stories_submitted: null,
      comments_submitted: null,
    };
    if (Array.isArray(profile.value?.submitted)) submitted = profile.value.submitted;
  } else {
    const fallback = await client.getJson(`${algolia}/users/${name}`);
    user = {
      name,
      karma: fallback.karma ?? null,
      created_utc: null, // not available on this endpoint
      about: stripHtml(fallback.about ?? ''),
      stories_submitted: null,
      comments_submitted: null,
    };
  }

  const deadSample = await sampleDeadPosts(client, submitted, { ...options, firebase });
  user.recent_posts_checked = deadSample.checked;
  user.recent_posts_dead = deadSample.dead;

  const hits = comments.value.hits ?? [];
  const recent = [];
  for (const hit of hits) {
    const text = stripHtml(hit.comment_text ?? '');
    if (!text) continue;
    recent.push({
      id: Number(hit.objectID ?? 0) || null,
      story_id: hit.story_id ?? null,
      story_title: hit.story_title ?? null,
      created_utc: hit.created_at_i ?? null,
      text,
    });
  }
  // The newest comment of all time, not the newest within the recency window.
  const newest = (commentsMeta.value.hits ?? [])[0]?.created_at_i;
  const windowed = hits
    .map((hit) => hit.created_at_i)
    .filter((timestamp) => Number.isInteger(timestamp));

  user.comment_count_sampled = recent.length;
  user.recent_comments = recent;
  user.last_activity_utc = Number.isInteger(newest)
    ? newest
    : windowed.length
      ? Math.max(...windowed)
      : null;
  if (Number.isInteger(storiesMeta.value.nbHits)) user.stories_submitted = storiesMeta.value.nbHits;
  if (Number.isInteger(commentsMeta.value.nbHits)) user.comments_submitted = commentsMeta.value.nbHits;

  // Written without a verdict, which `vet` adds when it judges. A `user` call that stopped
  // here would otherwise pay the whole request chain again on the next call for the same
  // handle, and the chain is four requests plus the dead sample.
  writeCacheFile(options.cacheDir, VET_CACHE_NAME(name), JSON.stringify(user, null, 2));
  return user;
}

/** brain/subagents/handle_vetter_agent/hackernews.md — the signals, in the order applied here. */
export function vetUser(user, now = Math.floor(Date.now() / 1000)) {
  const signals = {};

  if (user.karma === null && !user.about && user.comment_count_sampled === 0) {
    // No such account, or the profile could not be read. That is a gap in what we could
    // see, not a judgement about the person — do not confuse it with `throwaway` below.
    signals.page = 'missing-profile';
    return makeVerdict(user.name, 'unknown', signals, 'missing-profile');
  }

  // Before the host counts below, because a shadowbanned account's comments are not worth
  // reading for promotion patterns — nobody sees them. `throwaway` rather than `spammer`
  // for the same reason: the material is dropped and no deeper read is ever spent on it.
  if (user.recent_posts_checked) {
    signals.recent_posts_dead = `${user.recent_posts_dead}/${user.recent_posts_checked}`;
    if (user.recent_posts_dead >= DEAD_POSTS_FOR_SHADOWBAN) {
      return makeVerdict(user.name, 'throwaway', signals, 'shadowbanned');
    }
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
  const commentHosts = countHostOccurrences(user.recent_comments.map((comment) => comment.text));
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

  // Too new and too small to be worth anything as a source: nothing to judge, and no deeper
  // read would help. Matches the same rule on Reddit and Twitter, which the API owns. All
  // three conditions, never any one alone — a new account can belong to someone who has just
  // arrived, and low karma on its own says nothing about a long-standing lurker.
  const lifetimePosts = (user.stories_submitted ?? 0) + (user.comments_submitted ?? 0);
  if (ageSeconds !== null && ageSeconds < NINETY_DAYS && karma < 50 && lifetimePosts < 20) {
    return makeVerdict(user.name, 'throwaway', signals, 'young-low-karma-few-posts');
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

/**
 * How many of a handle's most recent submissions came back `dead`.
 *
 * `/item/<id>/dead.json` is a single-field read: Firebase answers `true` or `null` in four
 * bytes, so the whole sample costs less than one ordinary request. The ids arrive with the
 * profile — `submitted` is newest first — so nothing extra is fetched to find them.
 *
 * A sample of zero is the user setting `hackernews.deadSampleSize` to 0, which turns the
 * shadowban test off; so is a handle with no submissions, and an Algolia fallback that
 * never saw a profile. All three land on the same answer, and vetUser reads a checked count
 * of zero as "not tested" rather than as "clean".
 */
async function sampleDeadPosts(client, submitted, options) {
  const sample = submitted.slice(0, options.deadSampleSize ?? DEAD_SAMPLE_FALLBACK);
  if (!sample.length) return { checked: 0, dead: 0 };
  const flags = await Promise.all(sample.map((id) => client.getJson(`${options.firebase}/item/${id}/dead.json`)));
  return { checked: sample.length, dead: flags.filter((flag) => flag === true).length };
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

/** Walks the Algolia item tree and collects comments down to the configured reply depth. */
function flattenCommentTree(node, storyId, depth, collected, maxDepth = COMMENT_DEPTH_FALLBACK) {
  if (depth > maxDepth) return;
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
    flattenCommentTree(kid, storyId, depth + 1, collected, maxDepth);
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

function createHttpClient(options) {
  const limit = createConcurrencyLimiter(options.concurrency ?? CONCURRENCY);
  const delays = [0, ...(options.backoffDelays ?? BACKOFF_DELAYS)];

  /** GET with exponential backoff on 429. */
  async function requestWithBackoff(url, { params } = {}) {
    const target = new URL(url);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null) continue;
      target.searchParams.set(key, String(value));
    }

    let response;
    for (const delay of delays) {
      if (delay) await sleep(delay);
      response = await fetch(target, {
        headers: browserHeaders({ Accept: 'application/json, text/plain, */*' }),
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

/**
 * The read half. Without it the files above are write-only, which is what they were: every
 * `user` and `vet` call went out again and a resumed Vet paid the whole phase twice. That
 * cost minutes per handle when the profile was scraped; it is seconds now, and the cache
 * still matters — a re-vetted handle is requests spent to reach a verdict already on disk.
 *
 * A missing or corrupt file is a miss, never a failure — same rule as api.mjs.
 */
function readCacheFile(dir, name) {
  if (!dir) return undefined;
  try {
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return undefined;
  }
}

function readCacheJson(dir, name) {
  const text = readCacheFile(dir, name);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * One file per handle: the vetting record, profile and comments and verdict together.
 *
 * It used to be five — the raw Firebase profile, the Algolia fallback, the raw comment
 * search, the assembled snapshot, and the verdict apart from all of them. Nothing ever read
 * the raw payloads: fetchUser builds the snapshot from them plus three calls that cache
 * nothing, so the parts could never rebuild the whole anyway.
 *
 * Files written under the old names are simply not found, so the first run after this pays
 * one request chain per handle and no more.
 */
export const VET_CACHE_NAME = (name) => `hackernews-vet-${name}.json`;

function readCachedUser(name, options) {
  return readCacheJson(options.cacheDir, VET_CACHE_NAME(name));
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

  const config = loadOrCreateConfig();
  const configurations = config === MALFORMED ? CONFIGURATION_DEFAULTS.hackernews : config.hackernews;
  const resolvedOptions = {
    commentDepth: configurations.commentDepth,
    recentCommentsSampled: configurations.recentCommentsSampled,
    deadSampleSize: configurations.deadSampleSize,
    ...options,
    cacheDir: options.cacheDir ?? cacheDirForTopic(topic),
  };

  if (verb === 'story') return fetchStory(Number.parseInt(target, 10), resolvedOptions);

  // fetchUser checks the same file first, so a handle already on disk costs no request
  // whichever verb asked for it. The point is to skip the request chain entirely rather
  // than to shorten it.
  const record = await fetchUser(target, resolvedOptions);
  if (verb === 'user') return record;

  // A cached record already carries its verdict; a fresh one is judged now. The judgement is
  // computation over comments already in hand, so it is never a second request.
  if (record.verdict) return record;

  const verdict = vetUser(record, resolvedOptions.now);
  const vetted = { ...record, ...verdict };
  writeCacheFile(resolvedOptions.cacheDir, VET_CACHE_NAME(target), JSON.stringify(vetted, null, 2));
  return vetted;
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
