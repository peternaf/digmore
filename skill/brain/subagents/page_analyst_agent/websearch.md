# Page Analyst — the open web

An ordinary web page, reached with `fetch.mjs`. This is the source where the full job applies:
fetch, paginate, merge, strip, read.

## Get it

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/fetch.mjs" <url> \
  --output-dir digmore/<slug>/cache/websearch
```

The script names the file from the URL and returns the path it wrote. If the page is already there
it comes back with `cached: true` and no request is spent.

Walled? `fetch.mjs` first, then WebFetch, saving under the `filename_only` the error carried. See
`index.md` §"when the page is walled".

## Is a fetch needed at all

The Branch Searcher already has the title and a short snippet. Fetch when the page is long-form — an
article, a documentation page, a multi-thousand-word post — which is nearly always why a URL was
ranked worth reading in the first place.

Where a snippet genuinely answers the angle and the page has nothing more, say so and skip the
fetch. That is a real outcome, not a failure to try.

## Strip it

Per `index.md`: one markdown file, wrapping out, shape kept, title as the first heading. Articles
carry their structure in headings and lists; keep them, because a claim's place in an argument is
part of what it means.

## Source quality — decided from the domain and the shape

| What the page is | Tag |
|---|---|
| Government, academic, regulatory filing, analyst report, third-party benchmark | `primary-3p` |
| The subject's own site — docs, pricing, changelog, first-party benchmark | `primary-self` |
| Established outlet or well-known engineering blog | `secondary` |
| Individual blog, Medium, Substack, personal site | `blog` |
| Content farm, obviously AI-generated, marketing collateral, dead or paywalled-no-cache | `unreliable` |

Full definitions in `../../vetting.md`. `primary-self` is accurate about the vendor's own product and
biased about everything else — never take a marketing claim at face value because the tag is high.

**If the page's author turns up elsewhere as a Reddit, HN or Twitter handle, say so in the claim.**
That is how a web author becomes a person the Handle Vetter can check.

## What lands on disk

Two files in `digmore/<slug>/cache/websearch/`, on the name `fetch.mjs` derived from the URL:

| File | What is in it |
|---|---|
| `<name>.md` | the stripped markdown, every page merged |
| `<name>-claims.json` | your claims |

The raw pages `fetch.mjs` wrote are deleted once the merged file exists.

## Known gaps

- **Paywalls.** A paywalled page surfaces as thin, low-content text. Report it as blocked, not as
  empty — and look for the same content quoted in a forum or an outlet.
- **Publish dates are unreliable.** The search carried no date filter, so check the date on the page
  itself when a claim turns on how recent it is (`../../recency.md`).
