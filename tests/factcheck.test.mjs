/**
 * factcheck.mjs — the fact check's paragraphs.
 *
 * `audit_phase_f.md` always said a script joined each marker id to its row in claim_index.json, and
 * none did; a run wrote its own into cache/_misc/ mid-way instead. These pin what that throwaway got
 * right — above all the split, which is a correctness rule rather than a formatting one: a bullet
 * list has no blank line inside it, so a block-level split checks the first bullet and silently
 * skips the rest. On one real summary two blocks held 25 of its 80 markers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox } from './helpers.mjs';
import { claimIdsIn, splitUnits } from '../skill/scripts/factcheck.mjs';

const marker = (...ids) => `<!-- claims: ${ids.join(', ')} -->`;

test('a block carrying several markers becomes one unit per marked line', () => {
  const summary = [
    '## Hubs',
    '',
    `- [r/DataHoarder](https://x.test/1) — the archive crowd. ${marker('001')}`,
    `- [r/pushshift](https://x.test/2) — the API refugees. ${marker('002')}`,
    `- [r/webscraping](https://x.test/3) — the workarounds. ${marker('003')}`,
  ].join('\n');

  const { marked } = splitUnits(summary);
  assert.equal(marked.length, 3, 'a block split would have checked only the first bullet');
  assert.deepEqual(marked.map((unit) => unit.section), ['Hubs', 'Hubs', 'Hubs']);
  assert.match(marked[2].text, /webscraping/);
});

test('an ordinary paragraph stays whole, marker and all', () => {
  const summary = `## Verdict\n\nOne sentence. And a second that continues it. ${marker('004', '005')}`;
  const { marked } = splitUnits(summary);
  assert.equal(marked.length, 1);
  assert.match(marked[0].text, /And a second/, 'not split at the sentence');
  assert.equal(marked[0].section, 'Verdict');
});

// audit_phase_f.md: "Every row of an enumerable section is rendered from a finished CSV and carries
// no marker, because a row is not a claim. Sweeping those in would fire on every row of every
// landscape run."
test('headings, tables and unmarked bullet lists are not sent to the writer', () => {
  const summary = [
    '# Title',
    '',
    '| name | url |',
    '| --- | --- |',
    '| Acme | https://acme.test |',
    '',
    '- one rendered row',
    '- another rendered row',
    '',
    'A real paragraph with no marker at all.',
  ].join('\n');

  const { marked, unmarked } = splitUnits(summary);
  assert.equal(marked.length, 0);
  assert.equal(unmarked.length, 1, 'only the prose');
  assert.match(unmarked[0].text, /A real paragraph/);
});

test('a claim id is read with or without its prefix', () => {
  assert.deepEqual(claimIdsIn(marker('001', 'claim-004')), ['claim-001', 'claim-004']);
  assert.deepEqual(claimIdsIn('no marker here'), []);
});

/** A topic on disk, with the two files prepare reads. */
function topic(sandbox, { summary, claims }) {
  const root = join(sandbox.cwd, 'digmore', 't');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 't-executive-summary.md'), summary, 'utf8');
  writeFileSync(join(root, 'claim_index.json'), JSON.stringify({ claims }), 'utf8');
  return root;
}

const claim = (id, page, over = {}) => ({
  claimId: id,
  claim: `what ${id} says`,
  importance: 'supporting',
  pageQuality: 'forum',
  citations: [{ quote: `quote for ${id}`, url: 'https://x.test/p', cachedPage: page, status: 'legit' }],
  ...over,
});

test('prepare freezes the numbering, and two runs on one summary agree', async () => {
  const sandbox = new Sandbox();
  try {
    topic(sandbox, {
      summary: `First. ${marker('001')}\n\nSecond. ${marker('002')}`,
      claims: [claim('claim-001', 'cache/a.md'), claim('claim-002', 'cache/b.md')],
    });
    const first = await sandbox.run('factcheck.mjs', 'prepare', '--topic', 't');
    const second = await sandbox.run('factcheck.mjs', 'prepare', '--topic', 't');
    assert.equal(first.code, 0);
    assert.equal(first.json.paragraphs, 2);
    assert.deepEqual(first.json, second.json, 'a resumed run has to number identically');
  } finally {
    await sandbox.cleanup();
  }
});

// The copy editor can rewrite a paragraph and drop a rendering without saying so. There is nothing
// to verify and nothing to delete, so a stale id is counted and left out rather than thrown on.
test('a marker naming a claim the index does not have is counted, not an error', async () => {
  const sandbox = new Sandbox();
  try {
    topic(sandbox, {
      summary: `Only one of these exists. ${marker('001', '999')}`,
      claims: [claim('claim-001', 'cache/a.md')],
    });
    const result = await sandbox.run('factcheck.mjs', 'prepare', '--topic', 't');
    assert.equal(result.code, 0);
    assert.equal(result.json.staleIds, 1);
    assert.equal(result.json.paragraphs, 1);
  } finally {
    await sandbox.cleanup();
  }
});

test('serve groups the evidence by page, so one file is opened once', async () => {
  const sandbox = new Sandbox();
  try {
    topic(sandbox, {
      summary: `Two claims, one page. ${marker('001', '002')}`,
      claims: [claim('claim-001', 'cache/shared.md'), claim('claim-002', 'cache/shared.md')],
    });
    await sandbox.run('factcheck.mjs', 'prepare', '--topic', 't');
    const result = await sandbox.run('factcheck.mjs', 'serve', '--topic', 't', '--from', '1', '--to', '1');

    assert.equal(result.code, 0);
    const [paragraph] = result.json.paragraphs;
    assert.equal(paragraph.evidence.length, 1, 'one entry, not two');
    assert.equal(paragraph.evidence[0].quotes.length, 2);
    assert.equal(paragraph.paragraph, 1, 'its number comes from the work list, not the orchestrator');
  } finally {
    await sandbox.cleanup();
  }
});

// Nothing comes back keyed on an id, and the handle verdict decides caveating rather than text
// against text — so neither crosses into what the agent is given.
test('claimId and status do not reach the agent', async () => {
  const sandbox = new Sandbox();
  try {
    topic(sandbox, {
      summary: `A paragraph. ${marker('001')}`,
      claims: [claim('claim-001', 'cache/a.md')],
    });
    await sandbox.run('factcheck.mjs', 'prepare', '--topic', 't');
    const result = await sandbox.run('factcheck.mjs', 'serve', '--topic', 't', '--from', '1', '--to', '1');
    const served = JSON.stringify(result.json);
    assert.ok(!served.includes('claimId'));
    assert.ok(!served.includes('"status"'));
  } finally {
    await sandbox.cleanup();
  }
});

test('a range past the end is short rather than an error — the last one always is', async () => {
  const sandbox = new Sandbox();
  try {
    topic(sandbox, {
      summary: `One. ${marker('001')}\n\nTwo. ${marker('002')}`,
      claims: [claim('claim-001', 'cache/a.md'), claim('claim-002', 'cache/b.md')],
    });
    await sandbox.run('factcheck.mjs', 'prepare', '--topic', 't');
    const result = await sandbox.run('factcheck.mjs', 'serve', '--topic', 't', '--from', '2', '--to', '9');
    assert.equal(result.code, 0);
    assert.equal(result.json.count, 1);
  } finally {
    await sandbox.cleanup();
  }
});

test('serve before prepare says which call is missing', async () => {
  const sandbox = new Sandbox();
  try {
    topic(sandbox, { summary: `A. ${marker('001')}`, claims: [claim('claim-001', 'cache/a.md')] });
    const result = await sandbox.run('factcheck.mjs', 'serve', '--topic', 't', '--from', '1', '--to', '1');
    assert.equal(result.code, 1);
    assert.match(result.err, /prepare/);
  } finally {
    await sandbox.cleanup();
  }
});

test('the unmarked file locates each paragraph, or the writer has to search for it', async () => {
  const sandbox = new Sandbox();
  try {
    const root = topic(sandbox, {
      summary: `## Players\n\nFull rows: [players.csv](players.csv).\n\nMarked. ${marker('001')}`,
      claims: [claim('claim-001', 'cache/a.md')],
    });
    const result = await sandbox.run('factcheck.mjs', 'prepare', '--topic', 't');
    assert.equal(result.json.unmarked, 1);
    const written = readFileSync(join(root, 'cache', 'audit', 'unmarked.md'), 'utf8');
    assert.match(written, /in "Players"/);
    assert.match(written, /Full rows/);
  } finally {
    await sandbox.cleanup();
  }
});

test('the topic is required, and an unknown verb names all three', async () => {
  const sandbox = new Sandbox();
  try {
    assert.equal((await sandbox.run('factcheck.mjs', 'prepare')).code, 1);
    const unknown = await sandbox.run('factcheck.mjs', 'sweep', '--topic', 't');
    assert.equal(unknown.code, 1);
    assert.match(unknown.err, /prepare, serve or unused_claims/);
  } finally {
    await sandbox.cleanup();
  }
});

// The writer used to hand back its own drop list, justified by an aggregate raw report that no
// longer exists. This is the same record, computed from files that outlive the run.
test('unused_claims names every claim no paragraph renders', async () => {
  const sandbox = new Sandbox();
  try {
    topic(sandbox, {
      summary: `Only the first. ${marker('001')}`,
      claims: [claim('claim-001', 'cache/a.md'), claim('claim-002', 'cache/b.md')],
    });
    const { code, json } = await sandbox.run('factcheck.mjs', 'unused_claims', '--topic', 't');

    assert.equal(code, 0);
    assert.equal(json.claims, 2);
    assert.equal(json.rendered, 1);
    assert.deepEqual(json.claimIds, ['claim-002']);
  } finally {
    await sandbox.cleanup();
  }
});

test('a summary that renders everything reports none unused', async () => {
  const sandbox = new Sandbox();
  try {
    topic(sandbox, {
      summary: `Both. ${marker('001', '002')}`,
      claims: [claim('claim-001', 'cache/a.md'), claim('claim-002', 'cache/b.md')],
    });
    const { json } = await sandbox.run('factcheck.mjs', 'unused_claims', '--topic', 't');
    assert.equal(json.unused, 0);
    assert.deepEqual(json.claimIds, []);
  } finally {
    await sandbox.cleanup();
  }
});

// A trailing * means the paragraph renders that claim's quote; a bare id means it asserts the claim
// without quoting. Everything downstream addresses claims by id, so the flag is stripped there.
test('the marker flag is stripped from the id and read separately', async () => {
  const { claimIdsIn, quotedIdsIn } = await import('../skill/scripts/factcheck.mjs');
  const text = '<!-- claims: 001, claim-004*, 017 -->';

  assert.deepEqual(claimIdsIn(text), ['claim-001', 'claim-004', 'claim-017']);
  assert.deepEqual(quotedIdsIn(text), ['claim-004'], 'only the flagged one renders a quote');
  assert.deepEqual(quotedIdsIn('<!-- claims: 001 -->'), []);
});
