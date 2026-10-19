/**
 * digmore server — will receive mentions of one account from X.
 *
 * Standalone from the plugin: nothing here imports from `skill/`, and the plugin reaches this
 * service only over HTTP.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readConfig } from './config.js';

const config = readConfig();

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;

  if (request.method === 'GET' && path === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  sendJson(response, 404, { error: `no route for ${request.method} ${path}` });
}

const server = createServer(handleRequest);

server.listen(config.port, () => {
  console.log(`digmore server listening on http://localhost:${config.port}`);
});
