# Page Analyst — specialty forums

A forum thread, reached with `fetch.mjs`. Free, no key. This is the source where pagination matters
most.

## Get it

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/fetch.mjs" <url> \
  --output-dir digmore/<slug>/cache/forums
```

The script names the file and returns the path. Already there → `cached: true`, no request spent.

## Follow the thread to its end, then read

**The useful part of a forum thread is at the end** — the accepted fix, the correction, the "this
worked after all". The first page is the problem being stated; the last page is what came of it. A
thread read only to page one usually reports the complaint and misses the answer.

Paginate all the way first, merge, then parse. Full rule in `index.md` §"follow the document to its
end".

## Strip it

Per `index.md`. On a forum the shape is most of the evidence: **who replied to whom, in what order,
and who was answering whom.** Keep the nesting and the author on every post. Quoted-reply blocks
matter too — a post that quotes an earlier one and disagrees is an argument, and flattened it reads
as agreement.

## Page quality

`forum` — this is community discussion. One exception: the forum's own pinned moderator post
stating a policy is `primary-self` for that forum. Definitions in `../../page_quality.md`.

Forum handles carry the weakest credibility signal of any source. Where the forum exposes reputation
— post count, badges, Discourse trust level, accepted-answer status — record it with the claim, so
Vet has something to work with.

## What lands on disk

Two files in `digmore/<slug>/cache/forums/`, on the name `fetch.mjs` derived from the URL:

| File | What is in it |
|---|---|
| `<name>.md` | the stripped markdown, the whole thread, every page merged |
| `<name>-claims.json` | your claims |

The raw pages are deleted once merged.

## When the forum will not let you in

Three failures, each reported as itself rather than as an empty result:

- **403 / 429 on every attempt.** Many forums fingerprint the user agent. Try WebFetch once, per
  `index.md`; if that is walled too, report the forum as blocked and move on. Logged-in scraping is
  not an option here.
- **The page needs JavaScript to render.** `fetch.mjs` is HTTP-only, so the content never arrives.
  Report it as unreadable — the thread exists, digmore cannot see it.
- **A Discord thread exposed on the web.** Only the visible slice loads. Treat what you get as
  supporting evidence, never as the whole conversation, and say the rest was not visible.

## Known gap

Forums that anonymise posts after an account closes leave the body visible and the attribution gone
— same as Reddit's `[deleted]`. Not quotable to a person.
