# Page Analyst — Twitter (X)

Tweets come back as JSON from digmore's API. **No `fetch.mjs`, no stripping.**

**Needs an API key.** Without one `api.mjs` exits 4 and Twitter is unavailable — not a failure.

## The command

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/api.mjs" twitter tweet <id>... --topic <slug>
```

Takes one or more tweet ids, batched up to 100 per call, and asks only for ids not already cached.
The Branch Searcher harvested each id as the last path segment of `x.com/<handle>/status/<id>`.

On a failure the script says what happened on stderr — read that rather than decoding the exit code. Two change what you do: `4` means no API key, so this source is disabled rather than failed, and `3` means the source is temporarily unavailable. Anything else is a failure to report as one.

## Always run this before quoting a tweet

WebSearch cannot see tweet text. x.com renders client-side, so a crawler gets the page title —
**roughly the first fifteen words**. That is what the Branch Searcher had.

Quote a tweet from the search result and you have published a preview that looks like a quote.
Nothing errors when this step is skipped, which is exactly why it has to be a habit: **if a tweet is
going in the report, its body comes from here.**

## Not to be confused with

`api.mjs twitter tweets <handle>` — that is a user's recent timeline, and it belongs to the Handle
Vetter. `tweet` takes ids; `tweets` takes a handle.

## What lands on disk

Two files in `digmore/<slug>/cache/twitter/`:

| File | Written by |
|---|---|
| `twitter-tweet-<id>.json` | the script — one per tweet, so re-quoting across runs never re-fetches |
| `twitter-tweet-<id>-claims.json` | you |

## When the source is walled

Exit 3 means the source is temporarily unavailable. That is all it means and all to say about it —
the causes are the API's business, not the user's, and not the user's to fix.

Report Twitter as a source the run could not fully reach. Already-cached tweets stay usable.

## Page quality

`primary-self` when the account is the subject speaking for itself — a company account, a founder
announcing something. `forum` when it is commentary from anyone else. Definitions in
`../../vetting.md`.

## Recency

Read the date off each tweet's `created_at`. The search that found it carried no date filter — on
x.com an `after:` filter suppresses organic tweets and biases toward marketing accounts, so the
window is applied here instead (`../../recency.md`).
