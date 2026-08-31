# Digmore

An LLM plugin that turns AI research into decision-ready data — exhaustive, structured, and with a
vetted source behind every claim.

> **Quick start:** `/plugin marketplace add peternaf/digmore`, then run `/digmore` in Claude Code.

## Why Digmore?

Ask any LLM to research a market and you get a confident page of prose. Ask where a number came from
and it falls apart: fields invented to fill a column, links that 404, one page of search results
called "deep research".

Digmore is built the other way round. It runs a six-phase pipeline — plan, extract, vet, enrichment,
synthesize, audit — and the phases are the point:

- **It reads places a generic LLM cannot.** Reddit threads, Hacker News, Twitter — not just whatever
  a search engine surfaces.
- **Tailored for executive research.** Digmore doesn't only rely on the non-deterministic nature of LLMs, baked into the skill there are hand made deterministic sections that make sure you will receive exactly the results you are looking for. So that the research will provide decision ready information for you to act on each time.
- **Sources get vetted before they get quoted.** Every handle carries a quality tag; accounts the run
  could not identify are quoted with a caveat, and accounts it identified as spam or as throwaways are
  not quoted at all.
- **Every claim gets checked after it is written.** Not a sample — every claim the report renders is
  read back against the text Digmore stored when it first read the page, and anything that text does
  not carry is **deleted from the report** rather than flagged for you to chase. `audit.md` names what
  went and why.

  **So "verified" here means one thing: the claim is supported by what we read.** The check is against
  the stored copy, not the live page, so it catches a fabricated quote or a misread source — the
  failures that matter — and it does not tell you whether a link has since died or a page has been
  edited. Digmore fetched every citation while the run was going, which is when the URL was known
  good.

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
| `observations.md` | Cross-source patterns the run noticed, merged and unverified. The summary's last section is a verbatim copy of it, so it is the one part of the report carrying no citations |
| `audit.md` | What the audit deleted, refuted or dropped, and which step did it |
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

**One file, `~/.digmore/settings.json`, created on first run. Open it — everything Digmore lets you
change is in there, with its current value.**

It holds the API base URL, your key, whether you have said you do not want one, and **every number
that bounds how much work a run does**: how many angles it plans, how many pages it reads per angle
and source, how many people it vets per source, how many experts it follows afterwards, how deep it
reads a comment thread, and the rest. Each one appears twice — once at the top level for a full run,
and once under `fast` for `--fast`.

Four things worth knowing before you edit it:

- **Nothing is hidden.** The file is written out complete, every knob and its default, so you can see
  what exists without having to know what to look for. When an update adds a new one, it is filled
  into your file the next time Digmore runs and your own values are left alone.
- **`--fast` never loosens what you tightened.** It takes the lower of the two, so if you set a
  full-mode number below the fast one you get yours in both modes. **One setting reads the other way
  round**, and says so in the file: `enrich.minPlayerDocuments` is a floor rather than a budget — how
  many documents must mention a company before it earns a row — so the lower fast value admits more
  companies, not fewer. A fast run gathers far less material, and a floor sized for a full run would
  make it report no companies at all.
- **A `0` under `fast` means that step is skipped**, deliberately, and it wins over the full-mode
  value.
- **A value Digmore cannot use falls back to its default** rather than being carried into a run — a
  string, a negative, a fraction. It does not fail; it just ignores that edit, so check the run's
  opening report if a change appears not to have taken.

Every run prints the numbers it is actually applying before it starts, fast-mode reductions already
worked out. That printed report is the truth about a given run; the file is where you change it.

Digmore never edits your own Claude Code settings — including the two below, which are yours to set.

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
