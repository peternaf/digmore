/**
 * Extract's resume bookkeeping — what each branch already read, and what it has left.
 *
 *   node extract_resume.mjs worklist --topic <slug>
 *
 * One call, once, when a run re-enters Extract · Read.
 *
 * It exists for the same reason `handle_vetting.mjs prepare` does: the answer lives across every
 * receipt on disk, and reading them into a context to do arithmetic is the cost the file-first
 * arrangement exists to avoid. A resumed run needs two numbers per branch — how many pages it has
 * already fetched against its cap, and which of its URLs have no receipt — and both are sums over
 * `cache/_returns/`. Two sessions have each written their own throwaway version of this into
 * `cache/_misc/`, with their own hardcoded cap; this is the one that stays.
 *
 * **It writes nothing.** The orchestrator has to name URLs in the dispatches it builds next, so the
 * work list is what it holds rather than what it stores, and a file here would be a second writer
 * on a directory that already has one per agent.
 *
 * stdout JSON, stderr errors.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertWorkspaceRoot } from './fetch.mjs';
import { parseArgs, topicDir } from './handle_vetting.mjs';
import { loadOrCreateConfig, configurationsFor, MALFORMED } from './config.mjs';

const BRANCH_PREFIX = 'branch-searcher-';
const RECEIPT_PREFIX = 'page-analyst-';

export function returnsDir(topicSlug) {
  return join(topicDir(topicSlug), 'cache', '_returns');
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  } catch {
    return undefined; // an unreadable return is a missing one; the caller reports it
  }
}

/**
 * The comparable form of a URL, for deciding whether two references are one page.
 *
 * A fragment and a query are stripped because neither reaches a different document through
 * `fetch.mjs`, the trailing slash because a searcher and a receipt disagree about it freely, and
 * the scheme is normalised because a redirect to https is not a second page. Lowercased last, so
 * two spellings of one host compare equal.
 */
export function normaliseUrl(url) {
  return String(url)
    .trim()
    .replace(/[#?].*$/, '')
    .replace(/\/+$/, '')
    .replace(/^http:\/\//i, 'https://')
    .toLowerCase();
}

/**
 * The cap this resumed run finishes under, and where it came from.
 *
 * **The interrupted run's own recorded configuration wins.** `research_plan.json.run_history`
 * stores the values that applied, and the cache on disk was built to them: finishing a branch that
 * fetched 14 pages under a cap of 20 against a cap of 10 reads as a branch already over budget, and
 * mixing two budgets inside one branch's tally makes the number mean nothing. Today's settings are
 * the fallback for a topic whose history predates the field, and they are what a *re-run* uses —
 * that starts a run rather than finishing one.
 */
export function capFor(topicSlug, { cap } = {}) {
  if (cap !== undefined) return { cap: Number(cap), capSource: 'flag' };

  const plan = readJson(join(topicDir(topicSlug), 'research_plan.json'));
  const history = Array.isArray(plan?.run_history) ? plan.run_history : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const recorded = history[index]?.configurations?.extract?.fetchesPerBranch;
    if (Number.isInteger(recorded) && recorded > 0) {
      return { cap: recorded, capSource: 'run_history' };
    }
  }

  const config = loadOrCreateConfig();
  if (config === MALFORMED) {
    throw new Error('cannot parse ~/.digmore/settings.json — fix or delete it, then try again');
  }
  return { cap: configurationsFor(config, { fast: false }).extract.fetchesPerBranch, capSource: 'settings' };
}

/**
 * Every branch that has a searcher file, and the URLs it may read.
 *
 * **A URL two branches found belongs to the one that scored it highest**, which is the rule the
 * dedupe applied when the run was whole (`phases/extract_phase_b.md` §Dedupe). Reproducing it here
 * rather than charging the URL twice is what keeps a resumed branch's tally the same number an
 * unbroken run would have reached. A tie goes to the branch whose name sorts first, so two runs
 * over one cache agree.
 */
export function readBranches(topicSlug) {
  const dir = returnsDir(topicSlug);
  if (!existsSync(dir)) return { branches: {}, unreadable: [] };

  const unreadable = [];
  const claimed = new Map(); // normalised url -> { branch, relevance }

  for (const file of readdirSync(dir).sort()) {
    if (!file.startsWith(BRANCH_PREFIX) || !file.endsWith('.json')) continue;
    const branch = file.slice(BRANCH_PREFIX.length, -'.json'.length);
    const contents = readJson(join(dir, file));
    if (!contents || !Array.isArray(contents.results)) {
      unreadable.push(file);
      continue;
    }
    for (const result of contents.results) {
      if (!result?.url) continue;
      const key = normaliseUrl(result.url);
      const relevance = Number(result.relevance) || 0;
      const holder = claimed.get(key);
      if (!holder || relevance > holder.relevance) {
        claimed.set(key, { branch, relevance, url: result.url });
      }
    }
  }

  const branches = {};
  for (const file of readdirSync(dir).sort()) {
    if (!file.startsWith(BRANCH_PREFIX) || !file.endsWith('.json')) continue;
    branches[file.slice(BRANCH_PREFIX.length, -'.json'.length)] = [];
  }
  for (const [key, holder] of claimed) {
    branches[holder.branch].push({ url: holder.url, key });
  }
  return { branches, unreadable };
}

/**
 * Every receipt on disk, keyed by the URL it is for.
 *
 * **Receipts are matched to branches by URL, never by the label on the file.** A label names the
 * batch, and a batch's name is the orchestrator's own invention — parsing a branch back out of it
 * is a guess that breaks the first time a repair pass names a file differently. The URL is on the
 * receipt because the orchestrator matches the batch it sent against what came back, and it is the
 * one thing that identifies a page across both files.
 */
export function readReceipts(topicSlug) {
  const dir = returnsDir(topicSlug);
  if (!existsSync(dir)) return { receipts: new Map(), unreadable: [] };

  const unreadable = [];
  const receipts = new Map();
  for (const file of readdirSync(dir).sort()) {
    if (!file.startsWith(RECEIPT_PREFIX) || !file.endsWith('.json')) continue;
    const contents = readJson(join(dir, file));
    if (!Array.isArray(contents)) {
      unreadable.push(file);
      continue;
    }
    for (const receipt of contents) {
      if (!receipt?.url) continue;
      const key = normaliseUrl(receipt.url);
      // A URL read twice is one page read twice; keep the first and let the pages count once.
      if (receipts.has(key)) continue;
      receipts.set(key, { pagesRead: Number(receipt.pagesRead) || 0, outcome: receipt.outcome });
    }
  }
  return { receipts, unreadable };
}

/**
 * What is left to read, per branch.
 *
 * A branch is one of three things and the caller acts differently on each: **capped**, having spent
 * its budget, which is finished whether or not URLs remain; **outstanding**, with budget and URLs
 * both left; and **exhausted**, having read everything its searcher found while still under the
 * cap. Only the second is work. Saying which of the other two a branch is matters because they are
 * different findings — one spent its budget, the other ran out of material — and a resumed run that
 * reports them together cannot say whether the topic was under-searched.
 */
export function worklist(topicSlug, options = {}) {
  const { cap, capSource } = capFor(topicSlug, options);
  const { branches, unreadable: badBranches } = readBranches(topicSlug);
  const { receipts, unreadable: badReceipts } = readReceipts(topicSlug);

  const claimedKeys = new Set();
  for (const urls of Object.values(branches)) for (const { key } of urls) claimedKeys.add(key);

  const rows = [];
  for (const branch of Object.keys(branches).sort()) {
    const urls = branches[branch];
    let pagesRead = 0;
    let urlsRead = 0;
    const remaining = [];
    for (const { url, key } of urls) {
      const receipt = receipts.get(key);
      if (!receipt) {
        remaining.push(url);
        continue;
      }
      urlsRead += 1;
      pagesRead += receipt.pagesRead;
    }
    const budgetLeft = Math.max(0, cap - pagesRead);
    rows.push({
      branch,
      pagesRead,
      urlsRead,
      urlsTotal: urls.length,
      budgetLeft,
      remaining,
      state: budgetLeft === 0 ? 'capped' : remaining.length ? 'outstanding' : 'exhausted',
    });
  }

  return {
    cap,
    capSource,
    branches: rows,
    // A receipt for a URL no branch lists: reported, never counted, because it belongs to a branch
    // whose searcher file is gone and charging it anywhere would be an invention.
    orphanReceipts: [...receipts.keys()].filter((key) => !claimedKeys.has(key)),
    unreadable: [...badBranches, ...badReceipts],
    outstanding: rows.filter((row) => row.state === 'outstanding').length,
    urlsLeft: rows.reduce((total, row) => total + (row.state === 'outstanding' ? row.remaining.length : 0), 0),
  };
}

// ---------------------------------------------------------------- cli

export function run(argv) {
  const { verb, flags } = parseArgs(argv);
  if (!flags.topic) throw new Error('--topic <slug> is required');
  assertWorkspaceRoot();
  if (verb === 'worklist') return worklist(flags.topic, { cap: flags.cap });
  throw new Error(`unknown command: ${verb ?? '(none)'} — expected worklist`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(`${JSON.stringify(run(process.argv.slice(2)), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exit(1);
  }
}
