/**
 * digmore API client — Reddit and Twitter, reached through digmore's API.
 *
 * Reddit and Twitter are the two sources a general-purpose model cannot reach. Both
 * live behind the API, so this client sends a query and gets structured results back;
 * nothing about reaching them happens here.
 *
 * The on-disk cache filenames are load-bearing: phase resume and the salvage paths in
 * brain/phases/index.md read them by name.
 *
 *   node api.mjs reddit  search <query>            --topic <slug> [--subreddit <name>]... [--sort ...] [--time-window ...] [--limit 20] [--after-date YYYY-MM-DD]
 *   node api.mjs reddit  thread <id-or-permalink>  --topic <slug> [--limit 500]
 *   node api.mjs reddit  user   <name>             --topic <slug>   # snapshot + verdict
 *   node api.mjs twitter user   <handle>           --topic <slug>
 *   node api.mjs twitter tweets <handle>           --topic <slug> [--limit 25]
 *   node api.mjs twitter tweet  <tweet-id>...      --topic <slug>
 *   node api.mjs twitter vet    <handle>           --topic <slug> --posts <n>
 *
 * stdout carries JSON, stderr carries errors.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrCreateConfig, MALFORMED } from './config.mjs';
import { assertWorkspaceRoot } from './fetch.mjs';

export const REQUEST_TIMEOUT_MS = 30000;

/**
 * What a 429 waits, in order, before the next attempt. Three waits, so four attempts.
 *
 * digmore's own API has no per-key rate limit today, and this is built anyway: the X bearer
 * token and the residential proxy behind it can throttle us upstream, and that reaches the
 * user the same way. Without it a 429 is a hard failure at the moment it arrives — a Reddit
 * branch that never ran, or a handle that never got vetted, in the middle of the run's
 * widest fan-out. `extract_phase_b.md`'s rule is that a source nobody queried must never
 * read as a source that came back empty, and an unhandled throttle produces exactly that,
 * silently.
 *
 * The order is: the client survives a 429 first, the server gets a limit second.
 */
export const BACKOFF_MS = Object.freeze([5000, 15000, 45000]);

/** The API takes 1–100 tweet ids per call. */
const MAX_TWEET_IDS_PER_CALL = 100;

/** Exit codes. Every caller of this script sources on these. */
export const EXIT = Object.freeze({
  OK: 0,
  FAILED: 1, // network, timeout, 5xx
  UNAVAILABLE: 3, // the source is temporarily unavailable
  NO_KEY: 4, // the source is disabled, not failed
  REJECTED: 5, // 401 — and only 401; see request()
  USAGE: 2, // a bad invocation — nothing was attempted
});

/** Nothing in the plugin tracks or reports money, whatever the API sends. */
const MONEY_FIELDS = new Set(['estimated_cost_usd', 'cost_usd', 'cost']);

function stripMoney(value) {
  if (Array.isArray(value)) return value.map(stripMoney);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !MONEY_FIELDS.has(k))
        .map(([k, v]) => [k, stripMoney(v)]),
    );
  }
  return value;
}

class ApiError extends Error {
  constructor(message, exitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}

// ---------------------------------------------------------------- args

/** Minimal argv parsing. These are called by the skill through Bash, never by a user. */
export function parseArgs(argv) {
  const positional = [];
  const flags = { subreddit: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new ApiError(`${token} needs a value`, EXIT.USAGE);
    }
    index += 1;
    if (name === 'subreddit') flags.subreddit.push(value);
    else flags[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  return { positional, flags };
}

// ---------------------------------------------------------------- cache

/**
 * The topic root is the user's working directory, never the plugin's own directory:
 * the plugin lives in an install cache that an update replaces.
 */
export function cacheDir(topic, source) {
  assertWorkspaceRoot();
  return join(process.cwd(), 'digmore', topic, 'cache', source);
}

function readCache(dir, key) {
  const file = join(dir, key);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined; // a corrupt cache file is a miss, not a failure
  }
}

function writeCache(dir, key, payload) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, key), JSON.stringify(payload), 'utf8');
}

/**
 * Search cache names are readable rather than hashed, so a person opening
 * digmore/<slug>/cache/reddit/ can see what each file is without opening it:
 *
 *   reddit-search-<scope>-<four words of the query>.json
 *
 * The name does not have to be unique — see cachedSearch() for how collisions are
 * settled. That is the trade: a hash cannot collide and cannot be read; four words can
 * do both.
 */

/** Dropped before the query becomes a filename: common in queries, useless in a name. */
const FILENAME_STOPWORDS = new Set([
  'a', 'the', 'of', 'for', 'in', 'on', 'to', 'and', 'or', 'is', 'are',
  'what', 'how', 'why', 'do', 'does', 'vs',
]);

const QUERY_WORDS_IN_NAME = 4;

/**
 * The query, reduced to its first four meaningful words.
 *
 * Derived here rather than passed in by the caller: a cache key has to be a pure function
 * of the request, and two sub-agents summarising the same query in their own words would
 * never hit the same file twice.
 */
export function queryWords(query) {
  const words = String(query ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && !FILENAME_STOPWORDS.has(word));
  return (words.length ? words : ['query']).slice(0, QUERY_WORDS_IN_NAME).join('-');
}

/** The first subreddit in the order given, or `sitewide`. Readability only. */
export function searchScope(subs = []) {
  if (!subs.length) return 'sitewide';
  const first = String(subs[0]).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return first || 'sitewide';
}

export function searchCacheName(query, subs = []) {
  return `reddit-search-${searchScope(subs)}-${queryWords(query)}`;
}

/**
 * Everything that makes one search different from another, stored inside the cache file
 * and compared on read.
 *
 * `subreddits` keeps the order given and is never sorted: the first sub's hits rank above
 * the second's, so `a,b` and `b,a` are different requests with different results.
 */
export function searchRequestKey({ query, subreddits = [], sort, timeWindow, limit, afterDate }) {
  return {
    query: String(query),
    subreddits: [...subreddits],
    sort,
    time_window: timeWindow,
    limit,
    after_date: afterDate ?? null,
  };
}

// ---------------------------------------------------------------- http

const skip = (value) => value === undefined || value === null || value === '';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * How long to wait before retrying a throttled request.
 *
 * `Retry-After` wins where the server sent one and it is a plain number of seconds — it is
 * the only party that knows when the window reopens. The date form is not read: it needs a
 * trustworthy clock on both ends, and getting it wrong waits either far too long or not at
 * all. Anything unusable falls back to the schedule, which is what the header is a
 * refinement of rather than a replacement for.
 */
export function backoffMs(retryAfterHeader, attempt) {
  const scheduled = BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
  const seconds = Number(retryAfterHeader);
  if (!Number.isFinite(seconds) || seconds < 0) return scheduled;
  // A server asking for longer than the schedule is honoured; one asking for less is not,
  // because the schedule is also protecting the paid dependencies behind our own API.
  return Math.max(scheduled, Math.round(seconds * 1000));
}

async function request(config, path, params = {}) {
  const url = new URL(path, config.apiBaseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (skip(value)) continue;
    // An array repeats the parameter — ?subreddits=a&subreddits=b — not overwriting it.
    if (Array.isArray(value)) {
      for (const item of value) if (!skip(item)) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  let response;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: { 'X-API-KEY': config.apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ApiError('the digmore API could not be reached', EXIT.FAILED);
    }

    if (response.status !== 429) break;

    // Out of waits. A throttle we could not outlast is the source being unavailable, not a
    // failure of the call — the run names it as one it could not reach, which is a different
    // sentence from one that came back empty.
    if (attempt >= BACKOFF_MS.length) {
      throw new ApiError(
        'the digmore API is rate limiting this run — try again later',
        EXIT.UNAVAILABLE,
      );
    }
    await wait(backoffMs(response.headers.get('retry-after'), attempt));
  }

  // 401 and only 401. V0.1 has no authorization layer, so the API rejects a key with
  // 401 every time; a 403 can only come from a proxy or WAF blocking the request in
  // transit, where the key is fine and telling the user to replace it sends them to
  // fix the wrong thing. 403 falls through to the generic non-2xx source below.
  if (response.status === 401) {
    throw new ApiError('the digmore API rejected this key', EXIT.REJECTED);
  }
  // The API sanitises its own errors. All the plugin knows, and all it says,
  // is that the source is temporarily unavailable.
  if (response.status === 503) {
    throw new ApiError('this source is temporarily unavailable — try again later', EXIT.UNAVAILABLE);
  }
  if (!response.ok) {
    throw new ApiError(`the digmore API returned ${response.status}`, EXIT.FAILED);
  }

  try {
    return stripMoney(await response.json());
  } catch {
    throw new ApiError('the digmore API returned a body that is not JSON', EXIT.FAILED);
  }
}

// ---------------------------------------------------------------- reddit

const reddit = {
  /**
   * brain/subagents/branch_searcher_agent/reddit.md — multi-sub is the default, and the fan-out stays on the
   * API side: `?subreddits=` repeats and one merged list comes back.
   *
   * Not merged here, deliberately. Order, `limit` and `relevance` are all properties of
   * the merged set: dedupe preserves first-seen order across subs, `limit` applies after
   * merging and after the after_date filter, and `relevance` is rank *within* the merged
   * list. Stitching per-sub responses together in the client reproduces none of that —
   * and the search items are `{url, title, relevance}` with no post id to dedupe on.
   */
  async search(ctx, [query], flags) {
    if (!query) throw new ApiError('reddit search needs a query', EXIT.USAGE);
    const sort = flags.sort ?? 'relevance';
    // The API's default too. The 2-year window of
    // brain/recency.md is `--time-window all --after-date <today-minus-2y>`, passed
    // by the caller.
    const timeWindow = flags.timeWindow ?? 'year';
    const subreddits = flags.subreddit ?? [];
    const limit = flags.limit ?? 20;
    const requestKey = searchRequestKey({
      query,
      subreddits,
      sort,
      timeWindow,
      limit,
      afterDate: flags.afterDate,
    });

    return cachedSearch(ctx, searchCacheName(query, subreddits), requestKey, () =>
      request(ctx.config, '/v1/reddit/search', {
        query,
        subreddits: flags.subreddit,
        sort,
        time_window: timeWindow,
        limit,
        after_date: flags.afterDate,
      }),
    );
  },

  async thread(ctx, [idOrPermalink], flags) {
    if (!idOrPermalink) throw new ApiError('reddit thread needs an id or permalink', EXIT.USAGE);
    const threadId = postId(idOrPermalink);
    return cached(ctx, THREAD_CACHE_NAME(threadId), () =>
      request(ctx.config, `/v1/reddit/thread/${encodeURIComponent(threadId)}`, {
        limit: flags.limit ?? 500,
      }),
    );
  },

  /**
   * The snapshot and the verdict in one call. There is no `reddit vet`: the verdict is
   * computation over comments this request has already fetched, so splitting it out cost
   * a second call re-fetching the same two Reddit pages — expensive against a source that
   * walls roughly one request in four. It also handed back a verdict without the comments
   * the caller needs for its own topical-relevance check.
   *
   * `recent_comments` is one object per comment, carrying its own subreddit and timestamp.
   * Not parallel lists: a field unreadable for one comment would drop an entry and shift
   * every entry after it, so a body and the subreddit beside it would describe different
   * comments.
   *
   * One request, one file: the vetting record for one handle, profile and comments and
   * verdict together.
   *
   * It used to be three — the Python brain made two requests and cached the verdict in a
   * third, and this split the single response back into that shape. Nothing ever read the
   * pieces separately, and three files meant three reads that all had to hit before the
   * cache counted as warm. Files written under the old names are simply not found, so the
   * first run after this pays one request per handle and no more.
   */
  async user(ctx, [name]) {
    if (!name) throw new ApiError('reddit user needs a name', EXIT.USAGE);
    return cached(ctx, `reddit-vet-${name}.json`, () =>
      request(ctx.config, `/v1/reddit/user/${encodeURIComponent(name)}`),
    );
  },
};

// ---------------------------------------------------------------- twitter

const twitter = {
  async user(ctx, [handle]) {
    if (!handle) throw new ApiError('twitter user needs a handle', EXIT.USAGE);
    return cached(ctx, `twitter-user-${handle}.json`, () =>
      request(ctx.config, `/v1/twitter/user/${encodeURIComponent(handle)}`),
    );
  },

  async tweets(ctx, [handle], flags) {
    if (!handle) throw new ApiError('twitter tweets needs a handle', EXIT.USAGE);
    const limit = Number(flags.limit ?? 25);
    // 5-100 is the X API's own range for one timeline page, so an out-of-range value
    // can only ever be a failed round trip. Refuse it here rather than spend one.
    if (!Number.isInteger(limit) || limit < 5 || limit > 100) {
      throw new ApiError('twitter tweets --limit must be a whole number from 5 to 100', EXIT.USAGE);
    }
    return cached(ctx, `twitter-tweets-${handle}-${limit}.json`, () =>
      request(ctx.config, `/v1/twitter/tweets/${encodeURIComponent(handle)}`, { limit }),
    );
  },

  /**
   * brain/subagents/page_analyst_agent/twitter.md — the only path to a quotable tweet body. WebSearch sees
   * only the og:title, roughly the first 15 words, because x.com hydrates client-side.
   * One cache file per tweet id, so re-quoting across runs does not re-fetch.
   */
  async tweet(ctx, tweetIds) {
    if (!tweetIds.length) throw new ApiError('twitter tweet needs one or more tweet ids', EXIT.USAGE);

    const found = {};
    const missing = [];
    for (const tweetId of tweetIds) {
      const cachedTweet = readCache(ctx.dir, TWEET_CACHE_NAME(tweetId));
      if (cachedTweet === undefined) missing.push(tweetId);
      else found[tweetId] = cachedTweet;
    }

    // The API batches up to 100 ids per call.
    for (let start = 0; start < missing.length; start += MAX_TWEET_IDS_PER_CALL) {
      const batch = missing.slice(start, start + MAX_TWEET_IDS_PER_CALL);
      const payload = await request(ctx.config, '/v1/twitter/tweet', { tweet_ids: batch.join(',') });
      for (const tweet of asResults(payload)) {
        const tweetId = String(tweet.id ?? '');
        if (!tweetId) continue;
        writeCache(ctx.dir, TWEET_CACHE_NAME(tweetId), tweet);
        found[tweetId] = tweet;
      }
    }

    return { tweets: tweetIds.map((tweetId) => found[tweetId]).filter(Boolean) };
  },

  /**
   * Vetting reads at a depth, and `--posts` is the whole of it: 0 reads the profile alone, a
   * positive number also reads that many of the handle's recent posts. Which counts X will
   * actually serve is the API's business, so this refuses only what could never be a count.
   *
   * **One file per handle, however many times it is vetted**, carrying `posts_sampled` — the
   * depth it was actually fetched at. The cache hits only when the stored depth is AT LEAST
   * what this call asked for: deeper supersedes shallower, never the other way round.
   *
   * The name used to carry the depth, because a handle could be vetted twice — once cheaply,
   * then again over the ones that came back `unknown`. It cannot any more: depth is decided
   * from the ranking before anything runs, so one handle means one call. What the depth
   * comparison still protects is resume and re-runs — a re-run that raises
   * `twitter.postsPerDeepVet`, or a handle that moved up into the deep set, asks for more
   * than the file holds. Drop the suffix without the comparison and a shallow file would
   * answer a deep call, returning cached having never read the posts it was dispatched for.
   */
  async vet(ctx, [handle], flags) {
    if (!handle) throw new ApiError('twitter vet needs a handle', EXIT.USAGE);
    if (!/^\d+$/.test(String(flags.posts ?? ''))) {
      throw new ApiError(
        'twitter vet needs --posts, a whole number of posts to read (0 for the profile alone)',
        EXIT.USAGE,
      );
    }
    const posts = Number(flags.posts);
    const key = `twitter-vet-${handle}.json`;

    const hit = readCache(ctx.dir, key);
    // A file written before `posts_sampled` existed reads as depth 0, so it answers a
    // profile-only call and is re-fetched for anything deeper. That is the right way round.
    if (hit !== undefined && Number(hit.posts_sampled ?? 0) >= posts) return hit;

    const fresh = await request(ctx.config, `/v1/twitter/vet/${encodeURIComponent(handle)}`, { posts });
    // Recorded here rather than trusted from the response: the depth we asked for is what
    // the cache comparison has to mean, and the API does not report it back.
    const stored = { ...fresh, posts_sampled: posts };
    writeCache(ctx.dir, key, stored);
    return stored;
  },
};

const SOURCES = { reddit, twitter };

// ---------------------------------------------------------------- plumbing

async function cached(ctx, key, fetcher) {
  const hit = readCache(ctx.dir, key);
  if (hit !== undefined) return hit;
  const fresh = await fetcher();
  writeCache(ctx.dir, key, fresh);
  return fresh;
}

/** A runaway loop guard, not a configured bound — two collisions on one name is already rare. */
const MAX_CACHE_PROBES = 20;

/**
 * The search cache, where the filename is readable and therefore not unique.
 *
 * Four words of a query cannot carry the other subreddits, the sort, the window, the limit
 * or the rest of the query, so two different searches can land on one name. Left unchecked
 * the second one opens the first one's file and reports another query's results as its own
 * — no error, just a wrong answer that looks like a normal one.
 *
 * So the full request is written into the file and compared on read: open <name>.json, and
 * if the stored request matches, that is a hit; if it does not, try <name>-2.json, then -3,
 * until either a match or a free slot, which gets written.
 *
 * The match is on the stored request, never on the number — so a resumed or repeated run
 * finds its own file whichever number it landed on first, and order decides which number,
 * never which data. A file written before this existed carries no `_request`, so it misses
 * and is re-fetched once.
 */
async function cachedSearch(ctx, baseName, requestKey, fetcher) {
  const wanted = JSON.stringify(requestKey);

  for (let attempt = 1; attempt <= MAX_CACHE_PROBES; attempt += 1) {
    const key = attempt === 1 ? `${baseName}.json` : `${baseName}-${attempt}.json`;
    const hit = readCache(ctx.dir, key);

    if (hit === undefined) {
      const fresh = await fetcher();
      // A bare array is accepted from the API; store it under `results` so `_request` has
      // somewhere to sit beside it and the file still reads as the search response.
      const body = Array.isArray(fresh) ? { results: fresh } : { ...fresh };
      const stored = { _request: requestKey, ...body };
      writeCache(ctx.dir, key, stored);
      return stored;
    }

    if (JSON.stringify(hit._request ?? null) === wanted) return hit;
  }

  throw new ApiError(`too many cache collisions on ${baseName}`, EXIT.FAILED);
}

/** The API may answer with a bare array or wrap it; both are accepted. */
function asResults(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['results', 'tweets', 'items', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

/**
 * Accepts a bare id, a `/comments/<id>/…` path or a full URL. The `comments/` match comes first and the last path segment is only the fallback —
 * a real permalink carries a title slug after the id, and often a comment id after that,
 * so the last segment is usually neither the post nor an id at all.
 */
/**
 * The cache filenames for the two document kinds this script fetches, defined here because this is
 * the script that writes them.
 *
 * `expert_selection.mjs` derives the same names from a URL to decide whether Extract already read a
 * page. A second copy of either pattern there is a copy that stops matching the first time one
 * moves — and that failure looks like an expert whose every page is new, so the run pays to read
 * what it already has claims from.
 */
export const THREAD_CACHE_NAME = (threadId) => `reddit-thread-${threadId}.json`;
export const TWEET_CACHE_NAME = (tweetId) => `twitter-tweet-${tweetId}.json`;

/** The tweet id inside an x.com or twitter.com URL — `/status/<id>` — or undefined if there is none. */
export function tweetIdFromUrl(url) {
  const match = /\/status(?:es)?\/(\d+)/.exec(String(url));
  return match ? match[1] : undefined;
}

export function postId(value) {
  const text = String(value);
  const match = /comments\/([a-z0-9]+)/i.exec(text);
  if (match) return match[1];
  const trimmed = text.replace(/\/+$/, '');
  return trimmed.includes('/') ? trimmed.slice(trimmed.lastIndexOf('/') + 1) : trimmed;
}

export async function main(argv) {
  const [sourceName, verbName, ...rest] = argv;
  const source = SOURCES[sourceName];
  if (!source) {
    throw new ApiError(`unknown source: ${sourceName ?? '(none)'} — expected reddit or twitter`, EXIT.USAGE);
  }
  const verb = Object.hasOwn(source, verbName) ? source[verbName] : undefined;
  if (!verb) {
    throw new ApiError(
      `unknown ${sourceName} command: ${verbName ?? '(none)'} — expected ${Object.keys(source).join(', ')}`,
      EXIT.USAGE,
    );
  }

  const { positional, flags } = parseArgs(rest);

  // --topic <slug> is mandatory on every call. Refused rather than defaulted: without
  // a topic there is nowhere to cache, and a silent no-op means a run that looks
  // complete having saved nothing.
  if (!flags.topic) throw new ApiError('--topic <slug> is required on every call', EXIT.USAGE);

  const config = loadOrCreateConfig();
  if (config === MALFORMED) {
    throw new ApiError('the digmore settings file could not be parsed', EXIT.NO_KEY);
  }
  // No key means the source is skipped, and the run says so. Not a failure.
  if (!config.apiKey) {
    throw new ApiError(
      `no digmore API key is configured, so the ${sourceName} source is unavailable — the run continues without it`,
      EXIT.NO_KEY,
    );
  }

  const ctx = { config, dir: cacheDir(flags.topic, sourceName) };
  return verb(ctx, positional, flags);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = await main(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (err) {
    process.stderr.write(`${JSON.stringify({ error: err.message })}\n`);
    process.exit(err instanceof ApiError ? err.exitCode : EXIT.FAILED);
  }
}
