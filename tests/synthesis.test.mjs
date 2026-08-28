/**
 * synthesis.mjs — the verdict join, the deterministic half of the Raw report writer's step 1.
 *
 * A join, a lookup and a filter give the same answer every run, which is the whole reason this
 * is a script: an agent handed arithmetic drifts off it, and two real runs applying different
 * numbers for one cap with nothing flagging the difference is the failure this pattern exists
 * to prevent. What genuinely needs the agent is everything after — the semantic merge across
 * sources, the claim ids, the contradictions and the writing.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox } from './helpers.mjs';
import { judgeCitation, joinSource, buildIndex, highestClaimNumber } from '../skill/scripts/synthesis.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

const verdicts = (entries = {}) => new Map(Object.entries(entries));

const citation = (over = {}) => ({
  quote: 'a quote',
  url: 'https://example.test/thread',
  cachedPage: 'cache/reddit/reddit-thread-1a2b.json',
  handle: 'u/someone',
  pageQuality: 'forum',
  ...over,
});

const claim = (citations, over = {}) => ({
  claim: 'Mux charges $0.005 per minute',
  quote: '$0.005 per minute',
  importance: 'central',
  kind: 'qualitative',
  citations,
  ...over,
});

// ---------------------------------------------------------------- one citation's fate

// Page quality is checked before the handle: an unreliable page is dropped whoever posted it.
// A legit expert linking to a content farm is exactly the case the two dimensions are kept
// independent for.
test('an unreliable page is dropped even when a legit person posted it', () => {
  const judgement = judgeCitation(citation({ pageQuality: 'unreliable' }), verdicts({ 'u/someone': 'legit' }));
  assert.deepEqual(judgement, { keep: false, reason: 'unreliable-page' });
});

// The majority of a real run: every claim from the open web and the user's own documents. A
// page has an author rather than an account, so there is nobody to vet and it is judged on the
// page instead. Treating these as rejections would gut the report.
test('a citation with no handle is kept as no-handle', () => {
  const judgement = judgeCitation(citation({ handle: undefined }), verdicts());
  assert.deepEqual(judgement, { keep: true, status: 'no-handle' });
});

// An absent verdict means nobody looked — below vet.handleCapPerSource, or first seen in
// expert material after Vet had finished. Not the same as vetted and rejected.
test('a handle with no verdict is kept as unvetted', () => {
  assert.deepEqual(judgeCitation(citation(), verdicts()), { keep: true, status: 'unvetted' });
  assert.deepEqual(
    judgeCitation(citation({ handle: 'u/stranger' }), verdicts({ 'u/someone': 'legit' })),
    { keep: true, status: 'unvetted' },
  );
});

for (const [verdict, status] of [['legit', 'legit'], ['unknown', 'unknown'], ['promoter', 'promoter']]) {
  test(`a ${verdict} handle is kept and stamped ${status}`, () => {
    assert.deepEqual(
      judgeCitation(citation(), verdicts({ 'u/someone': verdict })),
      { keep: true, status },
    );
  });
}

// Dropped here rather than labelled, so nothing downstream has to decide what to do with one.
// Their rejection is already in <source>-handles.json, the run's account of who it refused to
// listen to.
for (const verdict of ['spammer', 'throwaway']) {
  test(`a ${verdict} citation is dropped, not labelled`, () => {
    assert.deepEqual(
      judgeCitation(citation(), verdicts({ 'u/someone': verdict })),
      { keep: false, reason: verdict },
    );
  });
}

// A value this version does not know is a gap in what we can read, not a rejection — dropping
// on it would silently lose evidence the run paid for.
test('an unrecognised verdict is treated as no verdict, never as a rejection', () => {
  assert.deepEqual(
    judgeCitation(citation(), verdicts({ 'u/someone': 'suspicious' })),
    { keep: true, status: 'unvetted' },
  );
});

// ---------------------------------------------------------------- one source, joined

test('a claim keeps only the citations that survived, each stamped', () => {
  const report = {
    claims: [
      claim([
        citation({ handle: 'u/expert' }),
        citation({ handle: 'u/spam' }),
        citation({ handle: undefined }),
      ]),
    ],
  };
  const joined = joinSource(report, verdicts({ 'u/expert': 'legit', 'u/spam': 'spammer' }));

  assert.equal(joined.claims.length, 1);
  assert.deepEqual(
    joined.claims[0].citations.map((entry) => entry.status),
    ['legit', 'no-handle'],
    'the spammer is gone and the rest carry their status',
  );
  assert.equal(joined.dropped.spammer, 1);
  assert.equal(joined.claims[0].claim, report.claims[0].claim, 'the claim itself is untouched');
});

// A claim survives while any citation does — that is what makes the filter lossless at the
// claim level. Losing every voice behind it is the filter working, not a defect.
test('a claim whose every citation was dropped leaves, and is counted', () => {
  const report = { claims: [claim([citation({ handle: 'u/spam' }), citation({ handle: 'u/junk' })])] };
  const joined = joinSource(report, verdicts({ 'u/spam': 'spammer', 'u/junk': 'throwaway' }));

  assert.deepEqual(joined.claims, []);
  assert.equal(joined.dropped.noSurvivingCitation, 1);
  assert.equal(joined.dropped.spammer, 1);
  assert.equal(joined.dropped.throwaway, 1);
  assert.deepEqual(joined.deletedUnsourced, [], 'this is the filter working, not a defect in us');
});

// The two ways a claim can leave are different findings and must not be filed together. No
// surviving citation is the filter working. No URL on any surviving citation is a defect in
// this pipeline: cite-or-drop means such a claim cannot legitimately exist, so it was invented
// somewhere upstream. It is collected by name because the agent's receipt is the only route it
// has to audit.md — that file is not being written yet, and the agent is gone by the time it is.
test('a claim whose surviving citations carry no URL is collected as unsourced', () => {
  const report = { claims: [claim([citation({ url: undefined })])] };
  const joined = joinSource(report, verdicts({ 'u/someone': 'legit' }));

  assert.deepEqual(joined.claims, []);
  assert.equal(joined.deletedUnsourced.length, 1);
  assert.equal(joined.deletedUnsourced[0].claim, 'Mux charges $0.005 per minute');
  assert.match(joined.deletedUnsourced[0].reason, /URL/);
  assert.equal(joined.dropped.noSurvivingCitation, 0, 'it is not the same finding');
});

// One citation carrying a URL is enough. The claim is cited; the others are corroboration.
test('one surviving citation with a URL carries the claim', () => {
  const report = { claims: [claim([citation({ url: undefined }), citation({ handle: 'u/other' })])] };
  const joined = joinSource(report, verdicts());
  assert.equal(joined.claims.length, 1);
  assert.deepEqual(joined.deletedUnsourced, []);
});

test('an unreliable page is counted apart from a rejected person', () => {
  const report = { claims: [claim([citation({ pageQuality: 'unreliable' }), citation({ handle: 'u/ok' })])] };
  const joined = joinSource(report, verdicts());
  assert.equal(joined.dropped.unreliablePage, 1);
  assert.equal(joined.claims.length, 1);
});

test('a report with no claims joins to nothing rather than failing', () => {
  assert.deepEqual(joinSource({ claims: [] }, verdicts()).claims, []);
  assert.deepEqual(joinSource({}, verdicts()).claims, []);
  assert.deepEqual(joinSource(undefined, verdicts()).claims, []);
});

test('a claim with no citations array is dropped, not thrown on', () => {
  const joined = joinSource({ claims: [claim(undefined)] }, verdicts());
  assert.deepEqual(joined.claims, []);
  assert.equal(joined.dropped.noSurvivingCitation, 1);
});

// ---------------------------------------------------------------- the whole topic

function writeAnalysis(slug, source, { report, handles }) {
  const dir = join(sandbox.cwd, 'digmore', slug, 'full_source_analysis');
  mkdirSync(dir, { recursive: true });
  if (report) writeFileSync(join(dir, `${source}-raw-report.json`), JSON.stringify(report));
  if (handles) writeFileSync(join(dir, `${source}-handles.json`), JSON.stringify(handles));
  return dir;
}

const joinedFile = (slug, source) =>
  JSON.parse(readFileSync(join(sandbox.cwd, 'digmore', slug, 'full_source_analysis', `${source}-joined.json`), 'utf8'));

// One file per source, so the agent that reads them still reads one source at a time and its
// log line still names one.
test('join writes one file per source that produced a report', async () => {
  writeAnalysis('demo', 'reddit', {
    report: {
      source: 'reddit',
      observations: 'everyone complains about latency in March',
      claims: [claim([citation({ handle: 'u/expert' })])],
    },
    handles: { source: 'reddit', handles: [{ handle: 'u/expert', verdict: 'legit' }] },
  });
  writeAnalysis('demo', 'websearch', {
    report: { source: 'websearch', observations: '', claims: [claim([citation({ handle: undefined })])] },
  });

  const { code, json } = await sandbox.run('synthesis.mjs', 'join', '--topic', 'demo');
  assert.equal(code, 0);
  assert.deepEqual(json.written.map((entry) => entry.source).sort(), ['reddit', 'websearch']);
  assert.equal(json.claimsIn, 2);
  assert.equal(json.claimsOut, 2);

  assert.equal(joinedFile('demo', 'reddit').claims[0].citations[0].status, 'legit');
  assert.equal(
    joinedFile('demo', 'websearch').claims[0].citations[0].status,
    'no-handle',
    'a source with no handles file is unvetted, not rejected',
  );
});

// The per-source reports are the durable checkpoint this phase rebuilds from, so a run that
// dies here re-reads them and starts again.
test('the per-source reports are never modified', async () => {
  const report = {
    source: 'reddit',
    observations: 'kept as written',
    claims: [claim([citation({ handle: 'u/spam' })])],
  };
  writeAnalysis('demo', 'reddit', {
    report,
    handles: { source: 'reddit', handles: [{ handle: 'u/spam', verdict: 'spammer' }] },
  });
  const before = readFileSync(
    join(sandbox.cwd, 'digmore', 'demo', 'full_source_analysis', 'reddit-raw-report.json'),
    'utf8',
  );

  await sandbox.run('synthesis.mjs', 'join', '--topic', 'demo');
  const after = readFileSync(
    join(sandbox.cwd, 'digmore', 'demo', 'full_source_analysis', 'reddit-raw-report.json'),
    'utf8',
  );
  assert.equal(after, before, 'the checkpoint this phase rebuilds from is left alone');
});

test('observations travel across, and the discards travel with the file', async () => {
  writeAnalysis('demo', 'reddit', {
    report: {
      source: 'reddit',
      observations: 'twelve threads ask a question nobody answers',
      claims: [claim([citation({ url: undefined })]), claim([citation({ handle: 'u/spam' })])],
    },
    handles: { source: 'reddit', handles: [{ handle: 'u/spam', verdict: 'spammer' }] },
  });

  const { json } = await sandbox.run('synthesis.mjs', 'join', '--topic', 'demo');
  const written = joinedFile('demo', 'reddit');
  assert.equal(written.observations, 'twelve threads ask a question nobody answers');
  assert.equal(written.deletedUnsourced.length, 1, 'the receipt list is on the file the agent reads');
  assert.equal(written.dropped.spammer, 1);
  assert.equal(json.unsourced, 1);
});

// Extract writes one report per source that pulled data, so none at all means the phase before
// this did not finish or its output was cleared. Silence there would look like an empty topic.
test('no report at all is an error, not an empty result', async () => {
  mkdirSync(join(sandbox.cwd, 'digmore', 'demo'), { recursive: true });
  const { code, err } = await sandbox.run('synthesis.mjs', 'join', '--topic', 'demo');
  assert.notEqual(code, 0);
  assert.match(err, /Extract has not finished|cache is gone/);
});

// A file that is present but unreadable is a different thing from one that is absent: the
// source is named so the run can say which report it could not use.
test('a report that cannot be read names the source rather than being skipped', async () => {
  writeAnalysis('demo', 'reddit', {
    report: { source: 'reddit', observations: '', claims: [claim([citation({ handle: undefined })])] },
  });
  writeFileSync(
    join(sandbox.cwd, 'digmore', 'demo', 'full_source_analysis', 'forums-raw-report.json'),
    '{ not json',
  );

  const { code, json } = await sandbox.run('synthesis.mjs', 'join', '--topic', 'demo');
  assert.equal(code, 0, 'one bad report does not fail the phase');
  assert.deepEqual(json.sourcesMissing, ['forums']);
  assert.ok(!existsSync(join(sandbox.cwd, 'digmore', 'demo', 'full_source_analysis', 'forums-joined.json')));
});

test('the verb and the topic are both required', async () => {
  assert.notEqual((await sandbox.run('synthesis.mjs')).code, 0);
  assert.notEqual((await sandbox.run('synthesis.mjs', 'merge', '--topic', 'demo')).code, 0);
  assert.notEqual((await sandbox.run('synthesis.mjs', 'join')).code, 0);
});

// ---------------------------------------------------------------- the index verb
//
// claim_index.json used to be model output. Every field of it but the merged claim text and the
// refutation is a copy, a maximum or a counter, and a run spent twelve minutes emitting it before
// hitting the output limit and restarting in batches. These pin the expansion: what the agent
// still decides, and what a reference that does not resolve does.

const joinedClaim = (over = {}) => ({
  claim: 'a source claim',
  quote: 'the words the source used',
  importance: 'supporting',
  kind: 'qualitative',
  citations: [
    { cachedPage: 'cache/reddit/a.json', url: 'https://example.test/1', handle: 'u/foo', pageQuality: 'forum', status: 'legit' },
  ],
  ...over,
});

const joinedFor = (entries) => new Map(Object.entries(entries).map(([source, claims]) => [source, { source, claims }]));

test('a merged claim takes the highest importance and the canonical page quality', () => {
  const joined = joinedFor({
    reddit: [joinedClaim({ importance: 'supporting' })],
    websearch: [joinedClaim({
      importance: 'central',
      citations: [{ cachedPage: 'cache/websearch/p.md', url: 'https://vendor.test/pricing', pageQuality: 'primary-self', status: 'no-handle' }],
    })],
  });

  const [merged] = buildIndex(
    { claims: [{ claim: 'merged', from: [{ source: 'reddit', index: 0 }, { source: 'websearch', index: 0 }] }] },
    joined,
  );

  assert.equal(merged.claimId, 'claim-001');
  assert.equal(merged.claim, 'merged', "the agent's text, not either source's");
  assert.equal(merged.importance, 'central');
  assert.equal(merged.pageQuality, 'primary-self');
  assert.equal(merged.citations.length, 2, 'every citation of every source claim it merged');
});

test("a citation's quote is its source claim's, carried to each of that claim's citations", () => {
  const joined = joinedFor({
    reddit: [joinedClaim({
      quote: 'we pay half a cent',
      citations: [
        { cachedPage: 'cache/reddit/a.json', url: 'https://example.test/1', pageQuality: 'forum', status: 'no-handle' },
        { cachedPage: 'cache/reddit/b.json', url: 'https://example.test/2', pageQuality: 'forum', status: 'no-handle' },
      ],
    })],
  });

  const [merged] = buildIndex({ claims: [{ claim: 'x', from: [{ source: 'reddit', index: 0 }] }] }, joined);
  assert.deepEqual(merged.citations.map((one) => one.quote), ['we pay half a cent', 'we pay half a cent']);
});

test('the handle travels where there is one and is absent where there is not', () => {
  const joined = joinedFor({
    reddit: [joinedClaim({
      citations: [
        { cachedPage: 'cache/reddit/a.json', url: 'https://example.test/1', handle: 'u/foo', pageQuality: 'forum', status: 'legit' },
        { cachedPage: 'cache/websearch/p.md', url: 'https://example.test/2', pageQuality: 'blog', status: 'no-handle' },
      ],
    })],
  });

  const [merged] = buildIndex({ claims: [{ claim: 'x', from: [{ source: 'reddit', index: 0 }] }] }, joined);
  assert.equal(merged.citations[0].handle, 'u/foo');
  assert.equal('handle' in merged.citations[1], false, 'an author is not an account');
});

test('ids are a counter over the merged set, and a repair pass continues it', () => {
  const joined = joinedFor({ reddit: [joinedClaim(), joinedClaim()] });
  const manifest = {
    claims: [
      { claim: 'one', from: [{ source: 'reddit', index: 0 }] },
      { claim: 'two', from: [{ source: 'reddit', index: 1 }] },
    ],
  };

  assert.deepEqual(buildIndex(manifest, joined).map((one) => one.claimId), ['claim-001', 'claim-002']);
  assert.deepEqual(
    buildIndex(manifest, joined, { startAt: highestClaimNumber([{ claimId: 'claim-009' }, { claimId: 'claim-002' }]) })
      .map((one) => one.claimId),
    ['claim-010', 'claim-011'],
    'a repaired claim that reused an id would point a rendered marker at different evidence',
  );
});

test('refutedByIndex becomes the winner id, because the ids do not exist when the agent writes', () => {
  const joined = joinedFor({ reddit: [joinedClaim(), joinedClaim()] });
  const claims = buildIndex(
    {
      claims: [
        { claim: 'winner', from: [{ source: 'reddit', index: 0 }] },
        { claim: 'loser', from: [{ source: 'reddit', index: 1 }], refutedByIndex: 0, refutedReason: 'the vendor page' },
      ],
    },
    joined,
  );

  assert.equal(claims[1].refutedBy, 'claim-001');
  assert.equal(claims[1].refutedReason, 'the vendor page');
  assert.equal('refutedBy' in claims[0], false, 'the winner carries nothing');
});

// A shape check reads structure; it cannot know whether reddit[41] is a claim. This is the check
// that only the script can make, and it is why the manifest is expanded rather than trusted.
test('a reference that does not resolve fails loudly, naming it', () => {
  const joined = joinedFor({ reddit: [joinedClaim()] });

  assert.throws(
    () => buildIndex({ claims: [{ claim: 'x', from: [{ source: 'reddit', index: 41 }] }] }, joined),
    /claims\[0\] cites reddit\[41\]/,
  );
  assert.throws(
    () => buildIndex({ claims: [{ claim: 'x', from: [{ source: 'mastodon', index: 0 }] }] }, joined),
    /has no <source>-joined\.json/,
  );
  assert.throws(
    () => buildIndex({ claims: [{ claim: 'x', from: [] }] }, joined),
    /has no `from`/,
  );
});

test('a refutation pointing at itself or at nothing is refused', () => {
  const joined = joinedFor({ reddit: [joinedClaim()] });
  const entry = { claim: 'x', from: [{ source: 'reddit', index: 0 }] };

  assert.throws(
    () => buildIndex({ claims: [{ ...entry, refutedByIndex: 0 }] }, joined),
    /points at itself/,
  );
  assert.throws(
    () => buildIndex({ claims: [{ ...entry, refutedByIndex: 7 }] }, joined),
    /is not a claim in this manifest/,
  );
});

test('highestClaimNumber ignores anything that is not a claim id', () => {
  assert.equal(highestClaimNumber([]), 0);
  assert.equal(highestClaimNumber(undefined), 0);
  assert.equal(highestClaimNumber([{ claimId: 'claim-003' }, { claimId: 'not-an-id' }, {}]), 3);
});
