# Branch Searcher — specialty forums

The catch-all for forums with no dedicated script: ProductHunt, IndieHackers, niche subforums like
Doom9 or Hydrogenaudio, public Discord threads exposed on the web.

Free, no key.

## Find the forums first, then search them

**If you know the forum:**

```
WebSearch site:<forum-domain> <query>
```

**If you do not:**

```
WebSearch <topic phrase> forum discussion
```

Let the domains that surface tell you where this topic actually gets discussed, then run the
`site:` query against the ones that keep recurring. Two or three keywords either way, and no
`after:` — recency is judged when the thread is read (`../../recency.md`).

## What you return

Thread URLs, in the `branch-searcher` shape.

Rank a thread by how likely it is to carry a resolution — the accepted fix, the correction, the
"this worked" reply. Those sit at the end of a thread, so a long active thread usually outranks a
short one on the same question.

## What lands on disk

Nothing from this step. The threads themselves are fetched by the Page Analyst, which follows each
one to its last page.
