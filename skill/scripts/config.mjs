/**
 * digmore configuration — the one file the plugin owns on the user's machine.
 *
 * Three kinds of field: how to reach the API (apiBaseUrl, apiKey), whether the user
 * declined a key (apiDeclined), and the run ceilings — every number that bounds how much
 * work a run does. The plugin never touches the user's own Claude Code settings.
 *
 * Every ceiling lives here rather than in brain prose for one reason: prose is read and
 * obeyed on trust, and two real runs on 2026-08-17 applied 20 and 8 for the same cap with
 * nothing flagging the difference. A number in a file can be printed back by preflight and
 * recorded in run_history; a number in a sentence cannot.
 *
 * Used two ways:
 *   - imported by preflight.mjs, which reads the config to decide the run's state
 *   - invoked by SKILL.md when the user supplies a key or says they do not want one:
 *       node config.mjs set-key <value>
 *       node config.mjs decline
 *       node config.mjs show
 *
 * stdout carries JSON, stderr carries errors.
 * The api key is never printed: stdout is the session transcript.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_API_BASE_URL = 'https://api.digmore.ai';

/**
 * The run ceilings, full mode. Each is read at the start of a run and applied as given;
 * none is advisory. `--fast` overrides a subset of them — see FAST_DEFAULTS below.
 *
 * `fetchesPerBranch` is per angle-source pair, not per source: a run with 6 angles and 5
 * sources has 30 branches, so this number multiplies by 30 rather than by 5. It counts
 * pages too — a paginated thread spends one per page, bounded by `maxPagesPerDocument`.
 *
 * The three `twitterHandles*` ceilings bound how many HANDLES may be vetted at each depth,
 * not how many tweets are fetched. Depth is the API's business: the plugin sends
 * `--tier 1|2|3` and the API decides profile-only / +25 tweets / +100 tweets. The tier
 * numbers survive on the CLI because the API takes them; they are not a name for anything
 * here, so these fields are named for the depth they buy instead.
 *
 *   twitterHandlesProfileOnly        → --tier 1
 *   twitterHandlesWithSampledTweets  → --tier 2
 *   twitterHandlesWithDeepHistory    → --tier 3
 */
export const CEILING_DEFAULTS = Object.freeze({
  plan: { minAngles: 3, maxAngles: 6, scopingSearches: 10 },
  extract: { fetchesPerBranch: 20, maxPagesPerDocument: 5 },
  vet: { handleCap: 50 },
  synthesize: { expertsFollowed: 10, urlsPerExpert: 10, claimsFactChecked: 50, manualVerifyFlagCap: 15 },
  twitter: { handlesProfileOnly: 20, handlesWithSampledTweets: 20, handlesWithDeepHistory: 5 },
  hackernews: { commentDepth: 3, recentCommentsSampled: 50 },
  subagents: { repairAttempts: 1 },
});

/**
 * What `--fast` replaces. Only the keys that actually change are listed; anything absent
 * keeps its full-mode value. A zero means the step is skipped entirely, which is how fast
 * mode drops the two deeper Twitter vetting passes.
 *
 * The lower of the two always wins: a user who sets `vetHandleCap` to 10 gets 10 in fast
 * mode, not 20. Fast mode makes a run shallower, never deeper than the user allowed.
 */
const FAST_REDUCTIONS = Object.freeze({
  plan: { minAngles: 2, maxAngles: 2 },
  extract: { fetchesPerBranch: 5 },
  vet: { handleCap: 20 },
  synthesize: { expertsFollowed: 3, urlsPerExpert: 3, claimsFactChecked: 10, manualVerifyFlagCap: 5 },
  twitter: { handlesProfileOnly: 5, handlesWithSampledTweets: 0, handlesWithDeepHistory: 0 },
});

/**
 * The full tree again, with the reductions applied — every ceiling appears here, including
 * the ones fast mode leaves alone. Written out in full so the settings file shows every
 * knob that exists in both modes; a block listing only the reductions would hide the rest,
 * and a user cannot change a setting they cannot see.
 */
export const FAST_DEFAULTS = Object.freeze(
  Object.fromEntries(
    Object.entries(CEILING_DEFAULTS).map(([group, ceilings]) => [
      group,
      Object.freeze({ ...ceilings, ...(FAST_REDUCTIONS[group] ?? {}) }),
    ]),
  ),
);

/**
 * One line per ceiling, saying what it bounds. Kept beside the defaults so that adding a
 * ceiling and describing it are the same edit, and printed by preflight so the model reads
 * the number together with what it means.
 */
export const CEILING_NOTES = Object.freeze({
  'plan.minAngles': 'fewest research angles a run plans',
  'plan.maxAngles': 'most research angles a run plans',
  'plan.scopingSearches': 'web searches the scoping agent may spend',
  'extract.fetchesPerBranch': 'URLs per angle-source pair, pages included',
  'extract.maxPagesPerDocument': 'pages followed when one document paginates',
  'vet.handleCap': 'handles vetted per run, taken after ranking',
  'synthesize.expertsFollowed': 'vetted experts whose other writing is read',
  'synthesize.urlsPerExpert': 'URLs read per followed expert',
  'synthesize.claimsFactChecked': 'top-ranked claims checked against their source',
  'synthesize.manualVerifyFlagCap': 'inline manual-verify flags allowed in the summary',
  'twitter.handlesProfileOnly': 'handles vetted on profile alone (--tier 1)',
  'twitter.handlesWithSampledTweets': 'handles vetted on profile + sampled tweets (--tier 2)',
  'twitter.handlesWithDeepHistory': 'handles vetted on profile + deep history (--tier 3)',
  'hackernews.commentDepth': 'reply depth kept when a thread is flattened',
  'hackernews.recentCommentsSampled': 'recent comments read when vetting a handle',
  'subagents.repairAttempts': 'retries when a sub-agent return fails its shape check',
});

/**
 * Ceilings where zero is a real instruction — "do not do this step" — rather than a
 * mistake. Everything else falls back to its default when set to zero, because a run that
 * fetches nothing or vets nobody looks complete having done no work.
 */
const ZERO_IS_MEANINGFUL = new Set([
  'twitter.handlesProfileOnly',
  'twitter.handlesWithSampledTweets',
  'twitter.handlesWithDeepHistory',
  'synthesize.expertsFollowed',
  'synthesize.urlsPerExpert',
  'synthesize.manualVerifyFlagCap',
  'subagents.repairAttempts',
]);

export const DEFAULTS = Object.freeze({
  apiBaseUrl: DEFAULT_API_BASE_URL,
  apiKey: null,
  apiDeclined: false,
  ...CEILING_DEFAULTS,
  fast: { ...FAST_DEFAULTS },
});

/** Sentinel for a settings file that exists but cannot be parsed. Never overwritten. */
export const MALFORMED = Symbol('malformed');

/**
 * Resolved on every call rather than at import, so the home directory is whatever
 * the process actually has — which is what makes this testable.
 */
export function configDir() {
  return join(homedir(), '.digmore');
}

export function configPath() {
  return join(configDir(), 'settings.json');
}

/**
 * A ceiling has to be a whole number, and above zero unless zero means something for that
 * key. Anything else — a string, a negative, a fraction — falls back to the default rather
 * than being carried into a run that then does the wrong amount of work.
 */
function ceiling(path, value, fallback) {
  if (!Number.isInteger(value)) return fallback;
  if (value > 0) return value;
  return value === 0 && ZERO_IS_MEANINGFUL.has(path) ? 0 : fallback;
}

/** Two levels: a group of related ceilings, then the ceilings themselves. */
function normaliseCeilings(raw, defaults) {
  const result = {};
  for (const [group, ceilings] of Object.entries(defaults)) {
    result[group] = {};
    for (const [name, fallback] of Object.entries(ceilings)) {
      result[group][name] = ceiling(`${group}.${name}`, raw?.[group]?.[name], fallback);
    }
  }
  return result;
}

/** Keep exactly the known fields, in a stable order, whatever the file held. */
function normalise(raw) {
  return {
    apiBaseUrl: typeof raw?.apiBaseUrl === 'string' && raw.apiBaseUrl ? raw.apiBaseUrl : DEFAULT_API_BASE_URL,
    apiKey: typeof raw?.apiKey === 'string' && raw.apiKey ? raw.apiKey : null,
    apiDeclined: raw?.apiDeclined === true,
    ...normaliseCeilings(raw, CEILING_DEFAULTS),
    fast: normaliseCeilings(raw?.fast, FAST_DEFAULTS),
  };
}

/**
 * The ceilings a run actually applies, given its mode. Fast mode takes the lower of the
 * two, so a user who tightened a full-mode ceiling is never loosened by asking for a
 * shallower run — except where fast deliberately sets zero, which is a skip and wins.
 */
export function ceilingsFor(config, { fast = false } = {}) {
  const applied = normaliseCeilings(config, CEILING_DEFAULTS);
  if (!fast) return applied;
  const reductions = normaliseCeilings(config.fast, FAST_DEFAULTS);
  for (const [group, ceilings] of Object.entries(reductions)) {
    for (const [name, fastValue] of Object.entries(ceilings)) {
      if (!Object.hasOwn(applied[group] ?? {}, name)) continue;
      applied[group][name] = fastValue === 0 ? 0 : Math.min(applied[group][name], fastValue);
    }
  }
  return applied;
}

/** Write via a temp file in the same directory, so a crash cannot leave a half-written config. */
function writeConfig(config) {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const target = configPath();
  const temp = join(dir, `.settings.json.${process.pid}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, target);
  } catch (err) {
    rmSync(temp, { force: true });
    throw err;
  }
  return config;
}

function serialise(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Created on first run, mode 0600; if unparseable, reported and never overwritten.
 * Returns MALFORMED rather than throwing, because preflight has a state for it.
 *
 * A readable file is also completed in place: if a later version adds a ceiling, the
 * normalised shape carries it and the file on disk does not, so it is written back. Every
 * setting is then visible and editable without the user having to know it exists —
 * otherwise a knob added after install stays invisible forever. Existing values are kept,
 * since normalise() only replaces what is absent or invalid.
 */
export function loadOrCreateConfig() {
  const path = configPath();
  if (!existsSync(path)) return writeConfig(normalise(DEFAULTS));
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return MALFORMED;
  }
  let config;
  try {
    // Strip a UTF-8 BOM. JSON.parse rejects one, and every Windows route to this file
    // adds it — Notepad, PowerShell's `-Encoding utf8`, plenty of editors. A user who
    // pasted their key in by hand would get MALFORMED and have no way to see why.
    const parsed = JSON.parse(text.replace(/^﻿/, ''));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return MALFORMED;
    config = normalise(parsed);
  } catch {
    return MALFORMED;
  }
  // Only when it actually differs, so an unchanged file keeps its modification time and a
  // read-only home cannot turn a working run into a failed one.
  if (serialise(config) !== text) {
    try {
      writeConfig(config);
    } catch {
      // The in-memory config is complete either way; the run does not depend on the write.
    }
  }
  return config;
}

/**
 * Setting a key clears the flag, so there is no state where a key is present and
 * ignored.
 */
export function setKey(value) {
  const current = loadOrCreateConfig();
  if (current === MALFORMED) throw new Error(`cannot parse ${configPath()} — fix or delete it, then try again`);
  return writeConfig({ ...current, apiKey: value, apiDeclined: false });
}

/** The user said they do not want a key. */
export function decline() {
  const current = loadOrCreateConfig();
  if (current === MALFORMED) throw new Error(`cannot parse ${configPath()} — fix or delete it, then try again`);
  return writeConfig({ ...current, apiDeclined: true });
}

/** What is safe to print: everything except the key itself. */
export function report(config) {
  return {
    apiBaseUrl: config.apiBaseUrl,
    apiKeyConfigured: config.apiKey !== null,
    apiDeclined: config.apiDeclined,
    ...normaliseCeilings(config, CEILING_DEFAULTS),
    fast: normaliseCeilings(config.fast, FAST_DEFAULTS),
    path: configPath(),
  };
}

function fail(message) {
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(1);
}

function main(argv) {
  const [verb, ...rest] = argv;
  try {
    switch (verb) {
      case 'set-key': {
        const value = rest[0];
        if (!value) return fail('set-key needs the key as its argument');
        return void process.stdout.write(`${JSON.stringify(report(setKey(value)))}\n`);
      }
      case 'decline':
        return void process.stdout.write(`${JSON.stringify(report(decline()))}\n`);
      case 'show': {
        const config = loadOrCreateConfig();
        if (config === MALFORMED) return fail(`cannot parse ${configPath()} — fix or delete it, then try again`);
        return void process.stdout.write(`${JSON.stringify(report(config))}\n`);
      }
      default:
        return fail(`unknown command: ${verb ?? '(none)'} — expected set-key, decline or show`);
    }
  } catch (err) {
    return fail(err.message);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
