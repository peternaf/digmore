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
 *   node api.mjs twitter vet    <handle>           --topic <slug> --tier 1|2|3
 *
 * stdout carries JSON, stderr carries errors.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrCreateConfig, MALFORMED } from './config.mjs';
import { assertWorkspaceRoot } from './fetch.mjs';

export const REQUEST_TIMEOUT_MS = 30000;

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

/** brain/subagents/branch_searcher_agent/reddit.md — search keys carry md5(query)[:10]. */
export function queryHash(query) {
  return createHash('md5').update(query, 'utf8').digest('hex').slice(0, 10);
}

/**
 * The sub segment of a search cache key. One file per request now that the API merges,
 * so the whole sub list has to be in the name.
 *
 * Order is preserved, never sorted: the first sub's hits rank above the second's, so
 * `--subreddit a --subreddit b` and `--subreddit b --subreddit a` are different queries
 * with different results and must not share a cache entry. Long lists collapse to a hash
 * rather than build a filename that trips the path limit.
 */
export function subsSegment(subs = []) {
  if (!subs.length) return 'sitewide';
  const joined = subs.join('+');
  return joined.length <= 60 ? joined : `${subs.length}subs-${queryHash(joined)}`;
}

// ---------------------------------------------------------------- http

const skip = (value) => value === undefined || value === null || value === '';

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
  try {
    response = await fetch(url, {
      headers: { 'X-API-KEY': config.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError('the digmore API could not be reached', EXIT.FAILED);
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
    const cacheKey = `reddit-search-${subsSegment(flags.subreddit)}-${sort}-${timeWindow}-${queryHash(query)}.json`;

    return cached(ctx, cacheKey, () =>
      request(ctx.config, '/v1/reddit/search', {
        query,
        subreddits: flags.subreddit,
        sort,
        time_window: timeWindow,
        limit: flags.limit ?? 20,
        after_date: flags.afterDate,
      }),
    );
  },

  async thread(ctx, [idOrPermalink], flags) {
    if (!idOrPermalink) throw new ApiError('reddit thread needs an id or permalink', EXIT.USAGE);
    const threadId = postId(idOrPermalink);
    return cached(ctx, `reddit-thread-${threadId}.json`, () =>
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
   * The brain fetched this as two requests and cached the verdict in a third, so the one
   * response is split back into the three filenames its resume paths and sub-agents read.
   */
  async user(ctx, [name]) {
    if (!name) throw new ApiError('reddit user needs a name', EXIT.USAGE);
    const aboutKey = `reddit-user-about-${name}.json`;
    const commentsKey = `reddit-user-comments-${name}.json`;
    const vetKey = `reddit-vet-${name}.json`;

    const about = readCache(ctx.dir, aboutKey);
    const comments = readCache(ctx.dir, commentsKey);
    const vetted = readCache(ctx.dir, vetKey);
    if (about !== undefined && comments !== undefined && vetted !== undefined) {
      return { ...about, recent_comments: comments, ...vetted };
    }

    const user = await request(ctx.config, `/v1/reddit/user/${encodeURIComponent(name)}`);
    const { recent_comments: recentComments = [], verdict, signals, reason, ...profile } = user ?? {};
    writeCache(ctx.dir, aboutKey, profile);
    writeCache(ctx.dir, commentsKey, recentComments);
    writeCache(ctx.dir, vetKey, { verdict, signals, reason });
    return user;
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
      const cachedTweet = readCache(ctx.dir, `twitter-tweet-${tweetId}.json`);
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
        writeCache(ctx.dir, `twitter-tweet-${tweetId}.json`, tweet);
        found[tweetId] = tweet;
      }
    }

    return { tweets: tweetIds.map((tweetId) => found[tweetId]).filter(Boolean) };
  },

  async vet(ctx, [handle], flags) {
    if (!handle) throw new ApiError('twitter vet needs a handle', EXIT.USAGE);
    const tier = flags.tier;
    if (!['1', '2', '3'].includes(String(tier))) {
      throw new ApiError('twitter vet needs --tier 1, 2 or 3', EXIT.USAGE);
    }
    return cached(ctx, `twitter-vet-${handle}-tier${tier}.json`, () =>
      request(ctx.config, `/v1/twitter/vet/${encodeURIComponent(handle)}`, { tier }),
    );
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
