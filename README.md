# Digmore

An LLM plugin that turns AI research into decision-ready data — exhaustive, structured, and with a
vetted source behind every claim.

> **Quick start:** `/plugin marketplace add peternaf/digmore`, then run `/digmore` in Claude Code.

## Why Digmore?

Ask any LLM to research a market and you get a confident page of prose. Ask where a number came from
and it falls apart: fields invented to fill a column, links that 404, one page of search results
called "deep research".

Digmore is built the other way round. It runs a five-phase pipeline — scope, extract, vet,
synthesize, audit — and the phases are the point:

- **It reads places a generic LLM cannot.** Reddit threads, Hacker News, Twitter — not just whatever
- **Tailored for executive research.** Digmore doesn't only rely on the non-deterministic nature of LLMs, baked into the skill there are hand made deterministic sections that make sure you will receive exactly the results you are looking for. So that the research will provide decision ready information for you to act on each time.
- **Sources get vetted before they get quoted.** Every handle carries a quality tag; anonymous or
  brand-new accounts are quoted with a caveat or not at all.
- **Claims get audited after they are written.** Claims in the summary are
  re-checked against their source URL. Anything that no longer resolves, or no longer says what was
  claimed, is flagged in the report rather than left to look solid.
  a search engine surfaces.

## Commands

Everything runs through one skill:

```
/digmore <command> <target>
```

| Command | What it does |
|---|---|
| `/digmore landscape <topic>` | Map a market: who the players are, what they ship, what people say about them |
| `/digmore competitor <name>` | One company in depth: their product, their gaps, what customers complain about |
| `/digmore ask <question>` | Any business question that is not one of the above. The catch-all |
| `/digmore gtm <name>` | Go-to-market teardown: how something is being promoted, and by whom |

```
/digmore landscape ai video editing
/digmore competitor descript
/digmore ask which crm do small agencies actually keep
/digmore gtm notion
```

### No command

Run `/digmore` on its own and it explains what it can do, then points at the three commands most
likely to fit. You can also skip the command entirely and just describe what you want — Digmore
picks the closest one and tells you which it picked:

```
/digmore
/digmore who is winning in ai note taking and why
```

If it has not been configured yet, it sorts that out first.

### Depth and prompting

Two flags, matched anywhere in the request — before the command, after it, in the middle of a
sentence. All four combinations are valid:

| | Default | `--fast` |
|---|---|---|
| **Default** | Asks you at the decision points, full depth | Asks you, fewer sources, faster |
| **`--auto`** | No questions, full depth | No questions, fewest sources, fastest |

- `--auto` — runs end to end and answers its own questions. Say this up front if you are going to
  walk away.
- `--fast` — fewer sources and shallower vetting. A first look, not a final answer.

```
/digmore landscape ai video editing --fast
/digmore competitor descript --auto
/digmore --auto --fast ask what do people hate about mailchimp
```

## What you get

The answer lands in the terminal first — one to three sentences, no hedging. Everything else is
written to `digmore/<topic>/` in whatever directory you are working in, so your research sits with
the project it belongs to:

| File | What's in it |
|---|---|
| `<topic>-executive-summary.md` | The report. Fixed sections, every substantive claim carrying an in-text citation |
| `players.csv` | The companies or people found, one row each, with the fields that matter for the question |
| `experts.csv` | The voices worth listening to, with why each one qualifies |
| `raw_research_outcomes.md` | The unsummarized findings, kept whole |
| `audit.md` | Per-claim verdicts from the audit phase, and what was dropped |
| `cache/` | Everything fetched, kept as it arrived, so a re-run doesn't re-fetch it |

Research the same topic again and Digmore picks up where it left off rather than starting over.

Source content is never rewritten into Digmore's own words. It gets shortened with `…` where it runs
long, and quoted as it was written.

## Where it looks

Web search, Hacker News, Similarweb, forums, and any documents or text you hand it. Reddit and
Twitter need an API key — see below.

Hand it your own material by naming the file: `/digmore ask what do our churn notes say about
pricing — see notes/churn-q2.md`. Those files are read locally and never leave your machine.

## Get API access

To get access to enhanced online research results join our waiting list for the Digmore API access. You will get:

- Vetted Reddit posts and comments
- Twitter posts from vetted accounts
- Social media data sources: LinkedIn, Instagram, Facebook, YouTube — including transcripts
- Technical data sources: GitHub discussions, Stack Overflow answers
- Business data sources: Crunchbase, Owler/ZoomInfo
- Marketing data sources: SEO/GEO analysis, and Ahrefs for search keywords
- A large list of other online data sources
- No limits on websearch amounts (Claude Code has a 200 limit)

Join by emailing `waitlist@digmore.ai`.

## Without an API key

Digmore works. Reddit and Twitter are skipped, and the report says so — you get a real run on
everything else rather than an error. Tell Digmore you do not want a key and it stops asking.

## Installation

**Claude Code:**

```bash
/plugin marketplace add peternaf/digmore
```

Then open `/plugin` and install Digmore from the list.

Claude Code only for now. Node 20 or newer is required — Digmore's scripts run on it, with no npm
dependencies to install.

## Configuration

One file, `~/.digmore/settings.json`, created on first run. It holds the API base URL, your key, and
whether you have said you do not want one. Nothing else goes in it, and Digmore never edits your own
Claude Code settings — including the two below, which are yours to set.

### Raising the web search limit

Claude Code allows 200 web searches per session. A deep run can want more than that, and when it
runs out mid-research you have to start a new session and continue. You can raise the ceiling to
1000 by adding this to `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION": "1000"
  }
}
```

If that file already has an `env` block, put the line inside it rather than replacing the block.
Start a new session for it to take effect.

Ask Digmore if you would rather be walked through it — it will show you the exact change and where
to put it, but it will not edit the file for you.

### Increasing the sub-agent limit

Digmore's discovery phase fans out one sub-agent per source × angle — a full run dispatches 25 or
more at once. Claude Code allows 20 concurrent sub-agents by default, and the ones past that limit
fail rather than queue:

```
Concurrent subagent limit reached. You can run 20 subagents at once.
```

Digmore handles it — it re-dispatches in batches and tells you the run was throttled — but the run
is slower and the search is narrower than it would otherwise be. Raise the ceiling to 100 by adding
this to `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS": "100"
  }
}
```

If that file already has an `env` block, put the line inside it rather than replacing the block.
Start a new session for it to take effect. Both settings can sit in the one block:

```json
{
  "env": {
    "CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION": "1000",
    "CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS": "100"
  }
}
```

## License

Apache 2.0. See [LICENSE](LICENSE).

---

Built by [Peter Naftaliev](https://github.com/peternaf)
