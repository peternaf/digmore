# Cross-agent JSON schemas

Six shapes, one per kind of sub-agent. They are the format agents hand data back in — plumbing between agents, not user-facing output, and they do not vary by topic or by command. Markdown files (`<topic-slug>.md`, `audit.md`, etc.) and the CSVs are what the user reads; those *do* vary, and nothing here constrains them.

**Nothing enforces these shapes at the point of return.** A sub-agent hands back text; there is no mechanism that makes a wrong shape impossible. So each block below is paste-ready into the dispatch prompt — `dispatch.md` is where it goes, as the middle of its three slots — and every returned payload is checked afterwards, see "Checking what comes back" at the end of this file. Skip the check and a malformed return flows into the report looking exactly like a good one.

The same shapes live in machine-readable form at `scripts/schemas.json`, which is what the checker reads. If you edit a block here, edit that file too: they are compared in the test suite and a mismatch fails the build.

## Scope agent

Decomposes the topic into 3–6 angles. The floor in the shape below is **2**, not 3, because `--quick` runs exactly two (`modes.md`) — the shape has to accept the shallower run, and the prompt is what asks for 3–6 in a full one.

```json
{
  "type": "object",
  "required": ["topic", "angles"],
  "properties": {
    "topic": {"type": "string", "description": "The slugged topic in its canonical phrasing."},
    "angles": {
      "type": "array",
      "minItems": 2,
      "maxItems": 6,
      "items": {
        "type": "object",
        "required": ["label", "query", "rationale"],
        "properties": {
          "label": {"type": "string", "description": "Short kebab-case angle name, e.g. 'incumbents', 'pricing-tiers'."},
          "query": {"type": "string", "description": "Concrete search-ready phrasing for this angle."},
          "rationale": {"type": "string", "description": "Why this angle matters for the topic."}
        }
      }
    }
  }
}
```

## Branch searcher

One per branch — a research direction paired with one source. Returns the candidate URLs that branch found.

```json
{
  "type": "object",
  "required": ["results"],
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["url", "title", "relevance"],
        "properties": {
          "url": {"type": "string", "format": "uri"},
          "title": {"type": "string"},
          "relevance": {"type": "number", "minimum": 0, "maximum": 1, "description": "The branch searcher's 0..1 estimate of how on-topic this URL is for its direction."}
        }
      }
    }
  }
}
```

## Source extractor

Per URL, after the page is in cache. Returns structured claims.

```json
{
  "type": "object",
  "required": ["sourceQuality", "claims"],
  "properties": {
    "sourceQuality": {
      "type": "string",
      "enum": ["primary-self", "primary-3p", "secondary", "blog", "forum", "internal", "unreliable"]
    },
    "publishDate": {"type": "string", "format": "date", "description": "ISO date if visible on page; omit otherwise."},
    "claims": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["claim", "quote", "importance", "kind"],
        "requiredWhen": [
          {"field": "kind", "equals": "quantitative", "require": ["value", "unit"]}
        ],
        "properties": {
          "claim": {"type": "string", "description": "One-line checkable statement."},
          "quote": {"type": "string", "description": "Verbatim supporting quote from the page."},
          "importance": {"type": "string", "enum": ["central", "supporting", "tangential"]},
          "kind": {"type": "string", "enum": ["quantitative", "qualitative"]},
          "value": {"type": ["number", "string"], "description": "Required if kind=quantitative."},
          "unit": {"type": "string", "description": "Required if kind=quantitative. E.g. 'M USD raised', 'monthly visits', 'requests/sec'."}
        }
      }
    }
  }
}
```

When `kind=quantitative`, `value` and `unit` MUST be populated. When `qualitative`, leave them empty. That is what `requiredWhen` above encodes, and it is the one conditional rule the checker enforces.

## `vet_user` (from source scripts)

The source scripts (`api.mjs reddit`, `hackernews.mjs`, `api.mjs twitter`) emit this on stdout. The orchestrator does not validate it against a shape here; the script and the API enforce it. Local content carries no handle, so nothing is vetted there (see `sources/local.md`).

```json
{
  "verdict": "legit | unknown | promoter | troll | spammer",
  "signals": {"key": "value", "...": "..."},
  "reason": "Short human-readable explanation"
}
```

**On Reddit these three keys arrive inside the `reddit user` response**, alongside the snapshot. The verdict is computation over comments that request has already fetched, so it rides along, and `recent_comments` — one object per comment, each with its own body and subreddit — comes back with it for the topical-relevance check in `phases/vet_phase_c.md` step 4. Hacker News and Twitter still emit the bare object above from their own vet verbs.

When the orchestrator dispatches a *sub-agent* for an LLM judgment (e.g. Twitter `unknown` → expert vs. marketer), the sub-agent returns:

```json
{
  "type": "object",
  "required": ["verdict", "reason"],
  "properties": {
    "verdict": {"type": "string", "enum": ["legit", "unknown", "promoter", "troll", "spammer"]},
    "reason": {"type": "string", "description": "Short justification, no fluff."},
    "evidence": {
      "type": "array",
      "items": {"type": "string", "description": "Short verbatim excerpts from the read tweets that support the verdict."}
    }
  }
}
```

## C — Synthesizer

Returns findings + run stats.

```json
{
  "type": "object",
  "required": ["findings", "stats"],
  "properties": {
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["claim", "confidence", "sources"],
        "properties": {
          "claim": {"type": "string"},
          "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
          "section": {"type": "string", "description": "Which summary section this finding belongs to (command-specific)."},
          "sources": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["url", "sourceQuality"],
              "properties": {
                "url": {"type": "string", "format": "uri"},
                "sourceQuality": {"type": "string", "enum": ["primary-self", "primary-3p", "secondary", "blog", "forum", "internal", "unreliable"]},
                "handle": {"type": "string", "description": "e.g. 'u/foo', 'gh/foo', 'hn/foo', 'x/foo'. Omit if no commenter."},
                "verdict": {"type": "string", "enum": ["legit", "unknown", "promoter"]}
              }
            }
          },
          "evidence": {"type": "string", "description": "Verbatim quote that anchors the claim."},
          "surprise": {"type": "boolean", "description": "True if this is a surprise / contrarian / misconception finding."}
        }
      }
    },
    "stats": {
      "type": "object",
      "properties": {
        "totalClaimsConsidered": {"type": "integer"},
        "claimsDroppedLowQuality": {"type": "integer"},
        "claimsMerged": {"type": "integer"}
      }
    }
  }
}
```

## D — Verifier

One per top-50 claim.

```json
{
  "type": "object",
  "required": ["verdict"],
  "properties": {
    "verdict": {"type": "string", "enum": ["verified", "url-broken", "content-changed", "uncited", "manual-verify-required", "low-confidence-unverified", "refuted"]},
    "evidence": {"type": "string", "description": "What the verifier found at the URL (verbatim excerpt or short summary)."},
    "refuted": {"type": "boolean", "description": "True if the claim was actively refuted by another source."},
    "counterSource": {"type": "string", "format": "uri", "description": "URL of the contradicting source, if any."},
    "reason": {"type": "string", "description": "Short human-readable explanation when verdict ≠ verified."}
  }
}
```

## Checking what comes back

Every payload above gets checked before anything is built on it. The shape names the checker takes are the keys of `scripts/schemas.json`: `scope`, `branch-searcher`, `source-extractor`, `vet-judgment`, `synthesizer`, `verifier`.

Write the sub-agent's returned JSON to `digmore/<slug>/cache/_returns/<label>.json`, then:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/validate.mjs" <shape> digmore/<slug>/cache/_returns/<label>.json
```

Exit 0 means use it. Exit 1 prints the problems, one line each, already worded to be pasted at the sub-agent. Exit 2 means the payload was not JSON at all, or the call was wrong — there is no document to repair, so treat it as a failed return.

**What it checks:** the keys that must be there, the JSON type of each one, allowed enum values, array and number bounds, and the one conditional rule above. **What it does not check:** whether a quote is real, whether a URL resolves, whether a price is a price. Those are the audit phase and, later, typed fields. A payload that passes is well-formed, not true.

### The repair pass — one attempt, then drop

On exit 1, re-prompt **the same sub-agent** once. The repair prompt carries three things and nothing else:

1. the checker's exact errors,
2. the shape it should have matched,
3. its own previous output.

And it carries these two instructions, in these words:

> Fix the structure of what you already returned. Do not search, fetch, or research again — this is a formatting correction, not another pass at the work.

> If a required field has no value in the source you read, say so and leave the item out. Do not fill it to make the check pass.

That second one is the point. Repair pressure is how a missing quote becomes an invented quote, and an invented quote passes every check in this file.

Re-check the repaired payload. Still failing → **drop that item**, name it in the run's Issues, and record it in `audit.md`. Never a second repair: a fix-and-recheck loop that can run twice can run forever, and `MAX_REPAIRS` in `validate.mjs` is 1 so the limit is a fact rather than a judgement call.

Count the repairs and the drops per run in `audit.md` (`audit_phase_e.md` §5). A shape that needs repairing on most returns is a broken dispatch prompt, and that is only visible if the number is written down.
