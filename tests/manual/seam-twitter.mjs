/**
 * Twitter seam check — the plugin's own client against a live digmore API.
 *
 * Not part of `npm test`. It needs the API running and it spends real X credits
 * (~8 calls a run), so it lives outside the `*.test.mjs` discovery pattern and is
 * run by hand after touching `api.mjs`'s Twitter verbs or the API's Twitter routes.
 *
 * What it covers that nothing else does. `tests/api-twitter.test.mjs` drives the
 * client against a stub that answers whatever the test decides; the API repo's
 * `llm_tests/` drive the API with X mocked. Neither one puts the real client in
 * front of the real API, so neither can catch the seam itself: a parameter named
 * differently on the two sides, a response shape the skill reads but the client
 * never validates, or a status the API emits and the client maps to the wrong
 * process exit code.
 *
 * That last one is why this exists. The plugin maps status to exit code and never
 * reads a non-2xx body, and the codes are not interchangeable: exit 3 takes the
 * Twitter branch out for the whole run, exit 5 tells the user their key is bad,
 * exit 1 is a single failed request. A handle nobody holds must reach the plugin
 * as exit 1 — as a 503 it would disable Twitter for the run over one typo.
 *
 *   node tests/manual/seam-twitter.mjs <api-key> [base-url]
 *
 * The key may also come from DIGMORE_API_KEY, and the base url from
 * DIGMORE_API_BASE_URL (default http://127.0.0.1:8080). Both the settings file and
 * the run directory are throwaway temp directories, so a run cannot touch the real
 * ~/.digmore/settings.json or leave a digmore/ folder behind in the repo.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = (name) => join(repoRoot, 'skill', 'scripts', name);

const [keyArgument, baseUrlArgument] = process.argv.slice(2);
const apiKey = keyArgument ?? process.env.DIGMORE_API_KEY;
const baseUrl = baseUrlArgument ?? process.env.DIGMORE_API_BASE_URL ?? 'http://127.0.0.1:8080';

if (!apiKey) {
  process.stderr.write(
    'usage: node tests/manual/seam-twitter.mjs <api-key> [base-url]\n' +
      '       or set DIGMORE_API_KEY\n',
  );
  process.exit(2);
}

/** A high-volume account that will not vanish mid-run. */
const HANDLE = 'AnthropicAI';
const TOPIC = 'seam-check';

/** A throwaway install: its own settings file, its own working directory. */
function install(key) {
  const home = mkdtempSync(join(tmpdir(), 'seam-home-'));
  mkdirSync(join(home, '.digmore'), { recursive: true });
  writeFileSync(
    join(home, '.digmore', 'settings.json'),
    JSON.stringify({ apiBaseUrl: baseUrl, apiKey: key, apiDeclined: false }),
  );
  return home;
}

const home = install(apiKey);
const rejectedKeyHome = install('not-a-real-key');
const cwd = mkdtempSync(join(tmpdir(), 'seam-cwd-'));

const failures = [];
function check(label, passed, detail = '') {
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}\n`);
  if (!passed) failures.push(label);
}

/**
 * Async on purpose, and never spawnSync: the point is to exercise the same path
 * the skill uses, which is the Bash tool running the script as its own process.
 */
function run(scriptName, args, fromHome = home) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [script(scriptName), ...args], {
      cwd,
      env: { ...process.env, HOME: fromHome, USERPROFILE: fromHome },
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (err += chunk));
    child.on('close', (code) => {
      let json;
      try {
        json = JSON.parse(out);
      } catch {
        json = undefined;
      }
      done({ code, out, err, json });
    });
  });
}

/** The cache that phase resume and the sub-agents read. */
function cached(file) {
  const path = join(cwd, 'digmore', TOPIC, 'cache', 'twitter', file);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

const keysOf = (value) => Object.keys(value ?? {}).sort();
const sameKeys = (value, expected) =>
  JSON.stringify(keysOf(value)) === JSON.stringify([...expected].sort());

// ---------------------------------------------------------------- preflight

const preflight = await run('preflight.mjs', []);
check('preflight -> READY', preflight.out.includes('READY'), preflight.out.split('\n')[0]);
check('preflight exits 0', preflight.code === 0, String(preflight.code));

// ---------------------------------------------------------------- twitter user

const user = await run('api.mjs', ['twitter', 'user', HANDLE, '--topic', TOPIC]);
check('user exits 0', user.code === 0, user.err.trim());
check(
  'user shape frozen',
  sameKeys(user.json, ['id', 'username', 'name', 'description', 'verified', 'created_at', 'metrics']),
  JSON.stringify(keysOf(user.json)),
);
check(
  'metrics shape frozen',
  sameKeys(user.json?.metrics, [
    'followers_count',
    'following_count',
    'tweet_count',
    'listed_count',
  ]),
  JSON.stringify(keysOf(user.json?.metrics)),
);
check('user cached as user-<handle>.json', cached(`user-${HANDLE}.json`) !== undefined);
// The plugin strips money defensively; the API should never send it.
check('no money field survives', !user.out.includes('cost'));

// ---------------------------------------------------------------- twitter tweets

const tweets = await run('api.mjs', ['twitter', 'tweets', HANDLE, '--topic', TOPIC, '--limit', '5']);
check('tweets exits 0', tweets.code === 0, tweets.err.trim());
// The API wraps the timeline with the profile it had to fetch to resolve the
// handle. Accept either shape: the client passes the body through untouched, so
// what arrives here is what the model reads out of the cache file.
const timeline = Array.isArray(tweets.json) ? tweets.json : tweets.json?.tweets;
check('tweets returns a list', Array.isArray(timeline), typeof timeline);
check('limit honoured', Array.isArray(timeline) && timeline.length <= 5, String(timeline?.length));
check(
  'tweet shape frozen',
  sameKeys(timeline?.[0], ['id', 'text', 'created_at', 'author_id', 'metrics', 'urls']),
  JSON.stringify(keysOf(timeline?.[0])),
);
check('tweets cached as tweets-<handle>-<N>.json', cached(`tweets-${HANDLE}-5.json`) !== undefined);
// brain/branches/twitter.md — without a real body a Twitter citation is the first
// 15 words of the tweet, which is a preview that looks like a quote.
check(
  'a real body comes back, not an og:title preview',
  typeof timeline?.[0]?.text === 'string' && timeline[0].text.length > 0,
);

// ---------------------------------------------------------------- twitter tweet — the citation path

const tweetId = timeline?.[0]?.id;
const lookup = await run('api.mjs', ['twitter', 'tweet', tweetId, '--topic', TOPIC]);
check('tweet exits 0', lookup.code === 0, lookup.err.trim());
check(
  'the client finds the tweets in the lookup envelope',
  Array.isArray(lookup.json?.tweets) && lookup.json.tweets[0]?.id === tweetId,
  JSON.stringify(keysOf(lookup.json)),
);
check('tweet cached as tweet-<id>.json', cached(`tweet-${tweetId}.json`) !== undefined);

const reLookup = await run('api.mjs', ['twitter', 'tweet', tweetId, '--topic', TOPIC]);
check(
  're-quoting a cached tweet does not re-fetch it',
  reLookup.code === 0 && reLookup.json?.tweets?.[0]?.id === tweetId,
);

// ---------------------------------------------------------------- twitter vet

const tierOne = await run('api.mjs', ['twitter', 'vet', HANDLE, '--topic', TOPIC, '--tier', '1']);
check('vet exits 0', tierOne.code === 0, tierOne.err.trim());
check(
  'vet shape frozen',
  sameKeys(tierOne.json, [
    'username',
    'tier',
    'verdict',
    'signals',
    'reason',
    'tweets_sampled',
    'needs_llm_judgment',
  ]),
  JSON.stringify(keysOf(tierOne.json)),
);
// scripts/subagent_returns.json — the shared verdict vocabulary.
check(
  'the verdict is in the shared vocabulary',
  ['legit', 'unknown', 'promoter', 'troll', 'spammer'].includes(tierOne.json?.verdict),
  String(tierOne.json?.verdict),
);
check('tier 1 samples no tweets', tierOne.json?.tweets_sampled === 0, String(tierOne.json?.tweets_sampled));
check(
  'tier 1 asks for no LLM judgment',
  tierOne.json?.needs_llm_judgment === false,
  String(tierOne.json?.needs_llm_judgment),
);
check('vet caches per tier', cached(`vet-${HANDLE}-tier1.json`) !== undefined);

// Tier 2 is the shallowest tier that samples tweets, so it is the cheapest way to
// reach the fields Phase B branches on: needs_llm_judgment, and the last_active
// that experts.csv records as the handle's real last activity.
const tierTwo = await run('api.mjs', ['twitter', 'vet', HANDLE, '--topic', TOPIC, '--tier', '2']);
check('tier 2 exits 0', tierTwo.code === 0, tierTwo.err.trim());
check('tier 2 samples tweets', tierTwo.json?.tweets_sampled > 0, String(tierTwo.json?.tweets_sampled));
check(
  'tier 2 reports last_active',
  /^\d{4}-\d{2}-\d{2}$/.test(tierTwo.json?.signals?.last_active ?? ''),
  String(tierTwo.json?.signals?.last_active),
);
// vet_phase_b.md reads the flag rather than re-deriving it from verdict and tier.
check(
  'needs_llm_judgment tracks the verdict',
  tierTwo.json?.needs_llm_judgment === (tierTwo.json?.verdict === 'unknown'),
  `verdict ${tierTwo.json?.verdict}, flag ${tierTwo.json?.needs_llm_judgment}`,
);
check(
  'escalating a tier is a new fetch, not the shallow answer re-read',
  cached(`vet-${HANDLE}-tier2.json`) !== undefined,
);

// ---------------------------------------------------------------- status -> exit code

const rejected = await run('api.mjs', ['twitter', 'user', HANDLE, '--topic', 'bad-key'], rejectedKeyHome);
check('a rejected key exits 5, not 1', rejected.code === 5, String(rejected.code));

// The one that matters most: as a 503 this would take Twitter out of the whole
// run over a single bad handle.
const unknownHandle = await run('api.mjs', ['twitter', 'user', 'zzqx9notarealhandle', '--topic', TOPIC]);
check('a handle nobody holds exits 1, not 3', unknownHandle.code === 1, String(unknownHandle.code));

const badPattern = await run('api.mjs', ['twitter', 'user', 'has-a-dash', '--topic', TOPIC]);
check('a 422 from parameter validation exits 1', badPattern.code === 1, String(badPattern.code));

// Refused client-side: these can never become a successful round trip, so they
// should not become a round trip at all.
const badTier = await run('api.mjs', ['twitter', 'vet', HANDLE, '--topic', TOPIC, '--tier', '9']);
check('a bad tier never reaches the API', badTier.code === 2, String(badTier.code));

const badLimit = await run('api.mjs', ['twitter', 'tweets', HANDLE, '--topic', TOPIC, '--limit', '3']);
check('a limit outside 5-100 never reaches the API', badLimit.code === 2, String(badLimit.code));

const noTopic = await run('api.mjs', ['twitter', 'user', HANDLE]);
check('a missing --topic is refused', noTopic.code === 2, String(noTopic.code));

// ---------------------------------------------------------------- what must never leak

const everything = [user, tweets, lookup, tierOne, tierTwo, rejected, unknownHandle]
  .map((result) => result.out + result.err)
  .join('');
check('the api key is never echoed', !everything.includes(apiKey));
// The API sanitises its own errors. A user with no X account should never
// read about credits or bearer tokens, and the cost structure is not theirs to see.
check(
  'no internal cause reaches the user',
  !/credit|bearer|token|top up|developer\.x\.com|traceback/i.test(everything),
);

process.stdout.write(
  `\n${failures.length ? `${failures.length} FAILED: ${failures.join(' | ')}` : 'all checks passed'}\n`,
);
process.stdout.write(`run directory: ${cwd}\n`);
process.exit(failures.length ? 1 : 0);
