# Branch Searcher — the user's own documents

The material the user handed over: files they named, and text they pasted into the conversation.
Free, no key, no network. The only source whose content never leaves the machine.

This source joins the run only when the user actually handed something over.

## There is no query here

Every other source is searched. This one is already in front of you. You read the same handed-over
material every other `local` branch reads, through **your** angle, and return what is relevant to it.

Five angles means five dispatches over the same documents, each looking for something different.
That is the point: one pass per angle finds what one pass for everything would blur together.

## Copy before reading

Copy each file the user named into `digmore/<slug>/cache/local/`, keeping the original filename.
Pasted text goes to `digmore/<slug>/cache/local/pasted-<n>.md`, with a first line recording when it
arrived and what the user said it was.

Two reasons. Everything a run works from lives under the topic directory; and a file the user later
edits or moves would otherwise make the run unreproducible and its citations unresolvable.

**This is the one source where this agent writes something other than a search response.**

## What is in scope

Documents and text: markdown, plain text, CSV, a spreadsheet export, meeting notes, a pasted
transcript saved to disk.

Out of scope, and say so plainly once rather than skipping it silently:

- **PDFs** — not this version.
- **Links.** A link is not a document. A web page belongs to `websearch.md` or `forums.md`; a video
  digmore cannot read at all.
- **Directories the user did not name.** Read what you were given, nothing beside it.

## What you write

The `branch-searcher` shape, with the **file path** in `url` — the copy under
`digmore/<slug>/cache/local/`, not the user's original location.

`relevance` is how much that document has to say about your angle.

## No date window

`../../recency.md`'s two-year cutoff is about the public web going stale. The user chose this file; its
age is their call. Note the date if the file carries one and it matters to a claim.
