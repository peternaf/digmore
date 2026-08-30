/**
 * Enrichment's two mechanical steps — who the run follows, and which of their pages are new.
 *
 *   node expert_selection.mjs select --topic <slug> [--fast]
 *   node expert_selection.mjs dedupe --topic <slug>
 *
 * Both were the orchestrator's, and both made it read files it discarded almost all of.
 *
 * `select` is the whole of enrich_phase_d.md §"Who gets followed": filter to `legit` and on-topic,
 * keep each roster's existing order, round-robin across sources, stop at `enrich.expertsFollowed`.
 * Every clause of that is a field check or a fixed traversal — no judgement anywhere, which is the
 * test for whether a script should own it. What it cost by hand: four rosters read to choose ten
 * handles, with ~190 of ~200 rows read and thrown away, each carrying its pageSignals, its
 * documents list and now its vettingSignals. It also makes the choice REPRODUCIBLE — a model
 * round-robining four lists returns a different ten on a re-run, and this decides which experts the
 * run follows.
 *
 * `dedupe` runs later, after the searchers: two overlaps appear and only one of them is a choice.
 * The same URL in two experts' lists keeps one copy; a URL Extract already read is dropped
 * entirely, because the page and its claims are on disk and already in that source's report.
 *
 * Neither step ever puts a URL list or a roster row into the orchestrator's context: the searchers
 * write their lists to cache/_returns/ and return `done`, and this reads from there.
 *
 * stdout JSON, stderr errors.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertWorkspaceRoot, filenameOnlyFromUrl } from './fetch.mjs';
import { readHandlesFile, HANDLE_SOURCES } from './handle_vetting.mjs';
import { loadOrCreateConfig, configurationsFor, MALFORMED } from './config.mjs';
import { postId, tweetIdFromUrl, THREAD_CACHE_NAME, TWEET_CACHE_NAME } from './api.mjs';
import { storyIdFromUrl, STORY_CACHE_NAME } from './hackernews.mjs';

/** Relevance readings that count as on-topic. Anything below `low` was demoted to `unknown`. */
const ON_TOPIC = new Set(['high', 'medium', 'low']);

export function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    if (!rest[index].startsWith('--')) continue;
    const name = rest[index].slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = rest[index + 1];
    if (next === undefined || next.startsWith('--')) flags[name] = true;
    else {
      flags[name] = next;
      index += 1;
    }
  }
  return { verb, flags };
}

export function topicDir(topicSlug) {
  assertWorkspaceRoot();
  return join(process.cwd(), 'digmore', topicSlug);
}

function readJson(path) {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- select

/** Where vetting left this handle's material, which is the whole of what its searcher reads. */
export function vettingCachePath(source, handle) {
  const bare = String(handle).replace(/^(u\/|r\/|hn\/|x\/|@)/i, '');
  const name = {
    reddit: `reddit-vet-${bare}.json`,
    hackernews: `hackernews-vet-${bare}.json`,
    twitter: `twitter-vet-${bare}.json`,
  }[source];
  return name ? `cache/${source}/${name}` : undefined;
}

/**
 * The experts the run follows, in the order it follows them.
 *
 * **Round-robin, not source by source**, so one busy source cannot spend the whole budget: take the
 * first survivor from each roster, then the second from each, until the budget runs out.
 *
 * Forums has no vetting cache — no script vets it, so the Handle Vetter's own file is the whole
 * record and there is nothing new for a searcher to pick from. A forums expert is still selected
 * where one qualifies; its searcher returns empty, which is the honest answer rather than a
 * handful of pages the run already has claims from.
 */
export function select(topicSlug, { fast = false, budget } = {}) {
  const config = loadOrCreateConfig();
  if (config === MALFORMED) {
    throw new Error('cannot parse ~/.digmore/settings.json — fix or delete it, then try again');
  }
  const applied = configurationsFor(config, { fast: Boolean(fast) });
  const limit = Number.isInteger(Number(budget)) ? Number(budget) : applied.enrich.expertsFollowed;

  const perSource = new Map();
  const sourcesMissing = [];
  for (const source of HANDLE_SOURCES) {
    const file = readHandlesFile(topicSlug, source);
    if (!file) {
      sourcesMissing.push(source);
      continue;
    }
    // The roster's order IS the ranking — highest claim importance first, then document count.
    // It is what each handle contributed, and it was settled a phase ago.
    perSource.set(
      source,
      file.handles.filter((entry) => entry.verdict === 'legit' && ON_TOPIC.has(entry.topicalRelevance)),
    );
  }

  const experts = [];
  const depth = Math.max(0, ...[...perSource.values()].map((list) => list.length));
  for (let rank = 0; rank < depth && experts.length < limit; rank += 1) {
    for (const [source, list] of perSource) {
      if (experts.length >= limit) break;
      const entry = list[rank];
      if (!entry) continue;
      experts.push({
        handle: entry.handle,
        source,
        branch: `expert-${entry.handle.replace(/[^A-Za-z0-9._-]+/g, '_')}`,
        vettingCache: vettingCachePath(source, entry.handle),
      });
    }
  }

  return {
    experts,
    budget: limit,
    eligible: [...perSource.values()].reduce((total, list) => total + list.length, 0),
    sourcesRead: [...perSource.keys()],
    sourcesMissing,
  };
}

// ---------------------------------------------------------------- dedupe

/**
 * The cache filename Extract would have written for this URL, or undefined where the source has no
 * rule for it.
 *
 * Every pattern here is imported from the script that writes it. Deriving one locally would give a
 * name that stops matching the first time the owning script moves — and that failure is silent and
 * expensive: every page reads as new, and the run spends its whole expert budget re-reading what it
 * already has claims from.
 */
export function cacheNameForUrl(source, url) {
  if (source === 'reddit') return THREAD_CACHE_NAME(postId(url));
  if (source === 'twitter') {
    const id = tweetIdFromUrl(url);
    return id ? TWEET_CACHE_NAME(id) : undefined;
  }
  if (source === 'hackernews') {
    const id = storyIdFromUrl(url);
    return id ? STORY_CACHE_NAME(id) : undefined;
  }
  // websearch and forums go through fetch.mjs, which derives the name from the URL and chooses the
  // extension from the response — so the stem is what matches, not the whole filename.
  try {
    return filenameOnlyFromUrl(url);
  } catch {
    return undefined;
  }
}

/** The stems already in cache/<source>/, so a name matches whatever extension it was given. */
function cachedStems(topicSlug, source) {
  const directory = join(topicDir(topicSlug), 'cache', source);
  if (!existsSync(directory)) return new Set();
  const stems = new Set();
  for (const name of readdirSync(directory, { withFileTypes: true })) {
    if (!name.isFile()) continue; // handles/ is Vet's, and holds no documents
    const file = name.name;
    stems.add(file);
    stems.add(file.replace(/\.[^.]+$/, ''));
  }
  return stems;
}

/**
 * Which of the experts' URLs are worth a reader, and which were already read.
 *
 * **The tie between two experts is broken by round-robin order, never by relevance.** In Extract
 * every score inside a branch comes from one searcher, so "highest wins" compares like with like.
 * Here each expert has its own searcher scoring independently against the research question, so 0.8
 * from one and 0.7 from another is a coin flip wearing a ranking. A fixed rule gives the same
 * answer every run — and the fetch is charged to whichever expert appears first in `select`'s
 * order.
 */
export function dedupe(topicSlug, experts) {
  const returnsDir = join(topicDir(topicSlug), 'cache', '_returns');
  const stemsBySource = new Map();

  const kept = [];
  const seen = new Map(); // normalised url -> the expert that claimed it
  let alreadyRead = 0;
  let duplicates = 0;
  const listsMissing = [];

  for (const expert of experts) {
    const list = readJson(join(returnsDir, `branch-searcher-${expert.branch}.json`));
    if (!list) {
      listsMissing.push(expert.handle);
      continue;
    }
    if (!stemsBySource.has(expert.source)) {
      stemsBySource.set(expert.source, cachedStems(topicSlug, expert.source));
    }
    const stems = stemsBySource.get(expert.source);

    for (const candidate of list.results ?? []) {
      const url = normaliseUrl(candidate?.url);
      if (!url) continue;

      if (seen.has(url)) {
        duplicates += 1;
        continue;
      }
      seen.set(url, expert.handle);

      // Dropped entirely rather than kept and charged: the page and its claims are on disk, and
      // already in that source's report. Nothing is gained by reading it a second time.
      const name = cacheNameForUrl(expert.source, candidate.url);
      if (name && (stems.has(name) || stems.has(name.replace(/\.[^.]+$/, '')))) {
        alreadyRead += 1;
        continue;
      }

      kept.push({ url: candidate.url, title: candidate.title, handle: expert.handle, source: expert.source });
    }
  }

  return { toRead: kept, alreadyRead, duplicates, listsMissing };
}

/**
 * The same normalisation Extract's dedupe uses — trailing slash, scheme, a utm query, a fragment,
 * and old.reddit.com against www.reddit.com. Those are one URL.
 */
export function normaliseUrl(value) {
  if (!value) return undefined;
  try {
    const parsed = new URL(String(value));
    parsed.hash = '';
    parsed.protocol = 'https:';
    parsed.hostname = parsed.hostname.replace(/^(www|old|new|m)\./, '').toLowerCase();
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith('utm_')) parsed.searchParams.delete(key);
    }
    return `${parsed.host}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
  } catch {
    return String(value).trim().toLowerCase().replace(/\/+$/, '') || undefined;
  }
}

// ---------------------------------------------------------------- cli

export function run(argv) {
  const { verb, flags } = parseArgs(argv);
  if (!flags.topic) throw new Error('--topic <slug> is required');

  if (verb === 'select') {
    return select(flags.topic, { fast: flags.fast, budget: flags.budget });
  }
  if (verb === 'dedupe') {
    // The expert list comes back from `select`, which the orchestrator has already run — it is the
    // one thing this step needs that is not on disk, and it is a handful of handles.
    const selected = select(flags.topic, { fast: flags.fast, budget: flags.budget });
    return dedupe(flags.topic, selected.experts);
  }
  throw new Error(`unknown command: ${verb ?? '(none)'} — expected select or dedupe`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(`${JSON.stringify(run(process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exit(1);
  }
}
