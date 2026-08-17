/**
 * Shared test scaffolding. Not a test file — `*.test.mjs` is the discovery pattern.
 *
 * Two things every script test needs: a throwaway HOME so ~/.digmore is not the real
 * one, and a throwaway working directory so digmore/<slug>/ lands somewhere disposable
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const script = (name) => join(repoRoot, 'skill', 'scripts', name);

/** A sandbox for one test: a fake home, a fake cwd, and a stub API. */
export class Sandbox {
  constructor() {
    this.home = mkdtempSync(join(tmpdir(), 'digmore-home-'));
    this.cwd = mkdtempSync(join(tmpdir(), 'digmore-cwd-'));
    this.requests = [];
    this.server = undefined;
  }

  async cleanup() {
    // Close the server first, and force sockets shut: server.close() alone waits for
    // keep-alive connections to end, which leaves the handle open and the test process
    // never exits.
    if (this.server) {
      const server = this.server;
      this.server = undefined;
      server.closeAllConnections?.();
      await new Promise((closed) => server.close(() => closed()));
    }
    // On Windows a directory that was a child's cwd can still be held briefly.
    for (const dir of [this.home, this.cwd]) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {
        // A leftover temp directory is not worth failing a test over.
      }
    }
  }

  /**
   * Stand-in for the digmore API, which is a separate repo that does not exist yet
   * `handler` receives (req, res, url).
   */
  async api(handler) {
    this.server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      this.requests.push({
        path: url.pathname,
        // Flattened for the common case; `params` keeps repeated keys like ?sub=a&sub=b.
        query: Object.fromEntries(url.searchParams),
        params: url.searchParams,
        key: req.headers['x-api-key'],
        authorization: req.headers.authorization,
      });
      handler(req, res, url);
    });
    await new Promise((listening) => this.server.listen(0, '127.0.0.1', listening));
    return `http://127.0.0.1:${this.server.address().port}`;
  }

  /** Reply to every request with the same JSON. The common case. */
  async apiReturning(payload, status = 200) {
    return this.api((req, res) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  }

  settings(config) {
    mkdirSync(join(this.home, '.digmore'), { recursive: true });
    writeFileSync(
      join(this.home, '.digmore', 'settings.json'),
      typeof config === 'string' ? config : JSON.stringify(config),
    );
  }

  /** A configured, working install pointed at the stub. */
  configured(baseUrl, key = 'sk-test') {
    this.settings({ apiBaseUrl: baseUrl, apiKey: key, apiDeclined: false });
  }

  cachePath(slug, branch, file) {
    return join(this.cwd, 'digmore', slug, 'cache', branch, file);
  }

  cached(slug, branch, file) {
    const path = this.cachePath(slug, branch, file);
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
  }

  writeCache(slug, branch, file, payload) {
    const path = this.cachePath(slug, branch, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(payload));
  }

  /**
   * Async on purpose: the stub API runs in this process, so a blocking spawnSync would
   * stop the event loop and the server could never accept the child's connection.
   */
  run(name, ...args) {
    return new Promise((resolveRun) => {
      const child = spawn(process.execPath, [script(name), ...args], {
        cwd: this.cwd,
        env: { ...process.env, HOME: this.home, USERPROFILE: this.home },
      });
      let out = '';
      let err = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => (out += chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk) => (err += chunk));
      child.on('close', (code) => resolveRun({ code, out, err, json: parse(out) }));
    });
  }
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
