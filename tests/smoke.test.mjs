import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(repoRoot, ...p), 'utf8');

// The repository layout. Three directories are deliberately absent: hooks/ (no hook
// ships), docs/ (empty and removed), and plans/ (planning lives outside this repo).
const REQUIRED_DIRS = [
  'skill',
  'skill/reference',
  'skill/brain',
  'skill/scripts',
  'scripts',
  'tests',
];

// hooks/ is deliberately absent.
const FORBIDDEN_DIRS = ['hooks'];

test('the documented repo layout exists', () => {
  for (const dir of REQUIRED_DIRS) {
    assert.ok(existsSync(join(repoRoot, dir)), `missing directory: ${dir}`);
  }
});

test('no hooks/ directory', () => {
  for (const dir of FORBIDDEN_DIRS) {
    assert.ok(!existsSync(join(repoRoot, dir)), `directory should not exist: ${dir}`);
  }
});

test('package.json declares no dependencies', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined, 'dependencies must be absent');
  assert.equal(pkg.devDependencies, undefined, 'devDependencies must be absent');
  assert.equal(pkg.type, 'module', 'scripts are ES modules');
});

test('package.json requires Node 20 or newer', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.engines.node, />=\s*20/);
});

test('no lockfile — nothing to install', () => {
  assert.ok(!existsSync(join(repoRoot, 'package-lock.json')));
  assert.ok(!existsSync(join(repoRoot, 'node_modules')));
});
