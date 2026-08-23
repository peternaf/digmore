/**
 * validate.mjs — the shape check every sub-agent return goes through.
 *
 * Structure only. These tests pin what it catches, what it deliberately does not, and
 * scripts/subagent_returns.json is the single copy of every shape: the orchestrator pastes an
 * entry into a dispatch prompt, and this checker reads the same file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox, repoRoot } from './helpers.mjs';

const schemasJson = JSON.parse(
  readFileSync(join(repoRoot, 'skill', 'scripts', 'subagent_returns.json'), 'utf8'),
);

/** Write the payload beside the sandbox cwd and check it, the way the skill does. */
async function check(shape, payload) {
  const sandbox = new Sandbox();
  try {
    writeFileSync(join(sandbox.cwd, 'payload.json'), JSON.stringify(payload));
    return await sandbox.run('validate.mjs', shape, 'payload.json');
  } finally {
    await sandbox.cleanup();
  }
}

const paths = (result) => (result.json?.errors ?? []).map((error) => error.path);

// ------------------------------------------------------------------ payloads

const scoutReturn = () => ({
  queries: ['video api providers 2026', 'video api pricing complaints'],
  vocabulary: ['per-minute billing', 'live-to-VOD', 'ingest latency'],
  recurring_names: ['Mux', 'Cloudflare Stream', 'Livepeer'],
  angles: [
    {
      label: 'per-minute-pricing',
      query: 'video api per-minute billing complaints at scale',
      rationale: 'Pricing is what the request turns on, and the vocabulary calls it per-minute.',
    },
  ],
});

const pageClaims = () => ({
  url: 'https://example.com/mux-pricing',
  pageQuality: 'secondary',
  claims: [
    { claim: 'Mux charges per minute', quote: '$0.005 per minute', importance: 'central', kind: 'qualitative' },
  ],
});

// ------------------------------------------------------------------ the happy path

test('every shape in subagent_returns.json has a name the CLI will accept', async () => {
  const sandbox = new Sandbox();
  try {
    const result = await sandbox.run('validate.mjs', '--shapes');
    assert.equal(result.code, 0);
    assert.deepEqual(result.json.shapes, Object.keys(schemasJson));
  } finally {
    await sandbox.cleanup();
  }
});

test('a well-formed payload exits 0 and says so', async () => {
  const result = await check('scope', scoutReturn());
  assert.equal(result.code, 0);
  assert.equal(result.json.valid, true);
  assert.deepEqual(result.json.errors, []);
});

test('optional fields may be absent', async () => {
  // raw-report-writer's claimIndexError is only present when the index failed its check.
  const result = await check('raw-report-writer', {
    claimsSurviving: 40,
    claimsMerged: 6,
    sections: [],
    claimsDeletedUnsourced: [],
    droppedSubjects: [],
  });
  assert.equal(result.code, 0);
});

// ------------------------------------------------------------------ what it catches

test('a missing required key is named by path', async () => {
  const payload = scoutReturn();
  delete payload.vocabulary;
  const result = await check('scope', payload);
  assert.equal(result.code, 1);
  assert.equal(result.json.valid, false);
  assert.deepEqual(result.json.errors, [{ path: 'vocabulary', message: 'required' }]);
});

test('a required key nested in an array item carries its index', async () => {
  // Two claims, and the second is the broken one — an error that named only the key
  // would leave the caller opening every item to find which.
  const payload = pageClaims();
  payload.claims.push({ claim: 'Livepeer is cheaper', quote: 'about a tenth', importance: 'supporting', kind: 'qualitative' });
  delete payload.claims[1].importance;
  const result = await check('page-claims', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['claims[1].importance']);
});

test('an empty string is missing, not present', async () => {
  // A sub-agent with no answer that does not want to say so returns "".
  const payload = pageClaims();
  payload.claims[0].quote = '';
  const result = await check('page-claims', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['claims[0].quote']);
});

test('a bad enum value lists what was allowed', async () => {
  const payload = pageClaims();
  payload.pageQuality = 'pretty-good';
  const result = await check('page-claims', payload);
  assert.equal(result.code, 1);
  assert.match(result.json.errors[0].message, /must be one of/);
  assert.match(result.json.errors[0].message, /"primary-3p"/);
  assert.match(result.json.errors[0].message, /got "pretty-good"/);
});

test('the wrong JSON type is reported with both types', async () => {
  const payload = scoutReturn();
  payload.vocabulary = 'per-minute billing, live-to-VOD';
  const result = await check('scope', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(result.json.errors, [
    { path: 'vocabulary', message: 'expected array, got string' },
  ]);
});

test('a wrong-typed value is not then checked against the rules for its keys', async () => {
  // Otherwise one bad type produces a cascade of nonsense errors and the repair prompt
  // is unreadable.
  const payload = pageClaims();
  payload.claims[0] = 'Mux charges per minute';
  const result = await check('page-claims', payload);
  assert.equal(result.json.errors.length, 1);
});

test('number bounds are enforced', async () => {
  const result = await check('branch-searcher', {
    results: [{ url: 'https://example.com', title: 'Example', relevance: 1.4 }],
    droppedCount: 0,
    lowestSurvivingScore: 0.4,
  });
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['results[0].relevance']);
});

// The searcher cuts its own list now, so the file has to say what the cut cost. The rows it
// discarded are not kept — nothing backfills from them — and these two numbers are what
// audit.md's dropped-for-budget record is written from.
test('a branch list says what its cut discarded', async () => {
  const survivors = [{ url: 'https://example.com', title: 'Example', relevance: 0.8 }];
  const ok = await check('branch-searcher', {
    results: survivors, droppedCount: 37, lowestSurvivingScore: 0.62,
  });
  assert.equal(ok.code, 0);

  const missing = await check('branch-searcher', { results: survivors });
  assert.equal(missing.code, 1);
  assert.deepEqual(paths(missing).sort(), ['droppedCount', 'lowestSurvivingScore']);
});

// A branch whose search returned less than the cap dropped nothing, and that is a real answer
// rather than an absent one.
test('dropping nothing is zero, not an omission', async () => {
  const result = await check('branch-searcher', {
    results: [{ url: 'https://example.com', title: 'Example', relevance: 0.9 }],
    droppedCount: 0,
    lowestSurvivingScore: 0.9,
  });
  assert.equal(result.code, 0);
});

test('every problem is reported at once, not just the first', async () => {
  // The repair pass gets one attempt, so it has to be told everything in one go.
  const payload = pageClaims();
  delete payload.pageQuality;
  delete payload.claims[0].claim;
  payload.claims[0].importance = 'vital';
  const result = await check('page-claims', payload);
  assert.deepEqual(paths(result).sort(), [
    'claims[0].claim',
    'claims[0].importance',
    'pageQuality',
  ]);
});

// ------------------------------------------------------------------ the conditional rule

test('a quantitative claim without its unit fails', async () => {
  const payload = pageClaims();
  payload.claims[0] = {
    claim: 'Mux raised $105M',
    quote: 'raised $105 million',
    importance: 'central',
    kind: 'quantitative',
    value: 105,
  };
  const result = await check('page-claims', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(result.json.errors, [
    { path: 'claims[0].unit', message: 'required when kind is "quantitative"' },
  ]);
});

test('a qualitative claim without a unit is fine', async () => {
  const result = await check('page-claims', pageClaims());
  assert.equal(result.code, 0);
});

// ------------------------------------------------------------------ the local branch

test('internal is an allowed source quality', async () => {
  // The user's own documents are tagged `internal`; before this the enum stopped at
  // `unreliable` and the branch could not label its own content.
  const payload = pageClaims();
  payload.pageQuality = 'internal';
  const result = await check('page-claims', payload);
  assert.equal(result.code, 0);
});

test('internal is allowed on a claim-index citation too', async () => {
  const payload = claimIndex();
  payload.claims[0].pageQuality = 'internal';
  payload.claims[0].citations[0].pageQuality = 'internal';
  payload.claims[0].citations[0].cachedPage = 'cache/local/churn.md';
  const result = await check('claim-index', payload);
  assert.equal(result.code, 0);
});

// ------------------------------------------------------------------ fast mode

test('one query is enough — the scout’s return is not measured by volume', async () => {
  const payload = scoutReturn();
  payload.queries = payload.queries.slice(0, 1);
  const result = await check('scope', payload);
  assert.equal(result.code, 0);
});

// Coming back with no vocabulary means the agent never found out what the subject calls
// itself — which is the one thing every later branch query inherits.
test('an empty vocabulary fails', async () => {
  const payload = scoutReturn();
  payload.vocabulary = [];
  const result = await check('scope', payload);
  assert.equal(result.code, 1);
  assert.match(result.json.errors[0].message, /at least 1 item/);
});

// ------------------------------------------------------------------ bad invocations

test('a payload that is not JSON exits 2 — there is nothing to repair', async () => {
  const sandbox = new Sandbox();
  try {
    writeFileSync(join(sandbox.cwd, 'payload.json'), 'Here are the results I found:');
    const result = await sandbox.run('validate.mjs', 'scope', 'payload.json');
    assert.equal(result.code, 2);
    assert.match(result.err, /is not JSON/);
    assert.equal(result.out, '');
  } finally {
    await sandbox.cleanup();
  }
});

// ------------------------------------------------------------------ the claims stay on disk

const receipt = (over = {}) => ({
  url: 'https://example.com/a', outcome: 'ok', claimCount: 4, pagesRead: 1,
  fetchedWith: 'fetch.mjs', ...over,
});

// The Page Analyst hands back receipts, not its extraction. Hundreds of documents are read
// in one job, and the claims arrays are what used to fill the orchestrator's context.
test('a page-analyst return is receipts and no claims', async () => {
  const result = await check('page-analyst', [receipt(), receipt({ url: 'https://example.com/b' })]);
  assert.equal(result.code, 0);
});

// One dispatch now reads a batch, so the return is an array even when the batch held one URL.
test('a bare receipt object is refused — the return is an array', async () => {
  const result = await check('page-analyst', receipt());
  assert.equal(result.code, 1);
});

test('a receipt without its page count is refused', async () => {
  // Only the orchestrator can total pages against the branch's fetch budget.
  const result = await check('page-analyst', [{ url: 'https://example.com/a', outcome: 'ok', claimCount: 4, fetchedWith: 'fetch.mjs' }]);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['[0].pagesRead']);
});

// The label names the batch, not the page, so without the URL a receipt cannot be matched
// back to what was sent — or named in audit.md when the page was blocked.
test('a receipt without its URL is refused', async () => {
  const result = await check('page-analyst', [{ outcome: 'ok', claimCount: 4, pagesRead: 1, fetchedWith: 'fetch.mjs' }]);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['[0].url']);
});

test('zero claims is a real outcome, not a missing one', async () => {
  // A page we could not read and a page that yielded nothing are different findings.
  for (const outcome of ['blocked', 'nothing-found']) {
    const result = await check('page-analyst', [receipt({ outcome, claimCount: 0, pagesRead: 0, fetchedWith: 'none' })]);
    assert.equal(result.code, 0, outcome);
  }
});

// One wall never fails the four reads beside it: outcome is per URL, which is the whole
// reason the shape is an array rather than one verdict over the batch.
test('a blocked URL sits beside ok ones in the same return', async () => {
  const result = await check('page-analyst', [
    receipt(),
    receipt({ url: 'https://example.com/b', outcome: 'blocked', claimCount: 0, pagesRead: 0, fetchedWith: 'none' }),
    receipt({ url: 'https://example.com/c' }),
  ]);
  assert.equal(result.code, 0);
});

// notes is for what outcome cannot express, and it is optional — an ordinary read leaves it out.
test('notes is optional and takes a string', async () => {
  const withNotes = await check('page-analyst', [receipt({ notes: 'the URL served a different article' })]);
  assert.equal(withNotes.code, 0);
  const wrongType = await check('page-analyst', [receipt({ notes: ['a', 'list'] })]);
  assert.equal(wrongType.code, 1);
});

// A page's standing — undated, second-hand, sold by the party describing the problem — belongs
// on the claims file, where the Source Analyst and the Raw report writer read it. The receipt's
// notes field carries only what the orchestrator can act on, and it never weighs a citation.
test('pageNote is optional and lives on the claims file', async () => {
  const withNote = pageClaims();
  withNote.pageNote = 'Undated, and the figures are second-hand.';
  assert.equal((await check('page-claims', withNote)).code, 0);
  assert.equal((await check('page-claims', pageClaims())).code, 0);

  const wrongType = pageClaims();
  wrongType.pageNote = { undated: true };
  assert.equal((await check('page-claims', wrongType)).code, 1);
});

test('a claim records who said it', async () => {
  const payload = pageClaims();
  payload.claims[0].handle = 'u/someone';
  const result = await check('page-claims', payload);
  assert.equal(result.code, 0);
});

// ------------------------------------------------------------------ the handle roster

const roster = () => ({
  source: 'reddit',
  handles: [
    {
      handle: 'u/someone',
      topImportance: 'central',
      claimCount: 3,
      documentCount: 2,
      documents: ['cache/reddit/reddit-thread-1a2b.json', 'cache/reddit/reddit-thread-3c4d.json'],
    },
    {
      handle: 'u/passerby',
      topImportance: 'none',
      claimCount: 0,
      documentCount: 1,
      documents: ['cache/reddit/reddit-thread-1a2b.json'],
    },
  ],
});

// ------------------------------------------------------- a citation's handle is source-dependent

const sourceRawReport = (citation) => ({
  source: 'websearch',
  claims: [{
    claim: 'Mux charges $0.005 per minute of encoding',
    quote: '$0.005 per minute of encoding',
    importance: 'central',
    kind: 'quantitative',
    value: 0.005,
    unit: 'USD per minute',
    citations: [citation],
  }],
  observations: 'Pricing pages agree; the forums do not.',
});

// The open web and the user's own documents have authors rather than accounts — which is why
// neither writes a handles file. Requiring one here forced the Source Analyst to invent a byline,
// and a fabricated handle scores 'unvetted' (an account we failed to check) where an absent one
// scores 'no-handle' (there was never an account). The second is true and the first is not.
test('a citation on a source with no accounts omits its handle', async () => {
  const result = await check('source-raw-report', sourceRawReport({
    cachedPage: 'mux.com_pricing.md', url: 'https://mux.com/pricing', pageQuality: 'primary-self',
  }));
  assert.equal(result.code, 0);
});

test('a citation still carries the page it was read from', async () => {
  const result = await check('source-raw-report', sourceRawReport({
    url: 'https://mux.com/pricing', pageQuality: 'primary-self',
  }));
  assert.equal(result.code, 1);
  assert.ok(paths(result).some((path) => path.endsWith('cachedPage')));
});

test('a handle is still accepted where the source has accounts', async () => {
  const result = await check('source-raw-report', sourceRawReport({
    cachedPage: 'reddit-thread-abc.json', url: 'https://reddit.com/r/x/abc',
    handle: 'u/someone', pageQuality: 'forum',
  }));
  assert.equal(result.code, 0);
});

test('a roster of ranked handles passes', async () => {
  const result = await check('source-handles', roster());
  assert.equal(result.code, 0);
});

// A handle who appeared but said nothing still gets a row, so Vet can reach them on a thin
// source. "none" is what marks them, and it has to be a legal value.
test('none is an allowed topImportance', async () => {
  const payload = roster();
  payload.handles = [payload.handles[1]];
  const result = await check('source-handles', payload);
  assert.equal(result.code, 0);
});

test('a roster for a source with no accounts is refused', async () => {
  // Only reddit, hackernews, twitter and forums have handles to rank.
  const payload = roster();
  payload.source = 'websearch';
  const result = await check('source-handles', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['source']);
});

// The Handle Vetter on forums has no script and no profile to fetch — the cached pages this
// handle appears in are the only evidence there is, and they are named per URL, so nothing
// else can recover the list. A row without it is a forum handle nobody can judge.
test('documents is required, and empty is not a list', async () => {
  const payload = roster();
  delete payload.handles[0].documents;
  const missing = await check('source-handles', payload);
  assert.equal(missing.code, 1);
  assert.deepEqual(paths(missing), ['handles[0].documents']);

  const emptied = roster();
  emptied.handles[0].documents = [];
  const empty = await check('source-handles', emptied);
  assert.equal(empty.code, 1, 'a handle appears in at least one document or it is not a handle');
});

// Vet fills these in later; the Source Analyst writes the file without them. Absent has to
// stay legal, or every roster fails its check the moment it is written.
test('the verdict fields Vet adds later may all be absent', async () => {
  const result = await check('source-handles', roster());
  assert.equal(result.code, 0);
});

test('a verdict outside the five is caught', async () => {
  const payload = roster();
  payload.handles[0].verdict = 'suspicious';
  const result = await check('source-handles', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['handles[0].verdict']);
});

// ------------------------------------------------------------------ the claim index
//
// Everything after the Raw report writer depends on this file: the fact-check dispatches are
// built from it, the claim texts split the summary's paragraphs, and every verdict joins back
// through a claimId. A malformed index is not a bad section — it is a fact check that silently
// checks nothing. It is also the only new file in the run a script can check, which is why it
// gets one while the CSVs and the summary do not.

const claimIndex = () => ({
  claims: [
    {
      claimId: 'claim-001',
      claim: 'Mux charges $0.005 per minute of encoding',
      importance: 'central',
      pageQuality: 'primary-self',
      citations: [
        {
          quote: '$0.005 per minute',
          url: 'https://mux.com/pricing',
          cachedPage: 'cache/websearch/mux.com_pricing.md',
          status: 'no-handle',
          pageQuality: 'primary-self',
        },
      ],
    },
  ],
});

test('a claim index passes', async () => {
  const result = await check('claim-index', claimIndex());
  assert.equal(result.code, 0);
});

// The URL is what the report cites and what a reader clicks; cachedPage is the file the fact
// check reads the claim against. Neither is derivable from the other — on the three scripted
// sources the script names the file and the URL is not in it at all.
for (const field of ['url', 'cachedPage', 'quote', 'status']) {
  test(`a citation without ${field} is refused`, async () => {
    const payload = claimIndex();
    delete payload.claims[0].citations[0][field];
    const result = await check('claim-index', payload);
    assert.equal(result.code, 1);
    assert.deepEqual(paths(result), [`claims[0].citations[0].${field}`]);
  });
}

// unvetted and no-handle are the majority of a real run — a handle below the vetting cap, and
// every claim from the open web. Treating either as an error would gut the index.
for (const status of ['legit', 'unknown', 'unvetted', 'promoter', 'no-handle']) {
  test(`status ${status} is allowed on a citation`, async () => {
    const payload = claimIndex();
    payload.claims[0].citations[0].status = status;
    const result = await check('claim-index', payload);
    assert.equal(result.code, 0);
  });
}

// spammer and throwaway citations are dropped by the join, not labelled, so they can never
// reach the index. A status that names one means the filter did not run.
test('a dropped verdict cannot appear as a citation status', async () => {
  const payload = claimIndex();
  payload.claims[0].citations[0].status = 'spammer';
  const result = await check('claim-index', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['claims[0].citations[0].status']);
});

// Written onto the loser at merge time, in the one pass that holds both claims. It is the only
// route a refutation has to audit.md, and the file is never edited after it is written.
test('refutedBy and refutedReason are optional, and legal together', async () => {
  const payload = claimIndex();
  assert.equal((await check('claim-index', payload)).code, 0, 'absent on a claim nothing beat');

  payload.claims[0].refutedBy = 'claim-004';
  payload.claims[0].refutedReason = 'the vendor pricing page outranks a forum recollection';
  assert.equal((await check('claim-index', payload)).code, 0);
});

// ------------------------------------------------------------------ the writing receipts
//
// Four agents write the report and hand back a receipt rather than the work. Each records
// something that leaves no other trace: what was discarded, what could not be closed, what was
// deleted. A receipt that arrives as prose is one nobody can count, which is why they have
// shapes at all — nothing computes on them.

test('the raw report writer returns counts and its two discard lists', async () => {
  const result = await check('raw-report-writer', {
    claimsSurviving: 128,
    claimsMerged: 31,
    sections: [{ csv: 'paid-promoter-programmes.csv', rows: 7 }],
    claimsDeletedUnsourced: [
      { claim: 'everyone moved off Acme in 2025', sourceReport: 'reddit-raw-report.json' },
    ],
    droppedSubjects: [{ subject: 'Acme pricing', reason: 'every citation was a spammer' }],
  });
  assert.equal(result.code, 0);
});

// The deletions leave no trace on disk by definition — the claim is gone — and audit.md is
// written by the orchestrator two steps later, so the receipt is the only route they have.
test('an unsourced deletion names the report it came from', async () => {
  const result = await check('raw-report-writer', {
    claimsSurviving: 1,
    claimsMerged: 0,
    sections: [],
    claimsDeletedUnsourced: [{ claim: 'a claim with no URL behind it' }],
    droppedSubjects: [],
  });
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['claimsDeletedUnsourced[0].sourceReport']);
});

test('the final report writer returns every claim it dropped, with a reason', async () => {
  const result = await check('final-report-writer', {
    claimsDropped: [{ claimId: 'claim-009', reason: 'no room in its section' }],
    sectionsDrafted: 8,
    findingsWritten: 34,
  });
  assert.equal(result.code, 0);
});

test('a dropped claim without its reason is refused', async () => {
  const result = await check('final-report-writer', {
    claimsDropped: [{ claimId: 'claim-009' }],
    sectionsDrafted: 8,
    findingsWritten: 34,
  });
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['claimsDropped[0].reason']);
});

// One entry per item across all three lists — what the user asked for, what the plan promised,
// what the run set out to answer — plus one per sentence the report cannot back.
test('the reviewer answers per item, across all three kinds', async () => {
  const result = await check('final-report-reviewer', {
    items: [
      { kind: 'request', asked: 'name the cheapest provider', status: 'present', quote: 'Livepeer at $0.001/min' },
      { kind: 'section', asked: 'Players', status: 'present', quote: '| Mux | 11.1M |' },
      { kind: 'angle', asked: 'pricing-tiers', status: 'missing', reason: 'nothing was gathered on it' },
    ],
    unsourced: [{ sentence: 'Most teams self-host by year two.', section: 'Verdict' }],
  });
  assert.equal(result.code, 0);
});

// An item it could not judge comes back as unjudged with the reason, never as present — the
// two are indistinguishable to the orchestrator otherwise, and one of them is a gap.
test('unjudged is a status the reviewer may return', async () => {
  const result = await check('final-report-reviewer', {
    items: [{ kind: 'angle', asked: 'reception', status: 'unjudged', reason: 'the draft was not on disk' }],
    unsourced: [],
  });
  assert.equal(result.code, 0);
});

test('a status outside the four is caught', async () => {
  const result = await check('final-report-reviewer', {
    items: [{ kind: 'section', asked: 'Players', status: 'probably-fine' }],
    unsourced: [],
  });
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['items[0].status']);
});

// A citation lost with a deleted duplicate is otherwise untraceable, and audit.md has no other
// way to say which claims left the report here rather than failing the fact check. Reported by
// claimId, because a list of ids is exact where a description of deleted prose is not.
test('the copy editor reports removals by claimId, with both sections', async () => {
  const result = await check('final-report-copy-editor', {
    removals: [{ claimId: 'claim-012', cutFrom: 'Buying signals', keptIn: 'Players' }],
    rewrites: [{ section: 'Verdict', sentence: 'Self-hosting costs more than teams expect.' }],
    flagsRaised: 9,
    flagsFixed: 8,
  });
  assert.equal(result.code, 0);
});

test('a removal that does not say where the idea was kept is refused', async () => {
  const result = await check('final-report-copy-editor', {
    removals: [{ claimId: 'claim-012', cutFrom: 'Buying signals' }],
    rewrites: [],
    flagsRaised: 0,
    flagsFixed: 0,
  });
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['removals[0].keptIn']);
});

// ------------------------------------------------------------------ the fact check
//
// Only what failed comes back, plus a count. Nothing downstream reads a pass, so returning one
// entry per claim would be a few hundred entries mostly saying "fine", in the one context that
// has to survive the run.

test('a clean paragraph returns nothing unsupported, and says how much it read', async () => {
  const result = await check('claim-fact-checker', {
    unsupported: [],
    statementsJudged: 7,
    pagesRead: 3,
    evidenceUnreadable: false,
  });
  assert.equal(result.code, 0);
});

// The counts are what show the work happened: a paragraph returning nothing alongside 7 and 3
// was read and found clean, where one returning 0 and 0 did nothing at all.
test('the counts are required even when nothing failed', async () => {
  const result = await check('claim-fact-checker', { unsupported: [], evidenceUnreadable: false });
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result).sort(), ['pagesRead', 'statementsJudged']);
});

// Quoted rather than keyed on a claimId, because what the redraft has to remove is text — and
// because a statement carrying no marker can fail too, which an id could never have covered.
test('an unsupported statement is quoted, with the reason the pages do not carry it', async () => {
  const result = await check('claim-fact-checker', {
    unsupported: [
      {
        statement: 'Mux charges $0.005 per minute.',
        reason: 'the cached pricing page gives $0.01/min',
      },
    ],
    statementsJudged: 4,
    pagesRead: 2,
    evidenceUnreadable: false,
  });
  assert.equal(result.code, 0);
});

test('an unsupported statement without its reason is refused', async () => {
  const result = await check('claim-fact-checker', {
    unsupported: [{ statement: 'Mux charges $0.005 per minute.' }],
    statementsJudged: 4,
    pagesRead: 2,
    evidenceUnreadable: false,
  });
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['unsupported[0].reason']);
});

// Where none of a paragraph's pages could be read there was no evidence to search, so returning
// its sentences as unsupported would blame the report for a file we lost. The paragraph is
// still deleted — nothing unverified reaches the user — but as unchecked, not as unsupported.
test('the unreadable-evidence stop returns no statements at all', async () => {
  const result = await check('claim-fact-checker', {
    unsupported: [],
    statementsJudged: 0,
    pagesRead: 0,
    evidenceUnreadable: true,
  });
  assert.equal(result.code, 0);
});

// Vet writes these back once per source, and they are the run's only record of a rejection.
test('the roster carries a vetting outcome once Vet has run', async () => {
  const payload = roster();
  Object.assign(payload.handles[0], {
    verdict: 'promoter',
    topicalRelevance: 'low',
    verdictReason: 'same URL host in 7 of 20 recent comments',
    inExperts: false,
  });
  const result = await check('source-handles', payload);
  assert.equal(result.code, 0);
});

// The Handle Vetter's own return has no shape, deliberately: nothing is built on it directly,
// so the gate is on this file, where the two fields anyone acts on actually land.
test('throwaway is a verdict on the roster', async () => {
  const payload = roster();
  payload.handles[0].verdict = 'throwaway';
  assert.equal((await check('source-handles', payload)).code, 0);
});

// Transcribed from what a profile printed, never inferred. It is the only store there is —
// experts.csv takes legit people alone — so a promoter's linked accounts live here or nowhere.
test('statedIdentifiers is optional and takes a list of strings', async () => {
  const payload = roster();
  payload.handles[0].statedIdentifiers = ['github.com/someone', 'someone.dev'];
  assert.equal((await check('source-handles', payload)).code, 0);
});

test('troll is gone from the vocabulary', async () => {
  // Nothing ever produced it: not the API's enum, not a heuristic, not the voice rubric.
  const payload = roster();
  payload.handles[0].verdict = 'troll';
  const result = await check('source-handles', payload);
  assert.equal(result.code, 1);
  assert.deepEqual(paths(result), ['handles[0].verdict']);
});

// The dispatch template tells the orchestrator to paste a shape into the prompt verbatim and
// gave it no way to get one. Left to improvise it reaches for `node -e` and a hand-written
// JSON.parse — a second place the file is read, and a first place it can be read wrongly.
test('--shape prints one entry, indented, ready to paste', async () => {
  const sandbox = new Sandbox();
  try {
    const result = await sandbox.run('validate.mjs', '--shape', 'scope');
    assert.equal(result.code, 0);
    assert.deepEqual(result.json, schemasJson.scope, 'the entry, unaltered');
    assert.match(result.out, /\n {2}"type"/, 'indented — it goes into a prompt a sub-agent reads');
  } finally {
    await sandbox.cleanup();
  }
});

test('--shape with an unknown or missing name exits 2 and lists the real ones', async () => {
  const sandbox = new Sandbox();
  try {
    const unknown = await sandbox.run('validate.mjs', '--shape', 'nope');
    assert.equal(unknown.code, 2);
    assert.match(unknown.err, /claim-index/);

    const missing = await sandbox.run('validate.mjs', '--shape');
    assert.equal(missing.code, 2);
    assert.match(missing.err, /needs a name/);
  } finally {
    await sandbox.cleanup();
  }
});

test('an unknown shape name exits 2 and lists the real ones', async () => {
  const result = await check('claims', {});
  assert.equal(result.code, 2);
  assert.match(result.err, /unknown shape: claims/);
  assert.match(result.err, /page-claims/);
});

test('a missing file exits 2', async () => {
  const sandbox = new Sandbox();
  try {
    const result = await sandbox.run('validate.mjs', 'scope', 'nothing-here.json');
    assert.equal(result.code, 2);
    assert.match(result.err, /cannot read/);
  } finally {
    await sandbox.cleanup();
  }
});

test('no arguments exits 2 with the usage line', async () => {
  const sandbox = new Sandbox();
  try {
    const result = await sandbox.run('validate.mjs');
    assert.equal(result.code, 2);
    assert.match(result.err, /usage/);
  } finally {
    await sandbox.cleanup();
  }
});
