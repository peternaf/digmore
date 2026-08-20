# Source Analyst — specialty forums

## What is on disk

`digmore/<slug>/cache/forums/`:

| File | What it is |
|---|---|
| `<name>.md` | one per thread the run read: the stripped markdown, every page merged, nesting kept |
| `<name>-claims.json` | the Page Analyst's extraction from it |

`<name>` is the URL slugged, host first, so you can see at a glance which forums the run reached.

## What forums give you that a single thread cannot

- **Which forums are alive on this topic at all.** The set of domains in this directory is a finding
  in itself: where a community has settled, and where it has moved away from.
- **Resolution rate.** Forums are where problems get solved or abandoned. Count it roughly — threads
  that reached an accepted answer against threads that trailed off. A topic where nothing resolves is
  a topic where the tooling is failing people.
- **The same regulars.** Small forums are carried by a handful of people. One name answering across
  several threads is the most credible voice the source has, and worth naming.
- **Vocabulary that differs from the vendor's.** Forums call things what users call them, which is
  often not what the marketing does. That gap is useful to the report and to any later run.
- **Age.** Forum threads run for years. A 2019 thread still getting replies means the problem was
  never fixed.

## Coverage, honestly

This is the weakest source for credibility and the most uneven for coverage:

- **Reputation signals are inconsistent.** Some forums expose post counts, badges or trust levels;
  most expose nothing. Where the Page Analyst recorded them, they are in the claims; where it did
  not, the handle carries no weight at all.
- **Blocked and unreadable forums are absent, not empty.** Forums that returned 403 on every attempt,
  or that need JavaScript, produced nothing — and nothing looks identical to a quiet forum. The Page
  Analyst reported those; carry them forward so the absence is on the record.
- **Discord threads are partial** wherever they appear. Only the visible slice loads.

## The handles — `full_source_analysis/forums-handles.json`

This is the handles file that earns the most, because the Handle Vetter has no script here and no profile
to fetch — whatever you record is very nearly all it will ever have.

- **The handle form is the forum's own**, prefixed with the domain so two forums' identical display
  names stay apart: `doom9/<name>`. The same display name on two forums is not evidence of one
  person; never merge them.
- **`signals` matter more here than anywhere.** Post count, join date, badges, Discourse trust level,
  accepted-answer status, staff or moderator marking. Any of those plus on-topic activity is enough
  for `legit`; without them the verdict is `unknown`, which keeps the quote with an "anonymous,
  unverified" caveat rather than dropping it (`../../phases/synthesize_phase_e.md` §1). What you
  record here decides how much weight a forum voice carries, not whether it appears.
- **Anonymised posts have no handle.** Where a forum scrubs attribution after an account closes, the
  words remain and the person does not. No row.

## The players — `full_source_analysis/forums-players.json`

Forums are where niche tools surface that no article covers, so this file often carries entities that
appear nowhere else in the run. Those are exactly the ones a five-document floor will cut, and that
is the intended outcome — record them anyway and let the count decide.

- **Users call things what users call them.** The forum's name for a product frequently is not the
  vendor's, and both belong in `aliases`.
- **A long support thread is one document**, however many times the product is named in it. Forums
  repeat a name more than any other source; the count must not.
- **Vendor staff post here.** A brand-name mention from an account with a staff badge is the company
  talking about itself — record the entity, and the handle carries the rest.

## Known gaps to record in `full_source_analysis/forums.md`

- Forums that were found in search and could not be read, by domain and reason.
- Threads cut short by the fetch budget mid-pagination, where the resolution was probably on a page
  nobody reached.
- Any forum whose posts are anonymised after account closure, where quotes exist but attribution
  does not.
