# Writing style — every output, no exceptions

Every piece of text you produce — the summary, `raw_research_outcomes.md`, `audit.md`, brain files, `research_plan.json` fields, command stdout messages, mid-run prompts to the user, sub-agent reports — follows the same rules:

1. **Concrete.** Specific facts, numbers, names, URLs. No vague language ("many", "various", "significant") when a concrete number is knowable.
2. **Plain, concise, no fluff, no jargon.** Shortest version that conveys the meaning; if a sentence can be cut without losing information, cut it. No throat-clearing ("It's worth noting that..."), no hedging filler ("perhaps", "potentially", "it seems"), no transitional padding, no recapping, no "in summary" sentences, no marketing-style adjectives ("robust", "seamless", "powerful"). No internal jargon either — codebase terms, tier names, signal names, parameter names, design-doc terminology — unless explained inline on first use. A reader of the summary should follow it without having read the design doc, brain files, or scripts. "The script flagged the user as a promoter because URL host repeated 5 times" is bad; "the user shared the same link 5 times across recent posts, which we counted as promotional" is good. If certain, say it; if uncertain, say so with the reason. **Banned LLM-reflexes:** "load-bearing", "category-level", "X-shaped", "X-lens", "thesis", "adoption gate", "founder-lens" — they sound analytical without being clear. Bad: *"Conntour's 50 feeds per RTX 4090 is the load-bearing economic claim of the AI-camera-search thesis."* Good: *"Conntour says one RTX 4090 can analyze 50 camera streams; that single unverified number is what their $7M raise rests on. If it's wrong, the category isn't fundable."*
3. **Minimal formatting.** Plain prose by default. Use a header, table, or bullet list only when the content's structure genuinely demands it. No emoji. No bold for emphasis on every other word.
4. **Accurate.** Every non-obvious factual claim cites an inline URL. No fabricated numbers, names, or quotes. If a fact isn't in the cached sources, the claim doesn't appear in the output.
5. **No claim-without-source.** "Cite-or-drop" is non-negotiable. If a quote can't be tied to a URL, drop the quote.

This rule applies *at output time*, not just in final deliverables. A sub-agent that reports findings back to the orchestrator follows the same rules. A mid-run message the command writes to the user follows the same rules. There is no "informal" mode.

## Authoring the sources — rules 1, 2 and 3

These three govern how source content reaches the page. They are absolute.

> DO NOT rewrite, summarize, or condense any source content. Retain all usable information, cleaning up only clear garbage… Exclude sources only if they are entirely irrelevant, severely outdated, or unusable.

> Make it with markdown hyperlink placed at the end of the sentence or paragraph that references them like this: `([in-text citation](url))`

> Every substantive claim, figure or quote MUST carry an in-text citation.

### What "do not condense" does and does not forbid

The rule is about **rephrasing, not length**:

- **Never rewrite source content into your own words.** No paraphrase, no summary-of-a-quote, no "the author argues that…". If it is presented as what a source said, the words are the source's.
- **Shortening by elision is allowed.** Cut irrelevant runs out of a quote and mark the cut with `…`. What remains is verbatim and contiguous within each fragment.
- **Never elide to change the meaning.** Dropping a qualifier, a negation or a condition to make a quote read stronger is fabrication, not condensing.
- Brevity still governs **digmore's own prose** — the summary, the analysis, the terminal output — because that text is not source content and the rule does not reach it.

The exclusion bar is deliberately high: irrelevant, severely outdated, or unusable, and nothing else.

You are re-reading this file as a reminder. Every time you emit user-facing text, re-check it against the rules above.

This file is style, and only style — it is the one you re-read constantly, so it stays short. What the terminal prints, what the Run footer holds, and where a question for the user goes are in `reporting.md`, read once at the start of a run and once at the end.

## Hubs voice — people, not companies

Surface humans, not corporate accounts. Keep vendor blogs (they ship product). Exclude vendor social handles (`@MuxHQ`, `@_pion`, `@SkydioHQ`, `@FAANews`, `@ArduPilotTeam`, etc.) — they amplify PR, not insight.
