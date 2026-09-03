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
 *   node api.mjs reddit  search --branch <label> --query <q> [--query <q>…] --topic <slug> [--fast] [--sort ...] [--time-window ...] [--limit 20] [--after-date YYYY-MM-DD]
 *   node api.mjs reddit  thread <id-or-permalink>... --topic <slug> [--limit 500]
 *   node api.mjs reddit  user   <name>...          --topic <slug>   # snapshots + verdicts
 *   node api.mjs twitter user   <handle>           --topic <slug>
 *   node api.mjs twitter tweets <handle>           --topic <slug> [--limit 25]
 *   node api.mjs twitter tweet  <tweet-id>...      --topic <slug>
 *   node api.mjs twitter vet    <handle>           --topic <slug> --posts <n>
 *
 * stdout carries JSON, stderr carries errors.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrCreateConfig, configurationsFor, MALFORMED } from './config.mjs';
import { assertWorkspaceRoot } from './fetch.mjs';

export const REQUEST_TIMEOUT_MS = 30000;

/**
 * What a batched call is given on top of REQUEST_TIMEOUT_MS, per item in the batch.
 *
 * A flat 30s was sized for a request that fetches one thing. A batched one fetches as many
 * things as it was sent, sequentially upstream, so the time it needs is a function of the
 * batch — and a batch that outgrows the timeout fails as "the digmore API could not be
 * reached", which reads as the API being down when it is answering perfectly well.
 *
 * Measured against `/v1/reddit/users`: 5 profiles in 14.9s, 25 in 40.3s — about 9s fixed
 * and 1.3s per profile. 4s each is roughly three times that, which is the headroom for an
 * account whose history is long or a session that has to clear a challenge first.
 *
 * MAX_BATCH_TIMEOUT_MS bounds the worst hang, because a timeout that scales without a
 * ceiling stops being a timeout. At the largest batch either endpoint accepts it is still
 * twice the measured time.
 */
export const BATCH_TIMEOUT_PER_ITEM_MS = 4000;
export const MAX_BATCH_TIMEOUT_MS = 300000;

/** What one batched call of `count` items is allowed before it is called unreachable. */
export function batchTimeoutMs(count) {
  return Math.min(MAX_BATCH_TIMEOUT_MS, REQUEST_TIMEOUT_MS + BATCH_TIMEOUT_PER_ITEM_MS * count);
}

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

/**
 * What one call to each batched endpoint accepts, straight from the API's own limits.
 * A longer list is split into as many calls as it takes; the caller never chunks.
 */
const MAX_TWEET_IDS_PER_CALL = 100;
const MAX_THREAD_IDS_PER_CALL = 20;
const MAX_USER_NAMES_PER_CALL = 100;

/** The most results one Reddit search returns, which is also the endpoint's own maximum. */
const MAX_SEARCH_LIMIT = 20;

/** Exit codes. Every caller of this script sources on these. */
export const EXIT = Object.freeze({
  OK: 0,
  FAILED: 1, // network, timeout, 5xx
  UNAVAILABLE: 3, // the source is temporarily unavailable
  NO_KEY: 4, // the source is disabled, not failed
  REJECTED: 5, // 401 — and only 401; see request()
  USAGE: 2, // a bad invocation — nothing was attempted
});

class ApiError extends Error {
  constructor(message, exitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}

// ---------------------------------------------------------------- args

/** Flags that are a switch rather than a name-and-value pair. */
const BARE_FLAGS = new Set(['fast']);

/**
 * Minimal argv parsing. These are called by the skill through Bash, never by a user.
 *
 * A flag given once is its value; a flag repeated becomes the list of them, in order. That is
 * how `reddit search` takes several `--query` in one call. A caller that expects one value is
 * unaffected, because a single occurrence is still a string — `flagList` below is for the
 * callers that want the repeats either way.
 */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const key = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    // `--fast` is a bare token everywhere else in the plugin, so it carries no value here either.
    if (BARE_FLAGS.has(key)) {
      flags[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new ApiError(`${token} needs a value`, EXIT.USAGE);
    }
    index += 1;
    if (!Object.hasOwn(flags, key)) {
      flags[key] = value;
    } else if (Array.isArray(flags[key])) {
      flags[key].push(value);
    } else {
      flags[key] = [flags[key], value];
    }
  }
  return { positional, flags };
}

/** One flag's values as a list, whether it was given once, many times, or not at all. */
export function flagList(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
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
 * A search cache name is two hashes, and the name IS the identity:
 *
 *   reddit-search-<hash5 of the branch>-<hash5 of the query>.json
 *
 * Both halves are load-bearing, for different reasons.
 *
 * The branch half is what makes the cap enforceable. A branch's own files are its ledger —
 * count the ones sharing its prefix and that is what it has spent, recounted from disk on every
 * call, so no tally has to survive a process. `reddit.searchesPerBranch` bounds that count.
 *
 * The query half is what makes a duplicate free to detect. A repeated query resolves to a
 * filename that already exists, so a repeat is a directory check rather than a file read, and
 * two different queries can never land on one name.
 *
 * This replaces four readable words of the query, which could collide and needed a `-2`, `-3`
 * probe to settle. Readability was the point of that name and it is genuinely lost — the trade is
 * that identity is now exact and free, and `_request` inside each file still records verbatim what
 * was asked.
 *
 * The branch is supplied by the caller, which a cache key normally must never be. It is safe here
 * because the label is assigned by Plan and carried unchanged through
 * `_returns/branch-searcher-<branch>.json` and `_progress/branch-searcher-<branch>.log` — not a
 * string an agent composes, so two dispatches of one branch cannot disagree about it.
 */
const HASH_CHARACTERS = 5;

/** Short, stable and platform-independent: the first few hex characters of a sha256. */
export function hash5(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex').slice(0, HASH_CHARACTERS);
}

/** Every file one branch has written, whatever the query. */
export function searchCachePrefix(branch) {
  return `reddit-search-${hash5(branch)}-`;
}

export function searchCacheName(branch, query) {
  return `${searchCachePrefix(branch)}${hash5(query)}.json`;
}

/**
 * The filenames one branch has already written. This is the ledger — read from disk on every
 * call, so nothing has to be carried between them and a killed run loses no accounting.
 */
export function branchSearchFiles(dir, branch) {
  const prefix = searchCachePrefix(branch);
  if (!existsSync(dir)) return new Set();
  return new Set(readdirSync(dir).filter((file) => file.startsWith(prefix) && file.endsWith('.json')));
}

/**
 * Everything that makes one search different from another, stored inside the cache file
 * and compared on read.
 */
export function searchRequestKey({ query, sort, timeWindow, limit, afterDate }) {
  return {
    query: String(query),
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

async function request(config, path, params = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const url = new URL(path, config.apiBaseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (skip(value)) continue;
    url.searchParams.set(key, String(value));
  }

  let response;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: { 'X-API-KEY': config.apiKey },
        signal: AbortSignal.timeout(timeoutMs),
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
    return await response.json();
  } catch {
    throw new ApiError('the digmore API returned a body that is not JSON', EXIT.FAILED);
  }
}

// ---------------------------------------------------------------- reddit

const reddit = {
  /**
   * Every search one branch gets, in one call. Site-wide, as before: there is no subreddit
   * restriction, and the searcher does not follow a site-wide pass with a scoped one — see
   * brain/subagents/branch_searcher_agent/reddit.md.
   *
   * What is new is the bound. A branch was told in prose to search once, and a measured run
   * wrote 25 files across 6 branches instead — four rewordings on one angle, no error anywhere.
   * A rule an agent can drift past is not a rule, so the count now comes off disk:
   * `searchCachePrefix` names every file this branch has written, and `reddit.searchesPerBranch`
   * is how many it may have. Recounted per call, so it survives a killed run for free.
   *
   * **A query already on disk is served whatever the count says.** It occupies one of the
   * branch's slots and frees nothing — but refusing it would strand a searcher that died before
   * writing its list and came back for results it had already paid for. Only a query with no
   * file spends budget.
   *
   * Each response is written before the next request goes out, so a run killed mid-batch keeps
   * whole files rather than a partial one.
   *
   * `sort` is sent and kept in the cache key even though the API accepts it and ignores it
   * — results are always ordered by descending relevance. Dropping it from the request
   * would invalidate every stored search key and buy nothing.
   *
   * `time_window` and `after_date` are hints, not filters. Both are forwarded upstream and
   * neither reliably excludes older posts, so a run states its window rather than trusting
   * it. brain/recency.md holds what that means for the report.
   */
  async search(ctx, _positional, flags) {
    const branch = flags.branch;
    if (!branch) throw new ApiError('reddit search needs --branch <label>', EXIT.USAGE);

    // Named, never positional: a call carries several queries now, and a bare word among them
    // could not be told from a mistyped flag value.
    const queries = flagList(flags.query);
    if (!queries.length) throw new ApiError('reddit search needs at least one --query', EXIT.USAGE);

    const sort = flags.sort ?? 'relevance';
    // The API's default too. The 2-year window of
    // brain/recency.md is `--time-window all --after-date <today-minus-2y>`, passed
    // by the caller.
    const timeWindow = flags.timeWindow ?? 'year';
    const limit = Number(flags.limit ?? MAX_SEARCH_LIMIT);
    // 1 to MAX_SEARCH_LIMIT is the endpoint's own range, so a value outside it can only
    // ever be a round trip spent on a 422. Refuse it here rather than pay for it.
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
      throw new ApiError(
        `reddit search --limit must be a whole number from 1 to ${MAX_SEARCH_LIMIT}`,
        EXIT.USAGE,
      );
    }

    const cap = configurationsFor(ctx.config, { fast: ctx.fast }).reddit.searchesPerBranch;
    const alreadyStored = branchSearchFiles(ctx.dir, branch);
    const fresh = queries.filter((query) => !alreadyStored.has(searchCacheName(branch, query)));
    let budget = Math.max(0, cap - alreadyStored.size);

    if (fresh.length && budget === 0) {
      throw new ApiError(
        `reddit search: branch ${branch} has already run its ${cap} searches. ` +
          `Their results are in ${ctx.dir} — read those files rather than searching again.`,
        EXIT.USAGE,
      );
    }

    const results = {};
    const refused = [];
    let fetched = 0;
    for (const query of queries) {
      const key = searchCacheName(branch, query);
      if (!alreadyStored.has(key)) {
        if (budget === 0) {
          refused.push(query);
          continue;
        }
        budget -= 1;
        fetched += 1;
      }
      const requestKey = searchRequestKey({ query, sort, timeWindow, limit, afterDate: flags.afterDate });
      // Awaited one at a time on purpose: the file for this query is on disk before the next
      // request is sent, which is what a kill mid-batch leaves behind.
      results[query] = await cachedSearch(ctx, key, requestKey, () =>
        request(ctx.config, '/v1/reddit/search', {
          query,
          sort,
          time_window: timeWindow,
          limit,
          after_date: flags.afterDate,
        }),
      );
    }

    // Keyed by query, as `thread` is keyed by id: the caller has to know which one failed or was
    // refused. `refused` reaches the orchestrator through the searcher, which is the only way an
    // overspent branch becomes visible in the run's Issues rather than only in the agent.
    //
    // `fetched` is requests actually made and `stored` is what the branch has spent of its cap.
    // They differ whenever a call is served from cache, which is every resumed dispatch — a single
    // number covering both would report searches that never happened.
    return {
      branch,
      cap,
      fetched,
      stored: alreadyStored.size + fetched,
      refused,
      results,
    };
  },

  /**
   * Many threads in one call. The endpoint takes ids, permalinks or full URLs; this sends
   * the normalised ids so that what comes back is keyed by something the caller can look
   * up, rather than by whichever form it happened to pass in.
   *
   * The result is keyed rather than a list, because the caller has to know *which* id
   * failed. A list that silently drops the failures reads as a shorter thread set, which
   * is the one thing extract_phase_b.md forbids: a source nobody could read must never
   * look like a source that came back empty.
   */
  async thread(ctx, idsOrPermalinks, flags) {
    if (!idsOrPermalinks.length) {
      throw new ApiError('reddit thread needs one or more ids or permalinks', EXIT.USAGE);
    }
    const threads = await keyedBatch(ctx, idsOrPermalinks.map(postId), {
      cacheName: THREAD_CACHE_NAME,
      path: '/v1/reddit/threads',
      param: 'thread_ids',
      params: { limit: flags.limit ?? 500 },
      perCall: MAX_THREAD_IDS_PER_CALL,
    });
    return { threads };
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
   * Many handles per call, one file each: the vetting record for one handle is its profile,
   * its comments and its verdict together, whatever size batch fetched it. A Handle Vetter
   * serving a range of ten spends one request and leaves ten files.
   */
  async user(ctx, names) {
    if (!names.length) throw new ApiError('reddit user needs one or more names', EXIT.USAGE);
    const users = await keyedBatch(ctx, names, {
      cacheName: USER_CACHE_NAME,
      path: '/v1/reddit/users',
      param: 'names',
      perCall: MAX_USER_NAMES_PER_CALL,
    });
    return { users };
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

/**
 * The two batched Reddit endpoints, which behave identically: send a comma-separated list,
 * get back an object keyed by exactly what was sent, each value either the record or a
 * short string saying why that one failed. One bad id never costs the rest of the batch,
 * so the call still returns 200 and a failure arrives per item rather than as a status.
 *
 * Only the cache misses are requested, and the answer is fanned out to one file per item —
 * the same filenames a single-item fetch used to write, so resume and the salvage paths in
 * brain/phases/index.md still find what they look for.
 *
 * **A failure is cached too, as a tombstone.** Without one, the next thing that wants that
 * id — later in this run, or after a resume — asks again and gets the same answer, and a
 * batch of twenty dead handles is re-requested every time anything touches it. A tombstone
 * is an ordinary cache hit, so nothing ever asks twice. It is stored as an object rather
 * than the bare string so that a reader cannot mistake it for a record. Neither reason is
 * retried: `not found` can never succeed, and `unavailable` is not re-tried by decision.
 * Deleting the file is how a re-fetch is forced.
 *
 * A key the API omits entirely is treated as `unavailable` rather than skipped, because the
 * alternative is an item that is neither a record nor a failure and never becomes either.
 */
async function keyedBatch(ctx, keys, { cacheName, path, param, params = {}, perCall }) {
  const found = {};
  const missing = [];
  for (const key of keys) {
    const hit = readCache(ctx.dir, cacheName(key));
    if (hit === undefined) missing.push(key);
    else found[key] = hit;
  }

  for (let start = 0; start < missing.length; start += perCall) {
    const batch = missing.slice(start, start + perCall);
    const payload = await request(
      ctx.config,
      path,
      { ...params, [param]: batch.join(',') },
      batchTimeoutMs(batch.length),
    );
    for (const key of batch) {
      const value = payload?.[key];
      const record =
        value && typeof value === 'object'
          ? value
          : { fetchFailed: String(value ?? 'unavailable'), failedAt: new Date().toISOString() };
      writeCache(ctx.dir, cacheName(key), record);
      found[key] = record;
    }
  }

  return found;
}

/**
 * The search cache. One query, one file, and the name settles which — there is no probing,
 * because a hash of the query cannot land on another query's file.
 *
 * `_request` is still written and still compared. It is no longer disambiguating anything; it is
 * the record of exactly what was asked, which is what the Source Analyst reads now that the
 * filename says nothing a person can read. A stored request that does not match — the same query
 * asked with a different sort, window or limit — is treated as a miss and re-fetched over, since
 * the newer request is the one the caller wants.
 */
async function cachedSearch(ctx, key, requestKey, fetcher) {
  const hit = readCache(ctx.dir, key);
  if (hit !== undefined && JSON.stringify(hit._request ?? null) === JSON.stringify(requestKey)) {
    return hit;
  }

  const fresh = await fetcher();
  // A bare array is accepted from the API; store it under `results` so `_request` has
  // somewhere to sit beside it and the file still reads as the search response.
  const body = Array.isArray(fresh) ? { results: fresh } : { ...fresh };
  const stored = { _request: requestKey, ...body };
  writeCache(ctx.dir, key, stored);
  return stored;
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
export const USER_CACHE_NAME = (name) => `reddit-vet-${name}.json`;
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

  const ctx = { config, dir: cacheDir(flags.topic, sourceName), fast: flags.fast === true };
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
