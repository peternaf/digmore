/**
 * Settings, read from the environment. `npm start` and `npm run dev` load `server/.env`, which is
 * gitignored; `.env.example` lists what it needs.
 */

export interface Config {
  /** App-only bearer token from the X developer portal. */
  bearerToken: string;
  /** The account whose mentions we listen for, without the `@`. */
  username: string;
  /** OAuth 1.0a consumer key: identifies the app. */
  consumerKey: string;
  /** OAuth 1.0a consumer secret: identifies the app. */
  consumerSecret: string;
  /** OAuth 1.0a user token: identifies the account we listen for. */
  accessToken: string;
  /** OAuth 1.0a user token secret: identifies the account we listen for. */
  accessTokenSecret: string;
  /** The port the HTTP server listens on. */
  port: number;
}

const DEFAULT_PORT = 3000;

const REQUIRED_SETTINGS = [
  'X_BEARER_TOKEN',
  'X_USERNAME',
  'TWITTER_CONSUMER_KEY',
  'TWITTER_CONSUMER_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_TOKEN_SECRET',
] as const;

export function readConfig(): Config {
  const settings = Object.fromEntries(
    REQUIRED_SETTINGS.map((name) => [name, process.env[name]?.trim() ?? '']),
  ) as Record<(typeof REQUIRED_SETTINGS)[number], string>;

  const missing = REQUIRED_SETTINGS.filter((name) => !settings[name]);
  if (missing.length > 0) {
    throw new Error(`missing ${missing.join(', ')} — copy .env.example to .env and fill it in`);
  }

  const portSetting = process.env.PORT?.trim();
  const port = portSetting ? Number(portSetting) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a whole number from 1 to 65535, got "${portSetting}"`);
  }

  return {
    bearerToken: settings.X_BEARER_TOKEN,
    username: settings.X_USERNAME.replace(/^@/, ''),
    consumerKey: settings.TWITTER_CONSUMER_KEY,
    consumerSecret: settings.TWITTER_CONSUMER_SECRET,
    accessToken: settings.TWITTER_ACCESS_TOKEN,
    accessTokenSecret: settings.TWITTER_ACCESS_TOKEN_SECRET,
    port,
  };
}
