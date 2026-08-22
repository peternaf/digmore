/**
 * digmore preflight — the configuration check, run before a research run does any work.
 *
 * SKILL.md runs it as its first step on every path, including the no-command one.
 * There is no hook, no shell prelude and no JSON envelope: stdout is the tool result
 * the model reads.
 *
 *   node preflight.mjs
 *
 * An unconfigured plugin is not an error. Every state it can report — NO_KEY, DECLINED,
 * READY, KEY_REJECTED, UNREACHABLE, MALFORMED — goes to stdout and exits 0, because each
 * is an answer the run degrades around. Exit 1 means the check itself could not run, and
 * stderr says why.
 */

import {
  loadOrCreateConfig,
  MALFORMED,
  configPath,
  configurationsFor,
  CONFIGURATION_NOTES,
  RECENCY_WINDOW_YEARS,
} from './config.mjs';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PING_TIMEOUT_MS = 5000;

/**
 * Two Claude Code ceilings a deep run hits. Both are the user's to raise, in their own
 * settings file, and the plugin never writes it — but a run that dies half way through
 * for want of a one-line edit is worth one sentence up front.

 */
export const WANTED_HARNESS_LIMITS = Object.freeze([
  {
    key: 'CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION',
    stock: 200,
    wanted: 1000,
    why: 'a deep run can use several hundred web searches; the stock ceiling is 200 and a run that hits it stops mid-way',
  },
  {
    key: 'CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS',
    stock: 20,
    wanted: 100,
    why: 'Extract fans out one sub-agent per branch — 25 or more at once — against a stock limit of 20, so the run is throttled into batches. Raise it only where 16GB or more of RAM is free for the run: a hundred agents each hold their own material, and on a machine that cannot feed them the run is slower rather than wider',
  },
]);

/**
 * What this run can actually see, read-only and best-effort.
 *
 * `process.env` is the authority: it carries whatever the harness applied, from any of
 * the places a limit can be set — the user's settings file, a project one, managed
 * policy, or a plain shell export. The user file is only a fallback for the case where
 * the value was configured but not exported into this process.
 *
 * A limit missing from both is not proof it is low, so the report says "not visible",
 * never "not set".
 */
/** Every place a Claude Code setting can live, weakest first — later wins. */
export function settingsFiles(cwd = process.cwd()) {
  const managed = {
    win32: 'C:\\ProgramData\\ClaudeCode\\managed-settings.json',
    darwin: '/Library/Application Support/ClaudeCode/managed-settings.json',
  }[process.platform] ?? '/etc/claude-code/managed-settings.json';

  return [
    join(homedir(), '.claude', 'settings.json'), // the user's own
    join(cwd, '.claude', 'settings.json'), // shared with the project
    join(cwd, '.claude', 'settings.local.json'), // this machine, this project
    managed, // enterprise policy, which outranks the rest
  ];
}

function envBlock(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
    return parsed?.env && typeof parsed.env === 'object' ? parsed.env : {};
  } catch {
    return {}; // absent or unreadable: skip it, never fail
  }
}

export function harnessSettingsEnv(cwd = process.cwd()) {
  const seen = {};
  for (const path of settingsFiles(cwd)) Object.assign(seen, envBlock(path));

  // Last word: what the harness actually applied to this process. Whatever produced it —
  // any of the files above, a shell export, something we cannot see — this is the value
  // the run will really get.
  for (const limit of WANTED_HARNESS_LIMITS) {
    if (process.env[limit.key] !== undefined) seen[limit.key] = process.env[limit.key];
  }
  return seen;
}

/** The limits we could not confirm are raised. */
export function harnessAdvice(env = harnessSettingsEnv()) {
  return WANTED_HARNESS_LIMITS.filter((limit) => {
    const current = Number(env[limit.key]);
    return !Number.isFinite(current) || current < limit.wanted;
  });
}

/**
 * Always report the numbers, not only the shortfall. A run that assumes the stock limits
 * batches its fan-out at 20 on a machine configured for 100, because prose in the brain
 * cannot know what the user set.
 */
export function harnessReport(env = harnessSettingsEnv()) {
  const found = WANTED_HARNESS_LIMITS.map((limit) => {
    const current = Number(env[limit.key]);
    return Number.isFinite(current)
      ? `  ${limit.key}: ${current}`
      : `  ${limit.key}: not visible to this run — assume the stock ${limit.stock}`;
  }).join('\n');

  const pending = harnessAdvice(env);
  const advice = pending.length
    ? `

Could not confirm these are raised:
${pending.map((limit) => `  - ${limit.key} — ${limit.why}`).join('\n')}

Mention it once, early, and let the user decide. They add this themselves; digmore never
edits that file. If an "env" block is already there, the lines go inside it, and a new
session is needed for it to take effect:

  {
    "env": {
${pending.map((limit) => `    "${limit.key}": "${limit.wanted}"`).join(',\n')}
    }
  }`
    : '';

  return `

digmore: HARNESS LIMITS — as this run sees them:
${found}

Use these numbers. Do not assume a default the user may have raised.${advice}`;
}

/**
 * digmore's own configurations, for the same reason `harnessReport` prints the harness's
 * limits: the brain names a default, the user's settings file is what actually applies, and
 * prose cannot know which. A run that assumes 20 on a machine set to 5 fetches four times
 * what the user allowed.
 */
export function configurationsReport(config) {
  if (config === MALFORMED) return '';

  const full = configurationsFor(config);
  const fast = configurationsFor(config, { fast: true });

  const rows = [];
  for (const [group, configurations] of Object.entries(full)) {
    for (const name of Object.keys(configurations)) {
      const fullValue = configurations[name];
      const fastValue = fast[group][name];
      rows.push({
        key: `${group}.${name}`,
        value: fastValue === fullValue ? String(fullValue) : `${fullValue} → ${fastValue}`,
        note: CONFIGURATION_NOTES[`${group}.${name}`] ?? '',
      });
    }
  }

  const keyWidth = Math.max(...rows.map((row) => row.key.length));
  const valueWidth = Math.max(...rows.map((row) => row.value.length));
  const lines = rows
    .map((row) => `  ${row.key.padEnd(keyWidth)}  ${row.value.padEnd(valueWidth)}  ${row.note}`.trimEnd())
    .join('\n');

  return `

digmore: RUN CONFIGURATIONS — from ${configPath()}:
${lines}

Use these numbers. They are the user's, not defaults to assume. Where two are shown, the
second applies in --fast; a single number applies in both. A zero means that step is skipped.

Recency cutoff for this run: ${recencyCutoff()}
Pass it as --after-date on every Reddit search, and use it wherever brain/recency.md asks for
today-minus-two-years. It is printed here because you have no clock: computed by hand it is a
different date on every step that needs one, and silently wrong when it is wrong.`;
}

/**
 * Today minus the recency window, as YYYY-MM-DD.
 *
 * brain/recency.md says "compute it at run start; never hardcode", which is right and gave no way
 * to do it. Left to improvise the run shells out to `node -e` with a hand-written Date, once per
 * step that needs a date — arithmetic an agent drifts off, and the same class of defect the run
 * log's timestamps exist to rule out.
 */
export function recencyCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - RECENCY_WINDOW_YEARS);
  return cutoff.toISOString().slice(0, 10);
}

/** The sources that need the API. Everything else runs either way. */
const API_SOURCES = 'Reddit and Twitter';
const FREE_SOURCES =
  'web search, Hacker News, Similarweb, forums and your own documents';

/**
 * The README offer, verbatim. Keep it byte-identical to README.md — a test compares
 * the two, and the wording is deliberate.
 */
const WAITLIST_OFFER = `To get access to enhanced online research results join our waiting list for the Digmore API access. You will get:

- Vetted Reddit posts and comments
- Twitter posts from vetted accounts
- Social media data sources: LinkedIn, Instagram, Facebook, YouTube — including transcripts
- Technical data sources: GitHub discussions, Stack Overflow answers
- Business data sources: Crunchbase, Owler/ZoomInfo
- Marketing data sources: SEO/GEO analysis, and Ahrefs for search keywords
- A large list of other online data sources
- No limits on websearch amounts (Claude Code has a 200 limit)

Join by emailing waitlist@digmore.ai.`;

export const STATES = Object.freeze({
  NO_KEY: 'NO_KEY',
  DECLINED: 'DECLINED',
  READY: 'READY',
  KEY_REJECTED: 'KEY_REJECTED',
  UNREACHABLE: 'UNREACHABLE',
  MALFORMED: 'MALFORMED',
});

/**
 * UNREACHABLE and KEY_REJECTED are kept apart on purpose: telling someone
 * their key is invalid when the network is down sends them to fix the wrong thing.
 *
 * `/v1/ping` answers 200 when the key is valid and 401 when it is not. The body is not
 * part of the contract, so only the status is read — a 200 with an empty body is READY.
 *
 * 401 and only 401 means a rejected key. V0.1 has no authorization layer, so a 403 can
 * only be a proxy or WAF blocking the request in transit; the key is fine, and it
 * resolves to UNREACHABLE like any other failure.
 */
export async function resolveState(config) {
  if (config === MALFORMED) return STATES.MALFORMED;
  if (!config.apiKey) return config.apiDeclined ? STATES.DECLINED : STATES.NO_KEY;

  let status;
  try {
    const response = await fetch(new URL('/v1/ping', config.apiBaseUrl), {
      headers: { 'X-API-KEY': config.apiKey },
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    status = response.status;
    // Drain the body even though nothing reads it. An unread response leaves the
    // keep-alive socket open, and a still-closing handle at exit aborts the process
    // on Windows: "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)", exit 127.
    // The report is already complete by then, so the crash looks like a failed check.
    await response.arrayBuffer().catch(() => {});
  } catch {
    return STATES.UNREACHABLE;
  }
  if (status === 200) return STATES.READY;
  if (status === 401) return STATES.KEY_REJECTED;
  return STATES.UNREACHABLE;
}

const degraded = `Run degraded: ${API_SOURCES} are skipped. ${capitalise(FREE_SOURCES)} still run.
Say so in the report and in the terminal output — a run states what it could not reach.`;

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** What the model is told, per state. */
export function report(state) {
  switch (state) {
    case STATES.READY:
      return `digmore: READY — the API key works. ${API_SOURCES} are available.`;

    case STATES.NO_KEY:
      return `digmore: NO_KEY — no API key is configured.
${degraded}

Tell the user they have two options, so that declining is offered rather than guessed at:
  1. Supply a key, and you will run:  node "\${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/config.mjs" set-key <value>
  2. Say they do not want one, and you will run:  node "\${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/config.mjs" decline
     — after which this offer stops appearing.

Show them this, as written:

${WAITLIST_OFFER}`;

    case STATES.DECLINED:
      return `digmore: DECLINED — the user has said they do not want an API key. No offer, and no API request was made.
${degraded}
If they change their mind, mention once that a key can be added with config.mjs set-key.`;

    case STATES.KEY_REJECTED:
      return `digmore: KEY_REJECTED — the API rejected the configured key.
Tell the user their key was rejected and that a new one comes from the waitlist, at waitlist@digmore.ai.
${degraded}`;

    case STATES.UNREACHABLE:
      return `digmore: UNREACHABLE — the API did not respond. This is not a bad key; say the API could not be reached.
${degraded}`;

    case STATES.MALFORMED:
      return `digmore: MALFORMED — the settings file could not be parsed, and has not been touched:
  ${configPath()}
Report the path to the user so they can fix or delete it.
${degraded}`;

    default:
      return `digmore: UNREACHABLE — unrecognised state.\n${degraded}`;
  }
}

async function main() {
  try {
    const config = loadOrCreateConfig();
    const state = await resolveState(config);
    process.stdout.write(`${report(state)}${configurationsReport(config)}${harnessReport()}\n`);
    process.exitCode = 0;
  } catch (error) {
    // Every state preflight knows about is reported on stdout and exits 0 — NO_KEY,
    // DECLINED, KEY_REJECTED, UNREACHABLE and MALFORMED are answers, not failures.
    // Reaching here means the check itself broke, which is a real error. Say what it was
    // rather than exiting silently, and let the code carry it: a check that cannot run is
    // worth knowing about, and the caller decides whether to continue.
    process.stderr.write(`digmore: preflight failed — ${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
