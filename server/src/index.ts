/**
 * digmore server — receives mentions of one account from X through a webhook.
 *
 * Standalone from the plugin: nothing here imports from `skill/`, and the plugin reaches this
 * service only over HTTP.
 */

import { createHmac } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { readConfig } from './config.js';

const config = readConfig();

const WEBHOOK_PATH = '/webhook/twitter';

/** The body exactly as it arrived, kept for logging a body that is not valid JSON. */
interface RequestWithRawBody extends Request {
  rawBody?: string;
}

const app = express();
// `type: '*/*'` parses the body as JSON whatever Content-Type X sends; by default express.json()
// skips anything not labelled application/json and leaves the body empty.
app.use(
  express.json({
    type: '*/*',
    verify: (request, _response, buffer) => {
      (request as RequestWithRawBody).rawBody = buffer.toString('utf8');
    },
  }),
);

app.get('/health', (_request: Request, response: Response) => {
  response.status(200).json({ status: 'ok' });
});

/**
 * X's security check (CRC): it sends a `crc_token` and expects it back signed with the app's
 * consumer secret, which proves this URL belongs to the app.
 */
app.get(WEBHOOK_PATH, (request: Request, response: Response) => {
  const crcToken = request.query.crc_token;
  if (typeof crcToken !== 'string' || !crcToken) {
    response.status(400).send('Error: crc_token missing');
    return;
  }

  console.log('received CRC check from X');
  const hash = createHmac('sha256', config.consumerSecret).update(crcToken).digest('base64');
  response.status(200).json({ response_token: `sha256=${hash}` });
  console.log('CRC check passed and response sent');
});

/** The events themselves. Answered at once so X does not time out; handled after. */
app.post(WEBHOOK_PATH, (request: RequestWithRawBody, response: Response) => {
  response.status(200).send('OK');

  console.log('\n--- Event received ---');
  console.log(request.body === undefined ? '(empty body)' : JSON.stringify(request.body, null, 2));

  // Insert logic here (e.g. save to a database, send a notification).
});

/** A body that is not valid JSON lands here: log it rather than fail silently. */
app.use((error: Error, request: RequestWithRawBody, response: Response, _next: NextFunction) => {
  console.error(`could not read request to ${request.path}: ${error.message}`);
  console.error(`  Body: ${request.rawBody || '(empty)'}`);
  response.status(400).send('Bad Request');
});

app.listen(config.port, () => {
  console.log(`webhook server is running on port ${config.port}`);
});
