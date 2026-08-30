/**
 * Filename sanitisation, shared by everything that turns a string into a cache filename.
 *
 * Two callers start from different things. `fetch.mjs` turns a URL into a name; `handle_vetting.mjs`
 * turns a handle into one. Only the sanitisation is common — collapse what a filesystem might
 * object to, cap the length, hash the overflow — so that is what lives here.
 *
 * A handle is not a URL, which is why the two cannot share more than this: `filenameOnlyFromUrl`
 * opens with `new URL(url)` and throws on `u/foo`.
 */

import { createHash } from 'node:crypto';

/**
 * The longest filename any of this produces, before an extension.
 *
 * Windows caps a path at 260 characters, and the filename is only its last part: the rest is the
 * working directory plus digmore/<slug>/cache/<source>/. 120 leaves roughly half the budget for
 * those, and the extension.
 */
export const FILENAME_ONLY_MAX = 120;

/**
 * One string in, one filesystem-safe name out — no extension, no directory.
 *
 * Every character a filesystem might object to collapses to an underscore, runs of them collapse
 * to one, and the ends are trimmed.
 *
 * A name past FILENAME_ONLY_MAX is cut and given `_<md5(hashSource)[:8]>`, so a long input stays
 * unique while a short one stays clean. **The hash is over `hashSource`, never over the
 * truncation** — two inputs sharing their first 120 sanitised characters must not share a name,
 * and the sanitised form is exactly what cannot tell them apart. A caller that sanitises a derived
 * string passes the original as `hashSource`; where the two are the same, leave it out.
 */
export function safeFilename(raw, hashSource = raw) {
  const sanitised = String(raw)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (sanitised.length <= FILENAME_ONLY_MAX) return sanitised;
  const digest = createHash('md5').update(String(hashSource), 'utf8').digest('hex').slice(0, 8);
  return `${sanitised.slice(0, FILENAME_ONLY_MAX).replace(/_+$/, '')}_${digest}`;
}

/**
 * The filename for one handle's vetting record — `cache/<source>/handles/<this>.json`.
 *
 * **Lowercased before sanitising**, because `u/Foo` and `u/foo` are one file on Windows and two on
 * Linux. A run that wrote both would vet one person twice on one platform and once on the other,
 * and the aggregation would merge two rows for one handle on exactly half the machines it runs on.
 *
 * The hash is over the lowercased handle for the same reason: it has to be the string the name was
 * built from, or two capitalisations of one long handle get two names again.
 */
export function handleFilename(handle) {
  const lowercased = String(handle).toLowerCase();
  return safeFilename(lowercased);
}
