import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { repoRoot } from './helpers.mjs';

const PLUGIN = join(repoRoot, 'plugin');
const SKILL_IN_PLUGIN = join(PLUGIN, 'skills', 'digmore');

/**
 * Run the suite through `npm test`, which passes `--test-concurrency=1`.
 *
 * This file both deletes `plugin/` (every `build()` call) and spawns child processes
 * that execute files inside it. On Windows a just-exited child can still hold a handle,
 * and under the parallel load of the full suite that window widened enough to fail the
 * next `rmSync` with EPERM — intermittently, and taking unrelated tests down with it.
 * Serialising the run removed it. The handle race is the suspected cause rather than a
 * proven one, so if this reappears, start there.
 */
function build() {
  const result = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'build.js')], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

before(build);

/** Every file under dir, as path -> bytes, so two builds can be compared exactly. */
function snapshot(dir) {
  const files = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.set(relative(dir, full).split(sep).join('/'), readFileSync(full));
    }
  };
  walk(dir);
  return files;
}

test('the build produces the documented plugin layout', () => {
  assert.ok(existsSync(join(PLUGIN, '.claude-plugin', 'plugin.json')), 'the real manifest');
  assert.ok(existsSync(join(SKILL_IN_PLUGIN, 'SKILL.md')), 'skills/<name>/SKILL.md is the default location');
  for (const dir of ['reference', 'brain', 'scripts']) {
    assert.ok(existsSync(join(SKILL_IN_PLUGIN, dir)), `skills/digmore/${dir}`);
  }
  assert.ok(existsSync(join(repoRoot, '.claude-plugin', 'marketplace.json')), 'the marketplace entry');
});

test('two runs produce byte-identical output', () => {
  build();
  const first = snapshot(PLUGIN);
  build();
  const second = snapshot(PLUGIN);
  assert.deepEqual([...second.keys()], [...first.keys()], 'the same files');
  for (const [path, bytes] of first) {
    assert.ok(bytes.equals(second.get(path)), `${path} differs between builds`);
  }
});

test('the built skill is a byte-for-byte copy of the source skill', () => {
  const source = snapshot(join(repoRoot, 'skill'));
  const built = snapshot(SKILL_IN_PLUGIN);
  assert.deepEqual([...built.keys()].sort(), [...source.keys()].sort());
  for (const [path, bytes] of source) {
    assert.ok(bytes.equals(built.get(path)), `${path} was altered in the build`);
  }
});

// A plugin's settings.json supports only `agent` and `subagentStatusLine`, so an env
// entry would be read and ignored. None ships.
test('no settings.json anywhere in the built plugin', () => {
  for (const path of snapshot(PLUGIN).keys()) {
    assert.ok(!path.endsWith('settings.json'), `found ${path}`);
  }
});

// Without this, a file deleted from skill/ would linger in plugin/ forever and the
// committed build output would stop matching the source.
test('the build removes files that are gone from the source', () => {
  build();
  const stray = join(SKILL_IN_PLUGIN, 'stray-from-an-older-build.md');
  writeFileSync(stray, 'left over from a previous build');
  assert.ok(existsSync(stray));
  build();
  assert.ok(!existsSync(stray), 'a stale file does not survive a rebuild');
});

// CLAUDE_PLUGIN_ROOT is the directory holding .claude-plugin/, which is
// plugin/, so every in-skill path must be ${CLAUDE_PLUGIN_ROOT}/skills/digmore/...
test('every ${CLAUDE_PLUGIN_ROOT} path in the built tree resolves to a real file', () => {
  const files = snapshot(PLUGIN);
  const pattern = /\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_\-./]+)/g;
  let checked = 0;
  for (const [path, bytes] of files) {
    if (!path.endsWith('.md') && !path.endsWith('.mjs') && !path.endsWith('.json')) continue;
    for (const match of String(bytes).matchAll(pattern)) {
      const target = match[1];
      assert.ok(
        target.startsWith('skills/digmore/'),
        `${path}: ${target} must live under skills/digmore/`,
      );
      assert.ok(existsSync(join(PLUGIN, target)), `${path} points at a missing file: ${target}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'the skill does reference its own scripts');
});

test('the manifests agree with package.json and with each other', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  const marketplace = JSON.parse(readFileSync(join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));

  assert.equal(manifest.name, 'digmore');
  assert.equal(manifest.version, pkg.version, 'one version, from package.json');
  assert.equal(manifest.license, 'Apache-2.0', 'the licence the repo carries');

  const entry = marketplace.plugins.find((plugin) => plugin.name === 'digmore');
  assert.ok(entry, 'digmore is listed');
  assert.equal(entry.source, './plugin', 'the committed build output');
  assert.equal(entry.version, pkg.version, 'the marketplace agrees on the version');
});

test('the built scripts still run from the built tree', () => {
  const result = spawnSync(process.execPath, [join(SKILL_IN_PLUGIN, 'scripts', 'experts.mjs'), 'nope'], {
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0, 'a bad verb still errors');
  assert.match(result.stderr, /unknown command/, 'the copy is executable, not just present');
});

test('the plugin ships no tests, plans or node_modules', () => {
  for (const path of snapshot(PLUGIN).keys()) {
    assert.ok(!path.startsWith('tests/'), path);
    assert.ok(!path.startsWith('plans/'), path);
    assert.ok(!path.includes('node_modules'), path);
  }
});

test('the source tree is left untouched by a build', () => {
  const before = snapshot(join(repoRoot, 'skill'));
  build();
  const after = snapshot(join(repoRoot, 'skill'));
  assert.deepEqual([...after.keys()], [...before.keys()]);
  for (const [path, bytes] of before) assert.ok(bytes.equals(after.get(path)), path);
});

test('every shipped script is executable by node', () => {
  const scripts = readdirSync(join(SKILL_IN_PLUGIN, 'scripts')).filter((file) => file.endsWith('.mjs'));
  // Every .mjs in skill/scripts/ ships, so this compares the built tree against the source
  // rather than against a list typed here — a list is one more place to forget a new script,
  // and it forgot three.
  const shipped = readdirSync(join(repoRoot, 'skill', 'scripts')).filter((file) => file.endsWith('.mjs'));
  assert.deepEqual(scripts.sort(), shipped.sort(), 'the built scripts are the source scripts');
  assert.ok(scripts.length > 0, 'and there are some');
  for (const name of scripts) {
    const result = spawnSync(process.execPath, ['--check', join(SKILL_IN_PLUGIN, 'scripts', name)], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${name} failed to parse: ${result.stderr}`);
  }
});

test('the plugin directory is not empty of the brain', () => {
  const brain = join(SKILL_IN_PLUGIN, 'brain');
  assert.ok(statSync(join(brain, 'index.md')).size > 0);
  assert.ok(existsSync(join(brain, 'phases', 'plan_phase_a.md')));
  assert.ok(existsSync(join(brain, 'phases', 'extract_phase_b.md')));
  // brain/sources/ is gone: what a source looks like on disk is now per-agent, in the file the
  // agent working that source is actually sent.
  assert.ok(existsSync(join(brain, 'subagents', 'page_analyst_agent', 'local.md')));
  assert.ok(existsSync(join(brain, 'subagents', 'raw_report_writer_agent.md')), 'the flat agent files ship too');
});
