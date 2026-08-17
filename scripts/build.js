/**
 * Build the Claude Code plugin from the source skill tree.
 *
 * One target, no transformer factory, no provider matrix: Claude Code is the only
 * harness in this version. The build copies `skill/` into the shape Claude
 * Code discovers, and writes the two manifests.
 *
 *   node scripts/build.js
 *
 * `plugin/` is committed, so the build must be deterministic: two runs on the same
 * source produce byte-identical output. Files are copied byte-for-byte and the
 * manifests are generated from `package.json`, so there is nothing to drift.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE_SKILL = join(repoRoot, 'skill');
const PLUGIN = join(repoRoot, 'plugin');
/** Claude Code discovers skills at <plugin-root>/skills/<name>/. */
const SKILL_NAME = 'digmore';
const BUILT_SKILL = join(PLUGIN, 'skills', SKILL_NAME);

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

/** Sorted, so the walk order — and any error message — is stable across platforms. */
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  const entries = readdirSync(from, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else copyFileSync(source, target);
  }
}

/** Stable key order and a trailing newline, so the bytes are the same every run. */
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// Wipe first: without this, a file deleted from skill/ would survive in plugin/ and the
// committed output would quietly stop matching the source.
rmSync(PLUGIN, { recursive: true, force: true });

copyTree(SOURCE_SKILL, BUILT_SKILL);

// The real manifest. No settings.json ships — a plugin's settings file supports only
// `agent` and `subagentStatusLine`, so an env entry would be silently ignored. The
// README asks the user to set it themselves.
writeJson(join(PLUGIN, '.claude-plugin', 'plugin.json'), {
  $schema: 'https://json.schemastore.org/claude-code-plugin-manifest.json',
  name: SKILL_NAME,
  version: pkg.version,
  description: pkg.description,
  author: { name: 'Peter Naftaliev' },
  homepage: 'https://digmore.ai',
  repository: 'https://github.com/peternaf/digmore',
  license: pkg.license,
  keywords: [
    'research',
    'market-research',
    'competitor-analysis',
    'business',
    'claude-code',
    'plugin',
  ],
});

// The marketplace entry lives at the repo root and points at the committed build output.
writeJson(join(repoRoot, '.claude-plugin', 'marketplace.json'), {
  $schema: 'https://json.schemastore.org/claude-code-marketplace.json',
  name: 'digmore',
  // The product sentence is the website's, which is the source of truth for it.
  description: 'An LLM plugin that turns AI research into decision-ready data.',
  owner: { name: 'Peter Naftaliev', url: 'https://digmore.ai' },
  plugins: [
    {
      name: SKILL_NAME,
      description: pkg.description,
      version: pkg.version,
      source: './plugin',
    },
  ],
});

process.stdout.write(`built ${SKILL_NAME} ${pkg.version} -> plugin/skills/${SKILL_NAME}/\n`);
