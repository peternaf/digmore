/**
 * digmore configuration — the one file the plugin owns on the user's machine.
 *
 * Five fields: how to reach the API (apiBaseUrl, apiKey), whether the user declined a key
 * (apiDeclined), and the two ceilings that decide how much work a run does —
 * fetchesPerBranch and vetHandleCap. The plugin never touches the user's own Claude Code
 * settings.
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
 * The two run ceilings. Both are read by the skill at the start of a run, not by any
 * script — they bound how many sub-agents it dispatches and how much it fetches.
 *
 * `fetchesPerBranch` is per angle-source pair, not per source: a run with 6 angles and 5
 * sources has 30 branches, so this number multiplies by 30 rather than by 5. It counts
 * pages too: a paginated thread spends one per page.
 *
 * `vetHandleCap` bounds Vet, which is roughly half a run's network traffic and can meet
 * thousands of distinct handles on a busy topic.
 */
export const DEFAULT_FETCHES_PER_BRANCH = 20;
export const DEFAULT_VET_HANDLE_CAP = 50;

export const DEFAULTS = Object.freeze({
  apiBaseUrl: DEFAULT_API_BASE_URL,
  apiKey: null,
  apiDeclined: false,
  fetchesPerBranch: DEFAULT_FETCHES_PER_BRANCH,
  vetHandleCap: DEFAULT_VET_HANDLE_CAP,
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
 * A ceiling has to be a whole number above zero. Anything else — a string, a negative, a
 * zero that would silently stop the run doing any work — falls back to the default rather
 * than being carried into a run that then fetches nothing and looks complete.
 */
function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Keep exactly the five fields, in a stable order, whatever the file held. */
function normalise(raw) {
  return {
    apiBaseUrl: typeof raw?.apiBaseUrl === 'string' && raw.apiBaseUrl ? raw.apiBaseUrl : DEFAULT_API_BASE_URL,
    apiKey: typeof raw?.apiKey === 'string' && raw.apiKey ? raw.apiKey : null,
    apiDeclined: raw?.apiDeclined === true,
    fetchesPerBranch: positiveInteger(raw?.fetchesPerBranch, DEFAULT_FETCHES_PER_BRANCH),
    vetHandleCap: positiveInteger(raw?.vetHandleCap, DEFAULT_VET_HANDLE_CAP),
  };
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

/**
 * Created on first run, mode 0600; if unparseable, reported and never overwritten.
 * Returns MALFORMED rather than throwing, because preflight has a state for it.
 */
export function loadOrCreateConfig() {
  const path = configPath();
  if (!existsSync(path)) return writeConfig({ ...DEFAULTS });
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return MALFORMED;
  }
  try {
    // Strip a UTF-8 BOM. JSON.parse rejects one, and every Windows route to this file
    // adds it — Notepad, PowerShell's `-Encoding utf8`, plenty of editors. A user who
    // pasted their key in by hand would get MALFORMED and have no way to see why.
    const parsed = JSON.parse(text.replace(/^﻿/, ''));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return MALFORMED;
    return normalise(parsed);
  } catch {
    return MALFORMED;
  }
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
    fetchesPerBranch: config.fetchesPerBranch,
    vetHandleCap: config.vetHandleCap,
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
