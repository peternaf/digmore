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
import { join, dirname } from 'node:path';
import { Sandbox } from './helpers.mjs';
import {
  judgeCitation,
  joinSource,
  buildIndex,
  claimsFileFor,
  electRepresentative,
  quoteResolver,
  referenceLabel,
} from '../skill/scripts/synthesis.mjs';

let sandbox;
beforeEach(() => (sandbox = new Sandbox()));
afterEach(() => sandbox.cleanup());

const verdicts = (entries = {}) => new Map(Object.entries(entries));

const citation = (over = {}) => ({
  citeId: 'reddit_a3f9c21b04',
  url: 'https://example.test/thread',
  cachedPage: 'cache/reddit/reddit-thread-1a2b.json',
  handle: 'u/someone',
  pageQuality: 'forum',
  ...over,
});

// No `quote` on a claim any more: the words live in the page's own claims file and the citation
// carries the id that names them.
const claim = (citations, over = {}) => ({
  claim: 'Mux charges $0.005 per minute',
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
  if (report) writeFileSync(join(dir, `${source}-preliminary-results.json`), JSON.stringify(report));
  if (handles) writeFileSync(join(dir, `${source}-handles.json`), JSON.stringify(handles));
  return dir;
}

const joinedFile = (slug, source) =>
  JSON.parse(
    readFileSync(
      join(sandbox.cwd, 'digmore', slug, 'full_source_analysis', `${source}-final-results.json`),
      'utf8',
    ),
  );

// One file per source, so the agent that reads them still reads one source at a time and its
// log line still names one.
test('join writes one file per source that produced a report', async () => {
  writeAnalysis('demo', 'reddit', {
    report: {
      source: 'reddit',
      observations: ['everyone complains about latency in March'],
      claims: [claim([citation({ handle: 'u/expert' })])],
    },
    handles: { source: 'reddit', handles: [{ handle: 'u/expert', verdict: 'legit' }] },
  });
  writeAnalysis('demo', 'websearch', {
    report: { source: 'websearch', observations: [], claims: [claim([citation({ handle: undefined })])] },
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
    observations: ['kept as written'],
    claims: [claim([citation({ handle: 'u/spam' })])],
  };
  writeAnalysis('demo', 'reddit', {
    report,
    handles: { source: 'reddit', handles: [{ handle: 'u/spam', verdict: 'spammer' }] },
  });
  const before = readFileSync(
    join(sandbox.cwd, 'digmore', 'demo', 'full_source_analysis', 'reddit-preliminary-results.json'),
    'utf8',
  );

  await sandbox.run('synthesis.mjs', 'join', '--topic', 'demo');
  const after = readFileSync(
    join(sandbox.cwd, 'digmore', 'demo', 'full_source_analysis', 'reddit-preliminary-results.json'),
    'utf8',
  );
  assert.equal(after, before, 'the checkpoint this phase rebuilds from is left alone');
});

// Nothing joins an observation — there is no citation to stamp a verdict on — so `join` does not
// carry them. `read_observations` reads the preliminary results instead, which also means it works
// before this verb has run at all.
test('observations do not travel across; the discards do', async () => {
  writeAnalysis('demo', 'reddit', {
    report: {
      source: 'reddit',
      observations: ['twelve threads ask a question nobody answers'],
      claims: [claim([citation({ url: undefined })]), claim([citation({ handle: 'u/spam' })])],
    },
    handles: { source: 'reddit', handles: [{ handle: 'u/spam', verdict: 'spammer' }] },
  });

  const { json } = await sandbox.run('synthesis.mjs', 'join', '--topic', 'demo');
  const written = joinedFile('demo', 'reddit');
  assert.equal('observations' in written, false, 'the final results carry claims, not observations');
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
    report: { source: 'reddit', observations: [], claims: [claim([citation({ handle: undefined })])] },
  });
  writeFileSync(
    join(sandbox.cwd, 'digmore', 'demo', 'full_source_analysis', 'forums-preliminary-results.json'),
    '{ not json',
  );

  const { code, json } = await sandbox.run('synthesis.mjs', 'join', '--topic', 'demo');
  assert.equal(code, 0, 'one bad report does not fail the phase');
  assert.deepEqual(json.sourcesMissing, ['forums']);
  assert.ok(
    !existsSync(join(sandbox.cwd, 'digmore', 'demo', 'full_source_analysis', 'forums-final-results.json')),
  );
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
  importance: 'supporting',
  kind: 'qualitative',
  citations: [
    { citeId: 'reddit_aaa1', cachedPage: 'cache/reddit/a.json', url: 'https://example.test/1', handle: 'u/foo', pageQuality: 'forum', status: 'legit', representative: true },
  ],
  ...over,
});

/** buildIndex answers with {claims, problems}; most of these tests only want the claims. */
const claimsOf = (result) => result.claims;

const joinedFor = (entries) => new Map(Object.entries(entries).map(([source, claims]) => [source, { source, claims }]));

test('a merged claim takes the highest importance and the canonical page quality', () => {
  const joined = joinedFor({
    reddit: [joinedClaim({ importance: 'supporting' })],
    websearch: [joinedClaim({
      importance: 'central',
      citations: [{ citeId: 'websearch_bbb2', cachedPage: 'cache/websearch/p.md', url: 'https://vendor.test/pricing', pageQuality: 'primary-self', status: 'no-handle', representative: true }],
    })],
  });

  const [merged] = claimsOf(buildIndex(
    { claims: [{ claim: 'merged', from: [{ source: 'reddit', index: 0 }, { source: 'websearch', index: 0 }] }] },
    joined,
  ));

  assert.equal(merged.claimId, 'claim-001');
  assert.equal(merged.claim, 'merged', "the agent's text, not either source's");
  assert.equal(merged.importance, 'central');
  assert.equal(merged.pageQuality, 'primary-self');
  assert.equal(merged.citations.length, 2, 'every citation of every source claim it merged');
});

// The defect this pass exists to remove: one quote per claim, copied onto every citation, so a
// claim merged from three pages named two pages that never carried those words. Measured at 63% of
// the citations on multi-cited claims. Now each citation carries its own id and no quote at all.
test('each citation keeps its own id, and no quote is copied anywhere', () => {
  const joined = joinedFor({
    reddit: [joinedClaim({
      citations: [
        { citeId: 'reddit_aaa1', cachedPage: 'cache/reddit/a.json', url: 'https://example.test/1', pageQuality: 'forum', status: 'no-handle', representative: true },
        { citeId: 'reddit_bbb2', cachedPage: 'cache/reddit/b.json', url: 'https://example.test/2', pageQuality: 'forum', status: 'no-handle' },
      ],
    })],
  });

  const [merged] = claimsOf(buildIndex({ claims: [{ claim: 'x', from: [{ source: 'reddit', index: 0 }] }] }, joined));
  assert.deepEqual(merged.citations.map((one) => one.citeId), ['reddit_aaa1', 'reddit_bbb2']);
  assert.ok(merged.citations.every((one) => !('quote' in one)), 'no quote text outside the claims file');
});

test('the handle travels where there is one and is absent where there is not', () => {
  const joined = joinedFor({
    reddit: [joinedClaim({
      citations: [
        { citeId: 'reddit_aaa1', cachedPage: 'cache/reddit/a.json', url: 'https://example.test/1', handle: 'u/foo', pageQuality: 'forum', status: 'legit', representative: true },
        { citeId: 'websearch_bbb2', cachedPage: 'cache/websearch/p.md', url: 'https://example.test/2', pageQuality: 'blog', status: 'no-handle' },
      ],
    })],
  });

  const [merged] = claimsOf(buildIndex({ claims: [{ claim: 'x', from: [{ source: 'reddit', index: 0 }] }] }, joined));
  assert.equal(merged.citations[0].handle, 'u/foo');
  assert.equal('handle' in merged.citations[1], false, 'an author is not an account');
});

// The index is written whole, every time. There is no append: the repair pass rebuilds CSV rows
// from claims already indexed and never introduces one, so nothing adds to this file after it is
// written.
test('ids are a counter over the merged set, and always start at one', () => {
  const joined = joinedFor({ reddit: [joinedClaim(), joinedClaim()] });
  const manifest = {
    claims: [
      { claim: 'one', from: [{ source: 'reddit', index: 0 }] },
      { claim: 'two', from: [{ source: 'reddit', index: 1 }] },
    ],
  };

  assert.deepEqual(claimsOf(buildIndex(manifest, joined)).map((one) => one.claimId), ['claim-001', 'claim-002']);
  assert.deepEqual(claimsOf(buildIndex(manifest, joined)).map((one) => one.claimId), ['claim-001', 'claim-002']);
});

test('refutedByIndex becomes the winner id, because the ids do not exist when the agent writes', () => {
  const joined = joinedFor({ reddit: [joinedClaim(), joinedClaim()] });
  const claims = claimsOf(buildIndex(
    {
      claims: [
        { claim: 'winner', from: [{ source: 'reddit', index: 0 }] },
        { claim: 'loser', from: [{ source: 'reddit', index: 1 }], refutedByIndex: 0, refutedReason: 'the vendor page' },
      ],
    },
    joined,
  ));

  assert.equal(claims[1].refutedBy, 'claim-001');
  assert.equal(claims[1].refutedReason, 'the vendor page');
  assert.equal('refutedBy' in claims[0], false, 'the winner carries nothing');
});

// ---------------------------------------------------------------- a malformed entry is dropped
//
// It used to throw at the first bad entry, and the agent that fixes a manifest gets ONE repair
// attempt — so two bad entries were unrecoverable and Synthesize failed over bookkeeping with
// every fetch in the run already paid for.

test('every problem is reported, not just the first', () => {
  const joined = joinedFor({ reddit: [joinedClaim()] });
  const { problems } = buildIndex(
    {
      claims: [
        { claim: 'a', from: [{ source: 'reddit', index: 41 }] },
        { claim: 'b', from: [{ source: 'mastodon', index: 0 }] },
        { claim: 'c', from: [{ source: 'reddit', index: 0 }], representativeFrom: 'websearch[9]' },
      ],
    },
    joined,
  );

  assert.equal(problems.length, 3, 'one repair attempt cannot fix them one at a time');
});

test('a malformed entry is dropped and the rest survive', () => {
  const joined = joinedFor({ reddit: [joinedClaim()] });
  const { claims, problems } = buildIndex(
    {
      claims: [
        { claim: 'good', from: [{ source: 'reddit', index: 0 }] },
        { claim: 'bad', from: [{ source: 'reddit', index: 41 }] },
        { claim: 'also good', from: [{ source: 'reddit', index: 0 }] },
      ],
    },
    joined,
  );

  assert.deepEqual(claims.map((one) => one.claimId), ['claim-001', 'claim-003']);
  assert.equal(problems.length, 1);
});

// Skipping would shrink the array, so every later claim slides down one and refutedByIndex starts
// naming the wrong claim — reporting problems that are not real on top of the ones that are.
test('a dropped entry leaves a stand-in, so refutedByIndex stays accurate', () => {
  const joined = joinedFor({ reddit: [joinedClaim(), joinedClaim()] });
  const { claims } = buildIndex(
    {
      claims: [
        { claim: 'winner', from: [{ source: 'reddit', index: 0 }] },
        { claim: 'malformed', from: [{ source: 'reddit', index: 41 }] },
        { claim: 'loser', from: [{ source: 'reddit', index: 1 }], refutedByIndex: 0, refutedReason: 'the vendor page' },
      ],
    },
    joined,
  );

  const loser = claims.find((one) => one.claimId === 'claim-003');
  assert.equal(loser.refutedBy, 'claim-001', 'the position it was counting on still holds');
});

test('the problem list is capped, and says how many more there are', async () => {
  const { problemLines, PROBLEMS_LISTED } = await import('../skill/scripts/synthesis.mjs');
  const many = Array.from({ length: PROBLEMS_LISTED + 5 }, (_, index) => `problem ${index}`);
  const lines = problemLines(many);

  assert.equal(lines.length, PROBLEMS_LISTED + 1);
  assert.match(lines[lines.length - 1], /and 5 more/);
  assert.deepEqual(problemLines(['one']), ['one'], 'nothing is added when nothing is cut');
});

// Ten claims out of several hundred is not worth a whole dispatch; more than that is.
test('the receipt says whether the drops are worth a repair attempt', async () => {
  const joined = joinedFor({ reddit: [joinedClaim()] });
  const { DROP_WITHOUT_REPAIR } = await import('../skill/scripts/synthesis.mjs');

  const bad = (count) => ({
    claims: Array.from({ length: count }, () => ({ claim: 'x', from: [{ source: 'reddit', index: 41 }] })),
  });

  assert.equal(buildIndex(bad(DROP_WITHOUT_REPAIR), joined).problems.length, DROP_WITHOUT_REPAIR);
  assert.equal(buildIndex(bad(DROP_WITHOUT_REPAIR + 1), joined).problems.length, DROP_WITHOUT_REPAIR + 1);
});

// These mean the step before this did not run. Dropping everything and writing an empty index
// would hand the run a report that looks like one which found nothing.
test('a missing manifest and a missing final-results file are still fatal', async () => {
  mkdirSync(join(sandbox.cwd, 'digmore', 'demo'), { recursive: true });
  const noManifest = await sandbox.run('synthesis.mjs', 'index', '--topic', 'demo');
  assert.equal(noManifest.code, 1);
  assert.match(noManifest.err, /no manifest at/);

  const returns = join(sandbox.cwd, 'digmore', 'demo', 'cache', '_returns');
  mkdirSync(returns, { recursive: true });
  writeFileSync(join(returns, 'source-aggregator-manifest.json'), JSON.stringify({ claims: [] }));
  const noJoined = await sandbox.run('synthesis.mjs', 'index', '--topic', 'demo');
  assert.equal(noJoined.code, 1);
  assert.match(noJoined.err, /final-results/);
});

// A shape check reads structure; it cannot know whether reddit[41] is a claim. This is the check
// that only the script can make, and it is why the manifest is expanded rather than trusted.
test('a reference that does not resolve fails loudly, naming it', () => {
  const joined = joinedFor({ reddit: [joinedClaim()] });

  const cites = buildIndex({ claims: [{ claim: 'x', from: [{ source: 'reddit', index: 41 }] }] }, joined);
  assert.match(cites.problems[0], /claims\[0\] cites reddit\[41\]/);

  const source = buildIndex({ claims: [{ claim: 'x', from: [{ source: 'mastodon', index: 0 }] }] }, joined);
  assert.match(source.problems[0], /has no <source>-final-results\.json/);

  const empty = buildIndex({ claims: [{ claim: 'x', from: [] }] }, joined);
  assert.match(empty.problems[0], /has no `from`/);
});

test('a refutation pointing at itself or at nothing is reported', () => {
  const joined = joinedFor({ reddit: [joinedClaim()] });
  const entry = { claim: 'x', from: [{ source: 'reddit', index: 0 }] };

  const itself = buildIndex({ claims: [{ ...entry, refutedByIndex: 0 }] }, joined);
  assert.match(itself.problems[0], /points at itself/);

  const nothing = buildIndex({ claims: [{ ...entry, refutedByIndex: 7 }] }, joined);
  assert.match(nothing.problems[0], /is not a claim in this manifest/);
});

// ---------------------------------------------------------------- which quote gets rendered

// Exactly one citation per claim carries `representative: true` — the quote the report renders and
// the only one the Final report writer is ever shown.

test('join elects the highest-pageQuality citation where the agent flagged none', () => {
  const elected = electRepresentative([
    { citeId: 'a', pageQuality: 'forum' },
    { citeId: 'b', pageQuality: 'primary-self' },
    { citeId: 'c', pageQuality: 'blog' },
  ]);
  assert.deepEqual(elected.map((one) => Boolean(one.representative)), [false, true, false]);
});

// The silent case: the agent flagged one, and the verdict filter then dropped it. The claim
// survives with nothing to quote, and nothing else in the run would notice.
test('a claim whose representative was dropped gets a new one', () => {
  const report = {
    claims: [
      claim([
        citation({ citeId: 'reddit_dropped', handle: 'u/spam', representative: true }),
        citation({ citeId: 'reddit_kept', handle: 'u/expert', pageQuality: 'primary-3p' }),
      ]),
    ],
  };
  const joined = joinSource(report, verdicts({ 'u/spam': 'spammer', 'u/expert': 'legit' }));

  assert.equal(joined.claims[0].citations.length, 1);
  assert.equal(joined.claims[0].citations[0].citeId, 'reddit_kept');
  assert.equal(joined.claims[0].citations[0].representative, true, 'promoted, not left without one');
});

test('a flag the agent set is kept, and only one survives however many arrive', () => {
  const elected = electRepresentative([
    { citeId: 'a', pageQuality: 'forum', representative: true },
    { citeId: 'b', pageQuality: 'primary-self', representative: true },
  ]);
  assert.deepEqual(elected.map((one) => Boolean(one.representative)), [true, false]);
});

// A value rather than a position, unlike refutedByIndex beside it: `from`'s entries are already
// stable identifiers that exist before the manifest is written, so there is nothing to miscount.
test('representativeFrom names a from reference, and index resolves it', () => {
  const joined = joinedFor({
    reddit: [joinedClaim({ citations: [{ citeId: 'reddit_r', cachedPage: 'cache/reddit/a.json', url: 'https://a.test', pageQuality: 'forum', status: 'legit', representative: true }] })],
    websearch: [joinedClaim({ citations: [{ citeId: 'websearch_w', cachedPage: 'cache/websearch/p.md', url: 'https://b.test', pageQuality: 'primary-self', status: 'no-handle', representative: true }] })],
  });
  const from = [{ source: 'reddit', index: 0 }, { source: 'websearch', index: 0 }];

  const [wins] = claimsOf(buildIndex({ claims: [{ claim: 'x', from, representativeFrom: 'reddit[0]' }] }, joined));
  assert.equal(wins.citations.find((one) => one.representative).citeId, 'reddit_r');

  // Omitted, best evidence decides — which is the rule index already applies to pageQuality itself.
  const [byQuality] = claimsOf(buildIndex({ claims: [{ claim: 'x', from }] }, joined));
  assert.equal(byQuality.citations.find((one) => one.representative).citeId, 'websearch_w');
});

// A check a position could only be range-tested against.
test('a representativeFrom that is not one of this entry\'s references is refused', () => {
  const joined = joinedFor({ reddit: [joinedClaim()] });
  const { problems } = buildIndex(
    { claims: [{ claim: 'x', from: [{ source: 'reddit', index: 0 }], representativeFrom: 'websearch[3]' }] },
    joined,
  );
  assert.match(problems[0], /representativeFrom "websearch\[3\]" is not one of/);
});

test('referenceLabel is the address read_source_claims prints', () => {
  assert.equal(referenceLabel({ source: 'reddit', index: 41 }), 'reddit[41]');
});

// ---------------------------------------------------------------- resolving a quote

// The id is looked up in the claims file beside the page it was read from — a direct lookup, never
// a scan, which is why the id only has to be unique inside one page.
test('claimsFileFor is the page stem plus -claims.json, whatever the extension', () => {
  assert.equal(claimsFileFor('cache/reddit/reddit-thread-1a2b.json'), 'cache/reddit/reddit-thread-1a2b-claims.json');
  assert.equal(claimsFileFor('cache/websearch/mux.com_pricing.md'), 'cache/websearch/mux.com_pricing-claims.json');
  assert.equal(claimsFileFor('cache/forums/no-extension'), 'cache/forums/no-extension-claims.json');
});

test('quoteResolver finds the words the citeId names', () => {
  const root = join(sandbox.cwd, 'digmore', 'demo');
  mkdirSync(join(root, 'cache', 'reddit'), { recursive: true });
  writeFileSync(
    join(root, 'cache', 'reddit', 'a-claims.json'),
    JSON.stringify({ claims: [{ citeId: 'reddit_one', quote: 'we pay half a cent' }] }),
  );

  const resolve = quoteResolver(root);
  assert.equal(resolve({ citeId: 'reddit_one', cachedPage: 'cache/reddit/a.json' }), 'we pay half a cent');
});

// Losing the words is a gap to show, not a reason to stop a phase already paid for. It resolves to
// null rather than '': an empty string reads as a quote that says nothing, and the fact checker
// judges the quotes first and the page only where they fall short.
test('a missing file or a missing id resolves to null rather than throwing', () => {
  const resolve = quoteResolver(join(sandbox.cwd, 'digmore', 'demo'));
  assert.equal(resolve({ citeId: 'reddit_one', cachedPage: 'cache/reddit/absent.json' }), null);
  assert.equal(resolve({}), null);
});

// ---------------------------------------------------------------- claims — reading them back

// `join` writes the joined files and nothing read them back, which is why the Raw report writer
// reached for `node -e` and a `cd` its dispatch forbids. These pin the shape it now gets instead.

/** The words behind `citation()`, which live in the page's claims file and nowhere else. */
const QUOTE = '$0.005 per minute';

/**
 * The joined file, plus the claims file each of its citations resolves its quote from.
 *
 * Both, because no claim stores a quote any more: `read_source_claims` follows the citation's
 * `citeId` to its page's claims file, so a fixture with only the joined file prints `Q: null` and
 * proves nothing about the quote travelling.
 */
const writeJoined = (slug, source, claims) => {
  const root = join(sandbox.cwd, 'digmore', slug);
  const dir = join(root, 'full_source_analysis');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${source}-final-results.json`), JSON.stringify({ source, claims }));

  const byPage = new Map();
  for (const entry of claims) {
    for (const cite of entry.citations ?? []) {
      if (!cite?.cachedPage || !cite?.citeId) continue;
      const file = claimsFileFor(cite.cachedPage);
      if (!byPage.has(file)) byPage.set(file, []);
      byPage.get(file).push({ citeId: cite.citeId, quote: cite.quote ?? QUOTE });
    }
  }
  for (const [file, entries] of byPage) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ url: 'https://example.test', pageQuality: 'forum', claims: entries }));
  }
};

const writePreliminary = (slug, source, observations) => {
  const dir = join(sandbox.cwd, 'digmore', slug, 'full_source_analysis');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${source}-preliminary-results.json`),
    JSON.stringify({ source, claims: [], observations }),
  );
};

const writeIndex = (slug, claims) => {
  const dir = join(sandbox.cwd, 'digmore', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'claim_index.json'), JSON.stringify({ claims }));
};

test('read_source_claims prints one entry per claim, addressed the way the manifest addresses it', async () => {
  writeJoined('demo', 'reddit', [claim([citation()]), claim([citation()], { claim: 'a second one' })]);
  const { code, out } = await sandbox.run('synthesis.mjs', 'read_source_claims', '--topic', 'demo');

  assert.equal(code, 0);
  assert.match(out, /reddit\[0\]/, 'the source and the position, which is the manifest reference');
  assert.match(out, /reddit\[1\]/);
  assert.match(out, /Mux charges \$0\.005 per minute/);
  assert.match(out, /Q: \$0\.005 per minute/, 'the quote travels with the claim');
});

test('the listing is text, never JSON', async () => {
  writeJoined('demo', 'reddit', [claim([citation()])]);
  const { out } = await sandbox.run('synthesis.mjs', 'read_source_claims', '--topic', 'demo');

  assert.throws(() => JSON.parse(out), 're-serialising would escape every quote in it');
});

test('a quantitative claim carries its value and unit; a qualitative one carries neither', async () => {
  writeJoined('demo', 'reddit', [
    claim([citation()], { kind: 'quantitative', value: 1200, unit: 'requests/day' }),
    claim([citation()], { kind: 'qualitative', claim: 'people find it confusing' }),
  ]);
  const { out } = await sandbox.run('synthesis.mjs', 'read_source_claims', '--topic', 'demo');

  assert.match(out, /central\/quantitative\s+1200 requests\/day/);
  assert.match(out, /central\/qualitative\n/, 'nothing trails a claim with no measurement');
});

test('citations and page quality never appear — index copies those from the file itself', async () => {
  writeJoined('demo', 'reddit', [claim([citation({ handle: 'u/someone' })])]);
  const { out } = await sandbox.run('synthesis.mjs', 'read_source_claims', '--topic', 'demo');

  assert.ok(!out.includes('cachedPage'), 'an agent that never sees it cannot get it wrong');
  assert.ok(!out.includes('pageQuality'));
  assert.ok(!out.includes('u/someone'));
});

test('--source reads one source, and every source is the default', async () => {
  writeJoined('demo', 'reddit', [claim([citation()])]);
  writeJoined('demo', 'websearch', [claim([citation()], { claim: 'from the open web' })]);

  const one = await sandbox.run('synthesis.mjs', 'read_source_claims', '--topic', 'demo', '--source', 'reddit');
  assert.match(one.out, /reddit\[0\]/);
  assert.ok(!one.out.includes('websearch'), 'one source means one source');

  const all = await sandbox.run('synthesis.mjs', 'read_source_claims', '--topic', 'demo');
  assert.match(all.out, /reddit\[0\]/);
  assert.match(all.out, /websearch\[0\]/);
});

test('each source is headed with its own count', async () => {
  writeJoined('demo', 'reddit', [claim([citation()]), claim([citation()])]);
  const { out } = await sandbox.run('synthesis.mjs', 'read_source_claims', '--topic', 'demo');

  assert.match(out, /===== reddit — 2 claims/);
});

test('a source with no joined file is skipped, not reported as empty', async () => {
  writeJoined('demo', 'reddit', [claim([citation()])]);
  const { out } = await sandbox.run('synthesis.mjs', 'read_source_claims', '--topic', 'demo');

  assert.ok(!out.includes('twitter'), 'a source that produced nothing has no file and no heading');
});

test('no joined files at all names the call that was missed', async () => {
  mkdirSync(join(sandbox.cwd, 'digmore', 'demo'), { recursive: true });
  const { code, err } = await sandbox.run('synthesis.mjs', 'read_source_claims', '--topic', 'demo');

  assert.equal(code, 1);
  assert.match(err, /synthesis\.mjs join/, 'it says which call comes first');
});

test('an unknown source is refused rather than read as empty', async () => {
  writeJoined('demo', 'reddit', [claim([citation()])]);
  const { code, err } = await sandbox.run('synthesis.mjs', 'read_source_claims', '--topic', 'demo', '--source', 'nope');

  assert.equal(code, 1);
  assert.match(err, /--source must be one of/);
});

test('the unknown-verb message names every verb', async () => {
  const { code, err } = await sandbox.run('synthesis.mjs', 'tally', '--topic', 'demo');
  assert.equal(code, 1);
  assert.match(err, /join, read_source_claims, read_observations, read_claims_for_report or index/);
});

// ---------------------------------------------------------------- observations — reading them back

// It reads the PRELIMINARY results: nothing joins an observation, so `join` does not carry them,
// and reading the earlier file also means this works before `join` has run.
test('read_observations reads the preliminary results, not the final ones', async () => {
  writePreliminary('demo', 'reddit', ['a question nobody answers', 'the mood shifts in March']);
  const { code, out } = await sandbox.run('synthesis.mjs', 'read_observations', '--topic', 'demo');

  assert.equal(code, 0);
  assert.match(out, /reddit — 2 observations/);
  assert.match(out, /a question nobody answers/);
  assert.match(out, /the mood shifts in March/);
});

test('every source is the default, and --source reads one', async () => {
  writePreliminary('demo', 'reddit', ['from reddit']);
  writePreliminary('demo', 'websearch', ['from the web']);

  const all = await sandbox.run('synthesis.mjs', 'read_observations', '--topic', 'demo');
  assert.match(all.out, /from reddit/);
  assert.match(all.out, /from the web/);

  const one = await sandbox.run('synthesis.mjs', 'read_observations', '--topic', 'demo', '--source', 'reddit');
  assert.match(one.out, /from reddit/);
  assert.ok(!/from the web/.test(one.out));
});

test('a source with no observations is headed with zero rather than skipped', async () => {
  writePreliminary('demo', 'reddit', []);
  const { code, out } = await sandbox.run('synthesis.mjs', 'read_observations', '--topic', 'demo');
  assert.equal(code, 0);
  assert.match(out, /reddit — 0 observations/);
});

test('no preliminary results at all names the phase that did not finish', async () => {
  mkdirSync(join(sandbox.cwd, 'digmore', 'demo'), { recursive: true });
  const { code, err } = await sandbox.run('synthesis.mjs', 'read_observations', '--topic', 'demo');
  assert.equal(code, 1);
  assert.match(err, /Extract has not finished|cache is gone/);
});

// ---------------------------------------------------------------- the claim set, for the writer

// The counterpart to read_source_claims one level later: that one addresses source claims for the
// merge, this one addresses merged claims for the draft.

const indexedClaim = (over = {}) => ({
  claimId: 'claim-001',
  claim: 'Mux charges $0.005 per minute',
  importance: 'central',
  pageQuality: 'forum',
  citations: [
    { citeId: 'reddit_one', url: 'https://example.test/1', cachedPage: 'cache/reddit/a.json', status: 'legit', representative: true },
  ],
  ...over,
});

function writeQuote(slug, page, citeId, quote) {
  const root = join(sandbox.cwd, 'digmore', slug);
  const file = join(root, claimsFileFor(page));
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify({ claims: [{ citeId, quote }] }));
}

test('read_claims_for_report prints the claim, its representative quote and every citation', async () => {
  writeIndex('demo', [indexedClaim()]);
  writeQuote('demo', 'cache/reddit/a.json', 'reddit_one', 'we pay half a cent');

  const { code, out } = await sandbox.run('synthesis.mjs', 'read_claims_for_report', '--topic', 'demo');
  assert.equal(code, 0);
  assert.match(out, /claim-001  central\/forum/);
  assert.match(out, /Q \[reddit_one\]: we pay half a cent/);
  assert.match(out, /legit  https:\/\/example\.test\/1/);
});

// The writer never opens a page, and the paths were 58KB of the file it would otherwise read.
test('cachedPage never appears, and neither do the other citations\' quotes', async () => {
  writeIndex('demo', [indexedClaim({
    citations: [
      { citeId: 'reddit_one', url: 'https://a.test', cachedPage: 'cache/reddit/a.json', status: 'legit', representative: true },
      { citeId: 'reddit_two', url: 'https://b.test', cachedPage: 'cache/reddit/b.json', status: 'unvetted' },
    ],
  })]);
  writeQuote('demo', 'cache/reddit/a.json', 'reddit_one', 'the one that renders');
  writeQuote('demo', 'cache/reddit/b.json', 'reddit_two', 'the one that does not');

  const { out } = await sandbox.run('synthesis.mjs', 'read_claims_for_report', '--topic', 'demo');
  assert.ok(!/cachedPage|cache\/reddit/.test(out), 'the writer does not open pages');
  assert.match(out, /the one that renders/);
  assert.ok(!/the one that does not/.test(out), 'one quote per claim, the representative\'s');
  assert.match(out, /unvetted  https:\/\/b\.test/, 'but every citation contributes its url and status');
});

// One call with every plausible wording, never several: an empty result is the answer.
test('--match filters on the claim and its quote, several terms ORed', async () => {
  writeIndex('demo', [
    indexedClaim(),
    indexedClaim({ claimId: 'claim-002', claim: 'Livepeer is cheaper', citations: [{ citeId: 'x', url: 'https://c.test', cachedPage: 'cache/reddit/c.json', status: 'legit', representative: true }] }),
  ]);
  writeQuote('demo', 'cache/reddit/a.json', 'reddit_one', 'we pay half a cent');

  const hit = await sandbox.run('synthesis.mjs', 'read_claims_for_report', '--topic', 'demo', '--match', 'livepeer,encoding');
  assert.match(hit.out, /1 of 2 claims matching/);
  assert.match(hit.out, /claim-002/);

  const quoted = await sandbox.run('synthesis.mjs', 'read_claims_for_report', '--topic', 'demo', '--match', 'half a cent');
  assert.match(quoted.out, /claim-001/, 'the quote is searched too, not only the claim');

  const miss = await sandbox.run('synthesis.mjs', 'read_claims_for_report', '--topic', 'demo', '--match', 'nothing at all');
  assert.equal(miss.code, 0, 'an empty result is the answer, not an error');
  assert.match(miss.out, /0 of 2 claims matching/);
});

test('a refuted claim carries its winner and reason', async () => {
  writeIndex('demo', [indexedClaim({ refutedBy: 'claim-009', refutedReason: 'the vendor page' })]);
  const { out } = await sandbox.run('synthesis.mjs', 'read_claims_for_report', '--topic', 'demo');
  assert.match(out, /REFUTED BY claim-009: the vendor page/);
});

test('read_claims_for_report before index names the call that was missed', async () => {
  mkdirSync(join(sandbox.cwd, 'digmore', 'demo'), { recursive: true });
  const { code, err } = await sandbox.run('synthesis.mjs', 'read_claims_for_report', '--topic', 'demo');
  assert.equal(code, 1);
  assert.match(err, /synthesis\.mjs index/);
});

// The repair pass rebuilds CSV rows from claims already indexed and never introduces one, so
// nothing adds to the index after it is written. A silently ignored flag would duplicate it.
test('--append is refused rather than ignored', async () => {
  mkdirSync(join(sandbox.cwd, 'digmore', 'demo'), { recursive: true });
  const { code, err } = await sandbox.run('synthesis.mjs', 'index', '--topic', 'demo', '--append', 'true');
  assert.equal(code, 1);
  assert.match(err, /--append is gone/);
});

// ---------------------------------------------------------------- resolving a quote
//
// A measured run reached the fact check with 107 of 871 citations unresolvable and reported ten,
// because each checker only ever sees its own range. Two causes, both upstream in Extract, and both
// recovered here rather than losing the evidence to a naming choice.

test('a claims file named after the whole filename resolves too', async () => {
  const { claimsFileCandidates } = await import('../skill/scripts/synthesis.mjs');

  assert.deepEqual(claimsFileCandidates('cache/websearch/a_SKILL.md'), [
    'cache/websearch/a_SKILL-claims.json',
    'cache/websearch/a_SKILL.md-claims.json',
  ]);
  assert.deepEqual(
    claimsFileCandidates('cache/reddit/no-extension'),
    ['cache/reddit/no-extension-claims.json'],
    'nothing to strip, so nothing to try twice',
  );
});

test('a bare-array claims file still yields its quotes', async () => {
  const { quoteResolver } = await import('../skill/scripts/synthesis.mjs');
  const root = join(sandbox.cwd, 'digmore', 'demo');
  mkdirSync(join(root, 'cache', 'forums'), { recursive: true });
  // The page-claims shape written wrong — 23 files in the measured run.
  writeFileSync(
    join(root, 'cache', 'forums', 'thread-claims.json'),
    JSON.stringify([{ citeId: 'forum_abc', quote: 'the words on the page' }]),
  );
  const resolve = quoteResolver(root);

  const quote = resolve({ citeId: 'forum_abc', cachedPage: 'cache/forums/thread.md' });

  assert.equal(quote, 'the words on the page');
  assert.deepEqual(resolve.misses, []);
});

// Null, never '': an empty string reads as a quote that says nothing, and the checker judges the
// quotes first and the page only where they fall short.
test('an unresolved quote is null, and the miss is recorded', async () => {
  const { quoteResolver } = await import('../skill/scripts/synthesis.mjs');
  const root = join(sandbox.cwd, 'digmore', 'demo');
  mkdirSync(root, { recursive: true });
  const resolve = quoteResolver(root);

  assert.equal(resolve({ citeId: 'reddit_gone', cachedPage: 'cache/reddit/x.json' }), null);
  assert.equal(resolve({ cachedPage: 'cache/reddit/x.json' }), null, 'no citeId at all');
  assert.equal(resolve.misses[0]?.reason, 'missingFile');
});
