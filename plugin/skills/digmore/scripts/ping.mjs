/**
 * digmore ping — the plugin's one call to `/v1/ping` on the digmore API.
 *
 * The ping answers one question for the run: is the API there, and does it accept this key.
 * 200 means yes, 401 means the key was rejected, anything else means it could not be reached.
 * The body is not part of the contract and is never read.
 *
 * Alongside the key, the ping says which install is calling and why, so the API can tell a
 * first run from a later one, and a run from a key being set or declined. Everything it sends
 * is listed in `pingParameters` below and in the README under "What the ping sends". It never
 * carries the topic, the request, a path or a hostname.
 *
 * Two callers, and no others: `preflight.mjs` at the start of a run, and `config.mjs` when
 * the user sets or declines a key. This file imports nothing local — a caller hands it the
 * API address, the key and the install id — so `config.mjs` can import it without a cycle.
 *
 * A ping never throws and never retries. A caller that gets `undefined` back carries on.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PING_PATH = '/v1/ping';

/** With a key, the answer decides the run's state, so it is worth waiting for. */
export const PING_TIMEOUT_MS = 5000;

/** Without a key nothing depends on the answer, so a slow API must not hold the user up. */
export const KEYLESS_PING_TIMEOUT_MS = 2000;

/** Why the plugin is calling. */
export const PING_REASONS = Object.freeze({
  RUN: 'run',
  KEY_SET: 'key_set',
  KEY_DECLINED: 'key_declined',
});

/** Sent when the caller has nothing better, so a missing argument is never a failure. */
export const UNKNOWN = 'unknown';

/**
 * A command is a short lowercase word. Anything else is sent as UNKNOWN, which is what keeps
 * a topic or a sentence off the wire if one is ever passed here by mistake.
 */
const COMMAND_SHAPE = /^[a-z][a-z-]{0,31}$/;

export function safeCommand(value) {
  return typeof value === 'string' && COMMAND_SHAPE.test(value) ? value : UNKNOWN;
}

/**
 * A model id is one unbroken lowercase token — `claude-opus-5`, `claude-haiku-4-5-20251001`,
 * a `[1m]` suffix, a cloud provider's dotted or `@` form. No spaces, so a sentence cannot pass.
 */
const MODEL_SHAPE = /^[a-z0-9][a-z0-9.:@[\]_-]{0,79}$/;

export function safeModel(value) {
  return typeof value === 'string' && MODEL_SHAPE.test(value) ? value : UNKNOWN;
}

/**
 * The plugin's version, from the manifest the build wrote — or from package.json when the
 * scripts run from the source tree. Read rather than restated: package.json is where the
 * version is defined, and the build copies it into the manifest.
 */
export function pluginVersion() {
  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(scriptsDir, '..', '..', '..', '.claude-plugin', 'plugin.json'), // the built plugin
    join(scriptsDir, '..', '..', 'package.json'), // the source tree
  ];
  for (const path of candidates) {
    try {
      const version = JSON.parse(readFileSync(path, 'utf8'))?.version;
      if (typeof version === 'string' && version) return version;
    } catch {
      // Absent or unreadable: try the next one.
    }
  }
  return UNKNOWN;
}

/**
 * The query string for one ping. With no install id the ping goes out bare, exactly as it
 * did before installs had ids.
 *
 * `command`, `model`, `auto` and `fast` describe a run, so only a run sends them.
 */
export function pingParameters({ installId, newInstall = false, reason, command, model, auto = false, fast = false }) {
  const parameters = new URLSearchParams();
  if (!installId) return parameters;

  parameters.set('installId', installId);
  if (newInstall) parameters.set('newInstall', 'true');
  parameters.set('reason', reason);
  if (reason === PING_REASONS.RUN) {
    parameters.set('command', safeCommand(command));
    parameters.set('model', safeModel(model));
    parameters.set('auto', String(auto === true));
    parameters.set('fast', String(fast === true));
  }
  parameters.set('pluginVersion', pluginVersion());
  parameters.set('platform', process.platform);
  return parameters;
}

/**
 * Ping the API. Resolves to the HTTP status, or `undefined` when there was no answer.
 *
 * The key travels only as `X-API-KEY`, and only when there is one.
 */
export async function pingApi({ apiBaseUrl, apiKey, ...details }) {
  try {
    const url = new URL(PING_PATH, apiBaseUrl);
    url.search = pingParameters(details).toString();

    const response = await fetch(url, {
      headers: apiKey ? { 'X-API-KEY': apiKey } : {},
      signal: AbortSignal.timeout(apiKey ? PING_TIMEOUT_MS : KEYLESS_PING_TIMEOUT_MS),
    });
    // Drain the body even though nothing reads it. An unread response leaves the
    // keep-alive socket open, and a still-closing handle at exit aborts the process
    // on Windows: "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)", exit 127.
    // The caller's output is already complete by then, so the crash looks like its failure.
    await response.arrayBuffer().catch(() => {});
    return response.status;
  } catch {
    return undefined;
  }
}
