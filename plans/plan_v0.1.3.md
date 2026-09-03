# digmore V0.1.3 — a Reddit branch cannot search without limit

## What changes

A branch searcher is told to search Reddit **once**, site-wide. Nothing enforces it. On
`walled-garden-data-apis` — 6 angles, so 6 Reddit branches — the run wrote **25** search files.
Four rewordings on one angle, and no error anywhere.


**The cap is enforced by counting files, not by trusting a prose rule.** The cache filename gains the
branch, so the files a branch has already written *are* its ledger — no second file to keep, no
tally to hold, and it survives a restart because each `api.mjs` call recounts from disk.

**One call, several queries.** `reddit search` takes a `--branch` and repeated `--query`. Each
response is written before the next query is sent, so a run killed mid-batch keeps whole files.

**The filename becomes two 5-character hashes** — `reddit-search-<branchhash5>-<queryhash5>.json`.
The identity is then in the name, so a duplicate query is a filename test and no file is opened to
compare. This reverses the readable-name decision recorded in `api.mjs` §"Search cache names are
readable rather than hashed", and its whole collision apparatus — four words, stopwords, the `-2`
probe — goes with it. `_request` stays inside the file as the record of what was asked.

**A duplicate query is not free - it counts against the cap of the branch.**

**Over the cap, the script refuses**, on `EXIT.USAGE` (2). The message says the searches already ran
and where they are, so a re-dispatched searcher reads them rather than being stuck:

```
reddit search: branch <label> has already run its 5 searches.
Their results are in digmore/<slug>/cache/reddit/ — read those files rather than searching again.
```

### In all four run kinds

The cap is a script-level bound needing no answer from the user, so it behaves identically in
`--auto` and manual. `--fast` reduces it. Nothing is skipped in any of the four.

## A. Scripts — `api.mjs`

- [x] 1. `hash5(text)` — 5 hex characters of a sha256.
- [x] 2. `searchCacheName(branch, query)` → `reddit-search-<hash5>-<hash5>.json`.
- [x] 3. Delete `queryWords`, `FILENAME_STOPWORDS`, `QUERY_WORDS_IN_NAME`, and the readable-name docstring at `:145`.
- [x] 4. Delete the `-2` probe loop and `MAX_CACHE_PROBES`. `_request` stays.
- [x] 5. `search` takes required `--branch` and repeated `--query`; the positional query goes.
- [x] 6. Docstring: `--branch` is Plan's label, never agent-composed.
- [x] 7. Count `reddit-search-<hash5(branch)>-*` before requesting.
- [x] 8. A stored query is a cache hit, no request, still counted.
- [x] 9. Over budget: run what fits, refuse the surplus, never fail.
- [x] 10. No budget left: `EXIT.USAGE`, the message above, nothing requested.
- [x] 11. Write each response before the next request.
- [x] 12. Return keyed by query, plus what was refused.
- [x] 13. Usage header at `:11`.

## B. Scripts — `config.mjs`

- [x] 14. `reddit: { searchesPerBranch: 5 }` in `CONFIGURATION_DEFAULTS`.
- [x] 15. `FAST_REDUCTIONS` — `reddit: { searchesPerBranch: 3 }`.
- [x] 16. `CONFIGURATION_NOTES` entry.

## C. Scripts — tests (`tests/api-reddit.test.mjs`)

- [x] 17. Rewrite `:40-44`.
- [x] 18. The name is two hashes, stable across runs.
- [x] 19. Two branches one query → two files; one branch twice → one file.
- [x] 20. The cap counts one branch's files only.
- [x] 21. A repeat is a cache hit and is not refused.
- [x] 22. Over the cap: what fits runs, the surplus is named, nothing throws.
- [x] 23. No budget left throws and makes no request.
- [x] 24. Killed mid-batch: the next call runs only what is missing.
- [x] 25. `--branch` and at least one `--query` are required.

## D. Skill — `branch_searcher_agent/reddit.md`

- [x] 26. §"One search, site-wide" — a budget, not a prohibition. Site-wide and no-subreddit-pass unchanged.
- [x] 27. The new command form.
- [x] 28. The filename example, `:100-106`.
- [x] 29. Check the directory before searching.
- [x] 30. On the refusal, read the stored files.
- [x] 31. A ceiling, not a quota — left unspent where the angle holds one question.
- [x] 32. Every query on this branch's own angle.
- [x] 33. Rewordings are not distinct queries.
- [x] 34. All queries chosen before the call; no second pass to react with.

## E. Skill — everywhere else

- [x] 35. `branch_searcher_agent/index.md` — the *Runs*, *Settings that control it* and *`--fast`* rows.
- [x] 36. `source_analyst_agent/reddit.md:9` — the filename, and "one search per branch".
- [x] 37. `phases/index.md` — the layout tree.
