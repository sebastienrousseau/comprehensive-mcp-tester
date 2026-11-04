/**
 * The mock's original behaviours, one scenario each. `alias` is the path they
 * have always been served on; /scenario/<name>/mcp serves the same behaviour.
 *
 * `raw: true` runs before the Accept check and before the call is recorded,
 * as /hang and /fail always have. `auth` puts the scenario behind the built-in
 * authorization server (see mock-mcp-server.mjs).
 */
import { serveLegacy, serveModern, modernVersionOf, reply, sleep, MODERN_VERSION, LEGACY_VERSION } from '../protocol.mjs';

const SLOW_LIST_TOOLS = [{ name: 'slow_list_tool', description: 'Only served by /slow-list', inputSchema: { type: 'object', properties: {} } }];
const SLOW_LIST_MS = 800;

const KEEPALIVE_MS = 250;
const KEEPALIVE_MAX_MS = 30000;

/** Streams a notification then `obj`, and keeps the stream open until the client goes or 30 s pass */
function holdOpen(res, obj, headers) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', ...headers });
  res.write('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'working' } }) + '\n\n');
  res.write('event: message\ndata: ' + JSON.stringify(obj) + '\n\n');
  const tick = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS);
  const stop = setTimeout(() => res.end(), KEEPALIVE_MAX_MS);
  res.on('close', () => { clearInterval(tick); clearTimeout(stop); });
}

export const STANDARD = [
  { name: 'mcp', alias: '/mcp', protocol: 'legacy',
    description: 'Normal legacy server: initialize handshake, session required afterwards',
    handler: (ctx) => serveLegacy(ctx) },
  { name: 'slow', alias: '/slow', protocol: 'legacy',
    description: 'Normal, but every response is delayed 400ms',
    handler: async (ctx) => { await sleep(400); return serveLegacy(ctx); } },
  { name: 'hang', alias: '/hang', protocol: 'legacy', raw: true,
    description: 'Never responds (timeouts)',
    handler: () => {} },
  { name: 'fail', alias: '/fail', protocol: 'legacy', raw: true,
    description: 'HTTP 503 on everything',
    handler: (ctx) => reply(ctx.res, 503, { error: 'upstream unavailable' }) },
  { name: 'stream', alias: '/stream', protocol: 'legacy',
    description: 'tools/call answers as text/event-stream instead of JSON',
    handler: (ctx) => serveLegacy(ctx, { streamCalls: true }) },
  { name: 'hang-call', protocol: 'legacy',
    description: 'Normal, except that tools/call never answers (for cancelling a running call)',
    handler: (ctx) => (ctx.body.method === 'tools/call' ? undefined : serveLegacy(ctx)) },
  { name: 'sse-keepalive', protocol: 'legacy',
    description: 'Every answer is an SSE stream: a log notification, the response, then keepalive comments with the stream held open (the spec only says SHOULD close)',
    handler: (ctx) => serveLegacy({ ...ctx, reply: (status, obj, headers) => (status === 200 && obj !== undefined ? holdOpen(ctx.res, obj, headers) : ctx.reply(status, obj, headers)) }) },
  { name: 'slow-list', alias: '/slow-list', protocol: 'legacy',
    description: 'tools/list answers after 800ms with its own tool list, so a late answer is recognisable',
    handler: (ctx) => serveLegacy(ctx, { listTools: () => sleep(SLOW_LIST_MS).then(() => SLOW_LIST_TOOLS) }) },
  { name: 'modern', alias: '/modern', protocol: 'modern',
    description: '2026-07-28 only: _meta version and mirrored headers required, 404 -32601 for unknown methods, initialize rejected',
    handler: (ctx) => serveModern(ctx) },
  { name: 'dual', alias: '/dual', protocol: 'dual',
    description: 'Both eras: modern requests served statelessly, initialize gets a session',
    handler: (ctx) => (modernVersionOf(ctx.body)
      ? serveModern(ctx, { supported: [MODERN_VERSION, LEGACY_VERSION] })
      : serveLegacy(ctx)) },
  { name: 'secure', alias: '/secure', protocol: 'legacy', auth: { hint: true },
    description: '401 with WWW-Authenticate resource_metadata + scope; like /mcp once a valid token is presented',
    handler: (ctx) => serveLegacy(ctx) },
  { name: 'secure-nohint', alias: '/secure-nohint', protocol: 'legacy', auth: { hint: false },
    description: '401 without resource_metadata: clients must probe the well-known URLs',
    handler: (ctx) => serveLegacy(ctx) },
  { name: 'secure-mixup', alias: '/secure-mixup', protocol: 'legacy', auth: { hint: true, mixup: true },
    description: 'The authorization server redirects back with a wrong iss (mix-up attack)',
    handler: (ctx) => serveLegacy(ctx) },
];
