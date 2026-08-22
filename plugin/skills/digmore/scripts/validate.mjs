/**
 * Check a sub-agent's returned JSON against one of the shared shapes in subagent_returns.json.
 *
 * Structure only: the right keys, the right JSON types, allowed enum values, array and
 * number bounds. It says nothing about whether a price is a price or a quote is real —
 * that is the typed-field mechanism, and it is not in this version.
 *
 *   node validate.mjs <shape> <file>       # "-" reads stdin
 *   node validate.mjs --shapes             # list the shape names
 *   node validate.mjs --shape <name>       # print one shape, to paste into a dispatch
 *
 * `--shape` exists because the dispatch template tells the orchestrator to paste a shape into
 * the prompt verbatim and gave it no way to get one. Left to improvise it reaches for
 * `node -e` and a hand-written JSON.parse, which is a second place the file is read and a
 * first place it can be read wrongly.
 *
 * The verdict is the result, not a failure of this script, so it goes to stdout either
 * way and the exit code carries it:
 *
 *   0  valid
 *   1  invalid — stdout holds the errors, one per problem, ready to paste into the
 *      repair prompt
 *   2  the script was invoked wrong, or the file is not JSON at all
 *
 * On exit 1 the orchestrator gets ONE repair attempt (phases/index.md). Never more:
 * a fix-and-recheck loop that can run twice can run forever.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrCreateConfig, MALFORMED, CONFIGURATION_DEFAULTS } from './config.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));

export const SUBAGENT_RETURNS_PATH = join(scriptDir, 'subagent_returns.json');

/**
 * How many repair attempts a failed return gets, from `subagents.repairAttempts`. Still a
 * number read from a file rather than a judgement made mid-run — which is the point — but
 * now the user can see it and change it, like every other configuration.
 *
 * The reason it is small stays true whatever it is set to: a fix-and-recheck loop that can
 * run twice can run forever, and `Product boundary` names an unbounded repair loop as a
 * defect marker in its own right.
 */
export function maxRepairs() {
  const config = loadOrCreateConfig();
  if (config === MALFORMED) return CONFIGURATION_DEFAULTS.subagents.repairAttempts;
  return config.subagents.repairAttempts;
}

let cachedSchemas;

export function loadSchemas() {
  if (!cachedSchemas) cachedSchemas = JSON.parse(readFileSync(SUBAGENT_RETURNS_PATH, 'utf8'));
  return cachedSchemas;
}

/**
 * What a value is, in the words the error message uses. `integer` is not reported
 * separately — a reader chasing a bad field is not helped by being told 3 is an integer.
 */
function describe(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function matchesType(value, expected) {
  const expectedTypes = Array.isArray(expected) ? expected : [expected];
  return expectedTypes.some((type) => {
    switch (type) {
      case 'object':
        return value !== null && typeof value === 'object' && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'integer':
        return Number.isInteger(value);
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'null':
        return value === null;
      default:
        return typeof value === type;
    }
  });
}

/**
 * Missing means absent, null, or an empty string. An empty required string passes a
 * naive presence check and carries nothing, which is the shape a sub-agent produces
 * when it has no answer and does not want to say so.
 */
function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function joinPath(path, segment) {
  return path ? `${path}.${segment}` : segment;
}

function quote(value) {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

/**
 * Collect every problem rather than stopping at the first: the repair pass gets one
 * attempt, so it has to be told everything that is wrong in one go.
 */
export function validateValue(schema, value, path = '', errors = []) {
  const at = path || '(root)';

  if (schema.type && !matchesType(value, schema.type)) {
    const expected = Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type;
    errors.push({ path: at, message: `expected ${expected}, got ${describe(value)}` });
    return errors; // Nothing below can be checked against a value of the wrong type.
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      path: at,
      message: `must be one of ${schema.enum.map(quote).join(', ')} — got ${quote(value)}`,
    });
  }

  if (schema.properties || schema.required || schema.requiredWhen) {
    for (const name of schema.required ?? []) {
      if (isMissing(value[name])) errors.push({ path: joinPath(path, name), message: 'required' });
    }

    for (const rule of schema.requiredWhen ?? []) {
      if (value[rule.field] !== rule.equals) continue;
      for (const name of rule.require) {
        if (isMissing(value[name])) {
          errors.push({
            path: joinPath(path, name),
            message: `required when ${rule.field} is ${quote(rule.equals)}`,
          });
        }
      }
    }

    for (const [name, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (isMissing(value[name])) continue; // absence is the required check's business
      validateValue(propertySchema, value[name], joinPath(path, name), errors);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path: at, message: `needs at least ${schema.minItems} items, got ${value.length}` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path: at, message: `takes at most ${schema.maxItems} items, got ${value.length}` });
    }
    if (schema.items) {
      value.forEach((item, index) => validateValue(schema.items, item, `${path}[${index}]`, errors));
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path: at, message: `must be at least ${schema.minimum}, got ${value}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path: at, message: `must be at most ${schema.maximum}, got ${value}` });
    }
  }

  return errors;
}

export function validate(shapeName, value) {
  const schemas = loadSchemas();
  const schema = schemas[shapeName];
  if (!schema) {
    throw new Error(`unknown shape: ${shapeName} — expected ${Object.keys(schemas).join(', ')}`);
  }
  const errors = validateValue(schema, value);
  return { shape: shapeName, valid: errors.length === 0, errors };
}

function readInput(file) {
  return file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
}

function fail(message) {
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(2);
}

function main(argv) {
  const [shapeName, file] = argv;

  if (shapeName === '--shapes') {
    process.stdout.write(`${JSON.stringify({ shapes: Object.keys(loadSchemas()) })}\n`);
    return;
  }

  // Printed indented rather than on one line: it goes into a dispatch prompt, where a wall of
  // minified JSON is what a sub-agent reads its contract off.
  if (shapeName === '--shape') {
    const schemas = loadSchemas();
    if (!file) return fail(`--shape needs a name — one of ${Object.keys(schemas).join(', ')}`);
    if (!schemas[file]) {
      return fail(`unknown shape: ${file} — expected ${Object.keys(schemas).join(', ')}`);
    }
    process.stdout.write(`${JSON.stringify(schemas[file], null, 2)}\n`);
    return;
  }

  if (!shapeName || !file) {
    return fail(
      'usage: validate.mjs <shape> <file>   ("-" reads stdin, --shapes lists them, --shape <name> prints one)',
    );
  }

  let text;
  try {
    text = readInput(file);
  } catch (err) {
    return fail(`cannot read ${file}: ${err.message}`);
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch (err) {
    // Not a repairable shape problem — there is no document to repair.
    return fail(`${file} is not JSON: ${err.message}`);
  }

  let result;
  try {
    result = validate(shapeName, value);
  } catch (err) {
    return fail(err.message);
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
