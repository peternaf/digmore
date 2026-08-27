import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeFilename, handleFilename, FILENAME_ONLY_MAX } from '../skill/scripts/utils.mjs';
import { filenameOnlyFromUrl } from '../skill/scripts/fetch.mjs';

test('safeFilename collapses what a filesystem objects to, and trims the ends', () => {
  assert.equal(safeFilename('mux.com/pricing'), 'mux.com_pricing');
  assert.equal(safeFilename('a  b??c'), 'a_b_c', 'runs collapse to one underscore');
  assert.equal(safeFilename('/leading/and/trailing/'), 'leading_and_trailing');
  assert.equal(safeFilename('keep.these-and_those'), 'keep.these-and_those');
});

test('a short name is left clean, with no hash', () => {
  assert.ok(!/_[0-9a-f]{8}$/.test(safeFilename('mux.com_pricing')));
});

test('a long name is truncated and hashed over hashSource, not over the truncation', () => {
  // Two inputs that agree for far longer than the cap. Hashing the truncated form would
  // give them one filename, which is the collision the parameter exists to prevent.
  const shared = `host.example.com/${'segment/'.repeat(40)}`;
  const first = safeFilename(shared, `${shared}one`);
  const second = safeFilename(shared, `${shared}two`);

  assert.ok(first.length <= FILENAME_ONLY_MAX + 9, 'truncated plus _<8 hex>');
  assert.match(first, /_[0-9a-f]{8}$/);
  assert.notEqual(first, second, 'different sources, different names');
});

test('handleFilename lowercases, because Windows and Linux disagree about u/Foo', () => {
  assert.equal(handleFilename('u/Foo'), handleFilename('u/foo'));
  assert.equal(handleFilename('u/Foo'), 'u_foo');
  assert.equal(handleFilename('hn/Some.User'), 'hn_some.user');
  assert.equal(handleFilename('x/@bar'), 'x_bar');
});

test('filenameOnlyFromUrl still behaves as it did, now built on safeFilename', () => {
  assert.equal(
    filenameOnlyFromUrl('https://news.ycombinator.com/item?id=43426022'),
    'news.ycombinator.com_item_id_43426022',
  );
  assert.equal(filenameOnlyFromUrl('https://mux.com/pricing'), 'mux.com_pricing');
  assert.throws(() => filenameOnlyFromUrl('u/foo'), /not a URL/, 'a handle is not a URL');
});
