/**
 * The fact check's paragraphs — Audit's counterpart to `handle_vetting.mjs`.
 *
 *   node factcheck.mjs prepare --topic <slug>
 *   node factcheck.mjs serve   --topic <slug> --from <n> --to <n>
 *
 * `audit_phase_f.md` has always said "a script joins each id to its row in claim_index.json for its
 * citations", and no script did. A run wrote its own into cache/_misc/ mid-way instead — the habit
 * `resuming.md` names about the extract worklist: "Two sessions each wrote their own throwaway
 * version of it… Never write your own."
 *
 * **`prepare` is the orchestrator's, `serve` is each Claim Fact Checker's**, the same split Vet
 * uses. The orchestrator holds a count and a range and never the document: composing eighty prompts
 * out of a 116 KB summary it was carrying is what this replaces.
 *
 * Named for the job rather than the phase, as `handle_vetting.mjs` and `expert_selection.mjs` are.
 * An `audit.mjs` would sit beside `audit.md` and read as the thing that writes it, which is
 * `runlog.mjs finding`.
 *
 * stdout JSON, stderr errors.
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson, topicDir } from './players.mjs';

/** One comment at the end of a paragraph, naming the claims it renders: `<!-- claims: 001, 004 -->`. */
const MARKER = /<!--\s*claims:([^>]*?)-->/g;

/**
 * Audit's own directory, beside the sources rather than inside `_misc`. The phase writes a work
 * list, the prose the writer has to mark, and one verdict per paragraph — three kinds of file with
 * one owner, which is what `_misc` ("scratch that belongs to no source") stopped describing once
 * there were three.
 */
export const WORKLIST_PATH = 'cache/audit/worklist.json';
export const UNMARKED_PATH = 'cache/audit/unmarked.md';

function markersIn(text) {
  return text.match(MARKER) ?? [];
}

/** `<!-- claims: 001, claim-004 -->` → ['claim-001', 'claim-004']. Both spellings appear in drafts. */
export function claimIdsIn(text) {
  const ids = [];
  for (const marker of markersIn(text)) {
    const inside = marker.replace(/<!--\s*claims:/, '').replace(/-->$/, '');
    for (const raw of inside.split(',')) {
      const token = raw.trim();
      if (!token) continue;
      ids.push(/^claim-/.test(token) ? token : `claim-${token}`);
    }
  }
  return ids;
}

/**
 * A heading, a table row, or a rule — never a paragraph the fact check judges, and never one the
 * writer is asked to mark. `audit_phase_f.md`: "Every row of an enumerable section is rendered from
 * a finished CSV and carries no marker, because a row is not a claim. Sweeping those in would fire
 * on every row of every `landscape` run."
 */
function isStructure(block) {
  const first = block.trimStart();
  if (!first) return true;
  if (first.startsWith('#')) return true;
  if (/^\|/.test(first)) return true;
  if (/^[-*_]{3,}\s*$/.test(block.trim())) return true;
  // A whole block of list items with no marker anywhere in it is a rendered section, not prose.
  const lines = block.split('\n').filter((line) => line.trim());
  if (lines.length && lines.every((line) => /^\s*[-*]\s/.test(line))) return true;
  return false;
}

/**
 * Cut the summary into the units the fact check judges.
 *
 * **Blank lines first, then any piece carrying more than one marker again at every line break.** A
 * bullet list has no blank line inside it, so a Hubs or Jargon section arrives as one piece with a
 * marker per bullet — and a block-level split checks the first bullet's claim and silently skips the
 * rest. Measured on one real summary: two blocks held 25 of its 80 markers between them.
 */
export function splitUnits(summary) {
  const marked = [];
  const unmarked = [];
  let section = '';

  for (const block of summary.split(/\n{2,}/)) {
    if (!block.trim()) continue;

    const heading = /^\s*#{1,6}\s+(.*)$/m.exec(block);
    if (heading && block.trimStart().startsWith('#')) section = heading[1].trim();

    const count = markersIn(block).length;
    if (count > 1) {
      for (const line of block.split('\n')) {
        if (markersIn(line).length) marked.push({ section, text: line.trim() });
      }
      continue;
    }
    if (count === 1) {
      marked.push({ section, text: block.trim() });
      continue;
    }
    if (!isStructure(block)) unmarked.push({ section, text: block.trim() });
  }

  return { marked, unmarked };
}

function summaryPath(root, slug) {
  return join(root, `${slug}-executive-summary.md`);
}

/**
 * Freeze the numbered list of marked paragraphs, and set the unmarked prose aside for the writer.
 *
 * **Frozen for the reason the vetting work list is frozen**: a range addresses a position, so a list
 * recomputed per call would leave "paragraphs 11 to 20" naming different text each time — and a
 * resumed run has to number identically, since it re-dispatches only the paragraphs with no return
 * file.
 *
 * **It runs twice.** Once before the marker redraft and once after, because the writer changes the
 * summary and the first list is then stale.
 */
export function prepare(topicSlug) {
  const root = topicDir(topicSlug);
  const path = summaryPath(root, topicSlug);
  if (!existsSync(path)) throw new Error(`no summary at ${path} — Synthesize has not finished`);

  const indexPath = join(root, 'claim_index.json');
  if (!existsSync(indexPath)) throw new Error(`no claim_index.json at ${indexPath}`);
  const known = new Set((readJson(indexPath)?.claims ?? []).map((claim) => claim.claimId));

  const { marked, unmarked } = splitUnits(readFileSync(path, 'utf8'));

  let staleIds = 0;
  const paragraphs = marked.map((unit, position) => {
    const ids = claimIdsIn(unit.text);
    const live = ids.filter((id) => known.has(id));
    staleIds += ids.length - live.length;
    return { paragraph: position + 1, section: unit.section, text: unit.text, claimIds: live };
  });

  mkdirSync(join(root, 'cache', 'audit'), { recursive: true });

  const worklistPath = join(root, WORKLIST_PATH);
  writeFileSync(worklistPath, `${JSON.stringify({ paragraphs }, null, 2)}\n`, 'utf8');

  // The writer is given this path rather than the paragraphs, so none of the document reaches the
  // orchestrator. Each entry names where it is, or the writer has to search the file for it.
  const unmarkedPath = join(root, UNMARKED_PATH);
  const body = unmarked
    .map((unit, position) => `## ${position + 1}. in "${unit.section || 'the opening'}"\n\n${unit.text}`)
    .join('\n\n');
  writeFileSync(unmarkedPath, `${body}\n`, 'utf8');

  return {
    paragraphs: paragraphs.length,
    unmarked: unmarked.length,
    staleIds,
    worklist: worklistPath,
    unmarkedPath,
  };
}

/**
 * One range of paragraphs, each with the evidence behind its claims.
 *
 * **Grouped per distinct `cachedPage`**, so two claims citing one page make one entry rather than
 * two — the agent opens each file once. **`claimId` and `status` do not cross**: nothing comes back
 * keyed on an id, and the handle verdict decides caveating rather than text against text.
 *
 * The ids resolve here rather than being frozen into the work list, because `claim_index.json` is
 * never edited after it is written and the answer is the same either way.
 */
export function serve(topicSlug, { from, to }) {
  const root = topicDir(topicSlug);
  const worklistPath = join(root, WORKLIST_PATH);
  if (!existsSync(worklistPath)) {
    throw new Error(`no work list at ${worklistPath} — run "factcheck.mjs prepare" first`);
  }
  const all = readJson(worklistPath)?.paragraphs ?? [];
  const byId = new Map((readJson(join(root, 'claim_index.json'))?.claims ?? []).map((c) => [c.claimId, c]));

  // One-based and inclusive. A range past the end is short rather than an error — the last one
  // always is, exactly as `handle_vetting.mjs serve` has it.
  const slice = all.slice(Math.max(0, from - 1), to);

  const paragraphs = slice.map((entry) => {
    const pages = new Map();
    for (const id of entry.claimIds) {
      const claim = byId.get(id);
      if (!claim) continue;
      for (const citation of claim.citations ?? []) {
        const key = citation.cachedPage;
        if (!key) continue;
        if (!pages.has(key)) pages.set(key, { cachedPage: key, url: citation.url ?? '', quotes: [] });
        pages.get(key).quotes.push({ quote: citation.quote ?? '', claim: claim.claim ?? '' });
      }
    }
    return { paragraph: entry.paragraph, section: entry.section, text: entry.text, evidence: [...pages.values()] };
  });

  return { from, to, paragraphs, count: paragraphs.length };
}

// ---------------------------------------------------------------- cli

export function run(argv) {
  const { verb, flags } = parseArgs(argv);
  if (!flags.topic) throw new Error('--topic <slug> is required');

  if (verb === 'prepare') return prepare(flags.topic);
  if (verb === 'serve') {
    const from = Number(flags.from);
    const to = Number(flags.to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
      throw new Error('serve needs --from <n> --to <n>, one-based and inclusive');
    }
    return serve(flags.topic, { from, to });
  }
  throw new Error(`unknown command: ${verb ?? '(none)'} — expected prepare or serve`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(`${JSON.stringify(run(process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exit(1);
  }
}
