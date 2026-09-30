import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { proxyMcp, parseAllowedOrigins, clampInt, validateTarget, buildOutHeaders, runAttempts, attemptOnce, DEFAULT_MAX_RESPONSE_BYTES, isIdempotent, validateHeaders } from '../src/core/proxy.js';
import { startMockServer } from './fixtures/mock-mcp-server.mjs';

let mock;
before(async () => { mock = await startMockServer(); });
after(async () => { await mock.close(); });

const ACCEPT = 'application/json, text/event-stream';
const init = (url, extra = {}) => ({
  url, method: 'POST', timeoutMs: 3000,
  headers: { 'Content-Type': 'application/json', Accept: ACCEPT },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} }),
  ...extra,
});
const call = (payload, env = {}) => proxyMcp(payload, { fetch, ...env });

test('fast response: ok envelope, status 200, session header passed through', async () => {
  const r = await call(init(mock.url));
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 200);
  assert.equal(r.json.diag.ok, true);
  assert.ok(r.json.headers['mcp-session-id'], 'session id forwarded to the client');
});

test('timings are present and consistent (ttfb + body = total, within 2ms)', async () => {
  const { json: { diag } } = await call(init(mock.url));
  for (const k of ['ttfbMs', 'bodyMs', 'totalMs']) assert.equal(typeof diag[k], 'number');
  assert.ok(Math.abs(diag.ttfbMs + diag.bodyMs - diag.totalMs) <= 2);
});

test('slow origin: ~400ms measured on the origin', async () => {
  const { json: { diag } } = await call(init(mock.base + '/slow'));
  assert.ok(diag.totalMs >= 380 && diag.totalMs < 2000, `totalMs=${diag.totalMs}`);
});

test('5xx surfaces as the origin status with transport ok', async () => {
  const { json } = await call(init(mock.base + '/fail'));
  assert.equal(json.status, 503);
  assert.equal(json.diag.ok, true);
});

test('timeout: classified, aborted near the deadline, readable JSON-RPC error body', async () => {
  const t0 = Date.now();
  const { status, json } = await call(init(mock.base + '/hang', { timeoutMs: 900 }));
  const elapsed = Date.now() - t0;
  assert.equal(status, 200, 'transport failures still return 200 so the UI can read diagnostics');
  assert.equal(json.status, 0);
  assert.equal(json.diag.ok, false);
  assert.equal(json.diag.errorType, 'timeout');
  assert.match(json.diag.errorDetail, /900ms/);
  assert.ok(elapsed >= 850 && elapsed < 2500, `${elapsed}ms for a 900ms timeout`);
  assert.equal(JSON.parse(json.body).error.code, -32001);
});

test('retries: 3 attempts logged, with backoff between them', async () => {
  const t0 = Date.now();
  const { json } = await call(init(mock.base + '/hang', { timeoutMs: 500, retries: 2, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }) }));
  assert.equal(json.diag.attempts, 3);
  assert.deepEqual(json.diag.attemptLog.map((a) => a.outcome), ['timeout', 'timeout', 'timeout']);
  assert.ok(Date.now() - t0 >= 1500 + 250 + 500, 'three timeouts plus backoff');
});

test('network failure is classified as network', async () => {
  const { json } = await call(init('http://127.0.0.1:1/mcp'));
  assert.equal(json.diag.errorType, 'network');
});

test('Accept header repaired when missing or partial', async () => {
  for (const headers of [{ 'Content-Type': 'application/json' }, { 'Content-Type': 'application/json', Accept: 'application/json' }]) {
    const { json } = await call(init(mock.url, { headers }));
    assert.equal(json.status, 200);
  }
});

test('content-type defaulted for POST when absent', async () => {
  const { json } = await call(init(mock.url, { headers: { Accept: ACCEPT } }));
  assert.equal(json.status, 200);
});

test('hop-by-hop headers are not forwarded', async () => {
  mock.calls.length = 0;
  await call(init(mock.url, { headers: { Accept: ACCEPT, Origin: 'https://evil.example', Referer: 'https://x', 'X-Keep': '1' } }));
  const h = mock.calls.at(-1).headers;
  assert.equal(h.origin, undefined);
  assert.equal(h.referer, undefined);
  assert.equal(h['x-keep'], '1');
});

test('JSON-RPC error inside HTTP 200 is passed through untouched', async () => {
  const sid = (await call(init(mock.url))).json.headers['mcp-session-id'];
  const { json } = await call({
    url: mock.url, headers: { Accept: ACCEPT, 'mcp-session-id': sid },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id: 2, params: { name: 'get_api_details', arguments: {} } }),
  });
  assert.equal(json.status, 200);
  assert.equal(JSON.parse(json.body).error.code, -32602);
});

test('allowlist: blocked host → 403, allowed host passes', async () => {
  const blocked = await call(init(mock.url), { allowedOrigins: ['developer.hsbc.com'] });
  assert.equal(blocked.status, 403);
  assert.deepEqual(blocked.json.allowed, ['developer.hsbc.com']);
  const ok = await call(init(mock.url), { allowedOrigins: ['127.0.0.1'] });
  assert.equal(ok.json.status, 200);
});

test('bad input: missing url and invalid url → 400', async () => {
  assert.equal((await call({})).status, 400);
  assert.equal((await call({ url: 'not a url' })).status, 400);
});

test('colo reported in diagnostics', async () => {
  const { json } = await call(init(mock.url), { colo: 'LHR' });
  assert.equal(json.diag.colo, 'LHR');
});

test('helpers: parseAllowedOrigins and clampInt', () => {
  assert.deepEqual(parseAllowedOrigins(' a.com, b.com ,, '), ['a.com', 'b.com']);
  assert.deepEqual(parseAllowedOrigins(undefined), []);
  assert.equal(clampInt('99999999', 500, 120000, 15000), 120000);
  assert.equal(clampInt('abc', 0, 3, 0), 0);
  assert.equal(clampInt(-5, 0, 3, 0), 0);
});

test('purpose "oauth": no MCP Accept or Content-Type repair; defaults to Accept: application/json', async () => {
  const seen = [];
  const fakeFetch = async (url, init) => { seen.push(init.headers); return new Response('{}', { status: 200 }); };
  await proxyMcp({ url: 'https://as.example/.well-known/oauth-authorization-server', method: 'GET', purpose: 'oauth' }, { fetch: fakeFetch });
  assert.equal(seen[0].get('accept'), 'application/json');
  await proxyMcp({ url: 'https://as.example/token', method: 'POST', purpose: 'oauth', body: 'a=b',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, { fetch: fakeFetch });
  assert.equal(seen[1].get('content-type'), 'application/x-www-form-urlencoded');
  assert.equal(seen[1].get('accept'), 'application/json');
  await proxyMcp({ url: 'https://mcp.example/mcp', method: 'POST', body: '{}' }, { fetch: fakeFetch });
  assert.equal(seen[2].get('accept'), 'application/json, text/event-stream', 'MCP requests are still repaired');
});

// ── The envelope contract, pinned before the pipeline split (#82) ─────────

const keys = (o) => Object.keys(o).sort();
const DIAG_KEYS = ['attemptLog', 'attempts', 'bodyBytes', 'bodyMs', 'colo', 'errorDetail', 'errorType', 'ok', 'retriesSkipped', 'targetHost', 'timeoutMs', 'totalMs', 'truncated', 'ttfbMs'];

test('AC-PROXY-PIPE-01: behaviour unchanged', async () => {
  const fixed = (status, body, headers) => async () => new Response(body, { status, headers });
  const ok = await proxyMcp({ url: 'https://mcp.example/mcp', body: '{}', timeoutMs: 1000 }, { fetch: fixed(201, 'hi', { 'x-a': '1' }), colo: 'LHR' });
  assert.equal(ok.status, 200);
  assert.deepEqual(keys(ok.json), ['body', 'diag', 'headers', 'status']);
  assert.deepEqual(keys(ok.json.diag), DIAG_KEYS);
  assert.deepEqual({ ...ok.json, diag: undefined, headers: ok.json.headers['x-a'] }, { status: 201, body: 'hi', headers: '1', diag: undefined });
  const d = ok.json.diag;
  assert.deepEqual([d.ok, d.errorType, d.errorDetail, d.attempts, d.colo, d.targetHost, d.timeoutMs], [true, null, null, 1, 'LHR', 'mcp.example', 1000]);
  assert.deepEqual(d.attemptLog.map((a) => [a.n, a.outcome, a.status]), [[1, 'response', 201]]);

  const refused = async () => { throw new TypeError('connect ECONNREFUSED'); };
  const bad = await proxyMcp({ url: 'https://mcp.example/mcp', retries: 1, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }, { fetch: refused });
  assert.equal(bad.status, 200);
  assert.deepEqual(keys(bad.json), ['body', 'diag', 'headers', 'status']);
  assert.deepEqual(keys(bad.json.diag), DIAG_KEYS);
  assert.deepEqual([bad.json.status, bad.json.headers, bad.json.diag.ok, bad.json.diag.errorType, bad.json.diag.errorDetail],
    [0, {}, false, 'network', 'connect ECONNREFUSED']);
  assert.deepEqual([bad.json.diag.ttfbMs, bad.json.diag.bodyMs, bad.json.diag.attempts, bad.json.diag.colo, bad.json.diag.timeoutMs], [null, null, 2, null, 15000]);
  assert.deepEqual(bad.json.diag.attemptLog.map((a) => [a.n, a.outcome, a.status]), [[1, 'network', null], [2, 'network', null]]);
  assert.deepEqual(JSON.parse(bad.json.body), { jsonrpc: '2.0', error: { code: -32001, message: 'connect ECONNREFUSED' }, id: null });

  assert.deepEqual(await proxyMcp({}, { fetch: refused }), { status: 400, json: { error: "Missing 'url' in request" } });
  assert.deepEqual(await proxyMcp({ url: 'nope' }, { fetch: refused }), { status: 400, json: { error: 'Invalid target URL' } });
  assert.deepEqual(await proxyMcp({ url: 'https://x.example/' }, { fetch: refused, allowedOrigins: ['y.example'] }),
    { status: 403, json: { error: 'Target domain not in allowlist', allowed: ['y.example'] } });

  const sent = [];
  await proxyMcp({ url: 'https://mcp.example/mcp', method: 'get', body: 'dropped' }, { fetch: async (u, i) => { sent.push(i); return new Response(''); } });
  assert.deepEqual([sent[0].method, sent[0].body, sent[0].redirect, sent[0].headers.get('content-type')], ['GET', null, 'follow', null]);
});

// ── The pipeline steps, each on its own (#82) ─────────────────────────────

test('validateTarget: parses the URL and applies the allowlist', () => {
  assert.equal(validateTarget('https://a.example/mcp', []).url.hostname, 'a.example');
  assert.equal(validateTarget('https://a.example/mcp', ['a.example']).url.pathname, '/mcp');
  assert.deepEqual(validateTarget('nope', []).error, { status: 400, json: { error: 'Invalid target URL' } });
  assert.equal(validateTarget('https://b.example/', ['a.example']).error.status, 403);
});

test('buildOutHeaders: drops hop-by-hop headers and repairs MCP headers by purpose', () => {
  const mcp = buildOutHeaders({ Host: 'x', Origin: 'o', 'X-Keep': '1', Accept: 'application/json' }, 'POST', 'mcp');
  assert.deepEqual([mcp.get('host'), mcp.get('origin'), mcp.get('x-keep')], [null, null, '1']);
  assert.equal(mcp.get('accept'), 'application/json, text/event-stream');
  assert.equal(mcp.get('content-type'), 'application/json');
  assert.equal(buildOutHeaders({}, 'GET', 'mcp').get('content-type'), null);
  const oauth = buildOutHeaders({}, 'POST', 'oauth');
  assert.deepEqual([oauth.get('accept'), oauth.get('content-type')], ['application/json', null]);
});

test('runAttempts: stops at the first response, otherwise tries every attempt with backoff', async () => {
  const waits = [];
  const wait = async (n) => { waits.push(n); };
  const fail = { errorType: 'network', errorDetail: 'x', ms: 1 };
  const seq = [fail, fail, { response: true, status: 200, ms: 5 }];
  const hit = await runAttempts(3, async (n) => seq[n - 1], wait);
  assert.equal(hit.attempt, 3);
  assert.deepEqual(hit.attemptLog.map((a) => a.outcome), ['network', 'network', 'response']);
  assert.deepEqual(waits, [1, 2]);
  const miss = await runAttempts(2, async () => fail, wait);
  assert.equal(miss.failure, fail);
  assert.equal(miss.attemptLog.length, 2);
  assert.deepEqual(waits, [1, 2, 1], 'no wait after the last attempt');
});

test('attemptOnce: reads a response, or classifies the failure', async () => {
  const req = { url: 'https://a.example/', method: 'POST', body: '{}', timeoutMs: 500, outHeaders: new Headers() };
  const r = await attemptOnce(req, async () => new Response('ok', { status: 202, headers: { 'x-b': '2' } }));
  assert.deepEqual([r.response, r.status, r.body, r.headers['x-b'], typeof r.ttfbMs], [true, 202, 'ok', '2', 'number']);
  const hang = (u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))));
  const t = await attemptOnce(req, hang);
  assert.deepEqual([t.errorType, t.errorDetail], ['timeout', 'No response within 500ms']);
  const n = await attemptOnce(req, async () => { throw new Error(''); });
  assert.deepEqual([n.errorType, n.errorDetail], ['network', 'Network failure reaching origin']);
});

// ── Bounded read (#83) ────────────────────────────────────────────────────

const MB = 1024 * 1024;
/** An origin streaming `total` bytes of 'a' in fresh 64 KB chunks, as a network stack would; counts what it was asked for. */
function streamingOrigin(total) {
  const seen = { pulled: 0, cancelled: false };
  const chunk = new Uint8Array(64 * 1024).fill(97);
  const fetchImpl = async () => new Response(new ReadableStream({
    pull(c) {
      if (seen.pulled >= total) return c.close();
      seen.pulled += chunk.byteLength;
      c.enqueue(chunk.slice());
    },
    cancel() { seen.cancelled = true; },
  }, { highWaterMark: 0 }), { headers: { 'content-type': 'application/json' } });
  return { fetchImpl, seen };
}

test('AC-PROXY-BOUND-01: a large response is truncated', async () => {
  const { fetchImpl, seen } = streamingOrigin(20 * MB);
  const { json } = await proxyMcp({ url: 'https://big.example/mcp', body: '{}' }, { fetch: fetchImpl, maxResponseBytes: 8 * MB });
  assert.equal(json.status, 200);
  assert.equal(json.diag.ok, true);
  assert.equal(json.diag.truncated, true);
  assert.equal(json.diag.bodyBytes, 8 * MB);
  assert.equal(json.body.length, 8 * MB);
  assert.ok(seen.cancelled, 'the origin stream is cancelled at the cap');
  assert.ok(seen.pulled <= 8 * MB + 2 * 64 * 1024, `read ${seen.pulled} bytes past an 8 MB cap`);
});

test('AC-PROXY-BOUND-02: memory stays bounded', async () => {
  const { fetchImpl } = streamingOrigin(20 * MB);
  // Warm up first: the one-time cost of Response, streams and TextDecoder is not per request.
  await proxyMcp({ url: 'https://big.example/mcp', body: '{}' }, { fetch: streamingOrigin(MB).fetchImpl });
  const before = process.memoryUsage().rss;
  let peak = before;
  const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  const { json } = await proxyMcp({ url: 'https://big.example/mcp', body: '{}' }, { fetch: fetchImpl, maxResponseBytes: 8 * MB });
  clearInterval(sampler);
  peak = Math.max(peak, process.memoryUsage().rss);
  assert.equal(json.diag.truncated, true);
  assert.ok(peak - before < 3 * 8 * MB, `RSS grew ${((peak - before) / MB).toFixed(1)} MB for an 8 MB cap`);
});

test('bounded read: under the cap nothing is cut, and the default cap is 8 MB', async () => {
  const { json } = await proxyMcp({ url: 'https://a.example/mcp', body: '{}' }, { fetch: async () => new Response('héllo') });
  assert.deepEqual([json.body, json.diag.truncated, json.diag.bodyBytes], ['héllo', false, 6]);
  const empty = await proxyMcp({ url: 'https://a.example/mcp', body: '{}' }, { fetch: async () => new Response(null, { status: 204 }) });
  assert.deepEqual([empty.json.body, empty.json.diag.bodyBytes], ['', 0]);
  assert.equal(DEFAULT_MAX_RESPONSE_BYTES, 8 * MB);
  const exact = streamingOrigin(128 * 1024);
  const r = await proxyMcp({ url: 'https://a.example/mcp', body: '{}' }, { fetch: exact.fetchImpl, maxResponseBytes: 128 * 1024 });
  assert.deepEqual([r.json.diag.truncated, r.json.diag.bodyBytes], [false, 128 * 1024], 'a body of exactly the cap is whole');
});

// ── SSE early return (#84) ────────────────────────────────────────────────

const rpc = (method, id) => JSON.stringify({ jsonrpc: '2.0', method, params: {}, ...(id === undefined ? {} : { id }) });

test('AC-PROXY-SSE-01: early return', async () => {
  const url = mock.base + '/scenario/sse-keepalive/mcp';
  const hs = await call({ url, timeoutMs: 2000, body: rpc('initialize', 1) });
  assert.equal(hs.json.diag.ok, true, 'initialize returns too');
  const sid = hs.json.headers['mcp-session-id'];
  const t0 = Date.now();
  const { json } = await call({ url, timeoutMs: 2000, headers: { 'mcp-session-id': sid }, body: rpc('tools/list', 2) });
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 200, `${elapsed}ms with the stream held open`);
  assert.equal(json.diag.ok, true);
  assert.equal(json.diag.attempts, 1);
  assert.match(json.body, /"id":2,"result":\{"tools":/);
  assert.match(json.body, /notifications\/message/, 'events before the response are kept');
});

/** An SSE origin that sends `events`, then holds the stream open until cancelled (or closes it when `close`). */
function sseOrigin(events, { close = false } = {}) {
  const seen = { cancelled: false };
  const enc = new TextEncoder();
  // Like a real fetch, an abort errors the body stream
  const fetchImpl = async (url, init) => new Response(new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(e));
      if (close) return c.close();
      init.signal.addEventListener('abort', () => { try { c.error(new DOMException('aborted', 'AbortError')); } catch { /* already done */ } });
    },
    cancel() { seen.cancelled = true; },
  }), { headers: { 'content-type': 'text/event-stream' } });
  return { fetchImpl, seen };
}

test('AC-PROXY-SSE-02: notifications still read to the end', async () => {
  const note = sseOrigin(['data: {"jsonrpc":"2.0","id":7,"result":{}}\n\n', ': still here\n\n'], { close: true });
  const { json } = await proxyMcp({ url: 'https://a.example/mcp', body: rpc('notifications/initialized') }, { fetch: note.fetchImpl });
  assert.equal(json.diag.ok, true);
  assert.match(json.body, /still here/, 'with no id to wait for, the whole stream is read');
  assert.equal(note.seen.cancelled, false);
  const open = sseOrigin(['data: {"jsonrpc":"2.0","method":"notifications/progress"}\n\n']);
  const t = await proxyMcp({ url: 'https://a.example/mcp', timeoutMs: 500, body: rpc('notifications/initialized') }, { fetch: open.fetchImpl });
  assert.equal(t.json.diag.errorType, 'timeout', 'an open stream is read until the deadline');
});

test('SSE matching: line endings, data with or without a space, split and multi-line events', async () => {
  const cases = [
    ['data: {"jsonrpc":"2.0","id":3,"result":{"a":1}}\r\n\r\n'],
    ['data:{"jsonrpc":"2.0","id":3,"result":{}}\r\r'],
    ['event: message\nid: 9\n', ': comment\ndata: {"jsonrpc":"2.0",\ndata: "id":3,"error":{"code":1,"message":"x"}}\n', '\n'],
    ['data: {"jsonrpc":"2.0","id":3,"re', 'sult":{}}\r', '\n\r\n'],
  ];
  for (const events of cases) {
    const o = sseOrigin(events);
    const { json } = await proxyMcp({ url: 'https://a.example/mcp', timeoutMs: 1000, body: rpc('tools/list', 3) }, { fetch: o.fetchImpl });
    assert.equal(json.diag.ok, true, JSON.stringify(events));
    assert.ok(o.seen.cancelled, 'the held stream is cancelled once the response is in');
  }
  const other = sseOrigin(['data: {"jsonrpc":"2.0","id":4,"result":{}}\n\n', 'data: {"jsonrpc":"2.0","method":"x","id":3}\n\n']);
  const miss = await proxyMcp({ url: 'https://a.example/mcp', timeoutMs: 400, body: rpc('tools/list', 3) }, { fetch: other.fetchImpl });
  assert.equal(miss.json.diag.errorType, 'timeout', 'another id, or a request carrying our id, is not our response');
  const text = sseOrigin(['data: {"jsonrpc":"2.0","id":"a","result":{}}\n\n']);
  const str = await proxyMcp({ url: 'https://a.example/mcp', timeoutMs: 1000, body: rpc('tools/list', 'a') }, { fetch: text.fetchImpl });
  assert.equal(str.json.diag.ok, true, 'string ids match');
});

// ── Retries only for idempotent requests (#85) ────────────────────────────

test('AC-PROXY-RETRY-01: no retry of tools/call', async () => {
  let hits = 0;
  const hang = (u, init) => { hits++; return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))); };
  const body = JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'x', arguments: {} } });
  const { json } = await proxyMcp({ url: 'https://a.example/mcp', timeoutMs: 500, retries: 3, body }, { fetch: hang });
  assert.equal(hits, 1);
  assert.equal(json.diag.errorType, 'timeout');
  assert.equal(json.diag.attempts, 1);
  assert.match(json.diag.retriesSkipped, /tools\/call/);
  // And against the real /hang, the request reaches the socket once
  const t0 = Date.now();
  const real = await call({ url: mock.base + '/hang', timeoutMs: 500, retries: 3, body });
  assert.equal(real.json.diag.attempts, 1);
  assert.ok(Date.now() - t0 < 1000, 'no backoff, no second attempt');
});

test('AC-PROXY-RETRY-02: lists still retry', async () => {
  let hits = 0;
  const refuse = async () => { hits++; throw new TypeError('fetch failed'); };
  const { json } = await proxyMcp({ url: 'https://a.example/mcp', retries: 2, body: rpc('tools/list', 1) }, { fetch: refuse });
  assert.equal(hits, 3);
  assert.equal(json.diag.attempts, 3);
  assert.equal(json.diag.retriesSkipped, null);
});

test('isIdempotent: reads, lists, discovery and ping; never calls, notifications or token requests', () => {
  const p = (method, extra) => ({ body: method ? rpc(method, 1) : null, ...extra });
  for (const m of ['server/discover', 'tools/list', 'resources/list', 'resources/templates/list', 'prompts/list', 'ping', 'resources/read', 'prompts/get']) {
    assert.equal(isIdempotent(p(m)), true, m);
  }
  for (const m of ['tools/call', 'initialize', 'completion/complete', 'logging/setLevel']) assert.equal(isIdempotent(p(m)), false, m);
  assert.equal(isIdempotent({ body: rpc('notifications/initialized') }), false);
  assert.equal(isIdempotent({ body: 'not json' }), false);
  assert.equal(isIdempotent({ method: 'GET', purpose: 'oauth' }), true, 'OAuth discovery is a GET');
  assert.equal(isIdempotent({ method: 'POST', purpose: 'oauth', body: 'grant_type=authorization_code' }), false, 'a code is single-use');
});

test('validateHeaders: RFC 9110 names; no CR, LF or NUL, and nothing Headers would refuse, in values', () => {
  assert.equal(validateHeaders({ 'X-Ok': 'a b\tc', "!#$%&'*+-.^_`|~": 'v', Accept: 'é' }), null);
  for (const [name, value, why] of [
    ['bad name', 'x', 'header name "bad name"'], ['', 'x', 'header name ""'], ['a:b', 'x', 'header name "a:b"'],
    ['X-A', 'a\r\nInjected: 1', 'header "X-A"'], ['X-A', 'a\nb', 'header "X-A"'], ['X-A', 'a\u0000b', 'header "X-A"'], ['X-A', 'snow ☃', 'header "X-A"'],
  ]) {
    const e = validateHeaders({ [name]: value });
    assert.equal(e.status, 400, JSON.stringify(name));
    assert.ok(e.json.error.includes(why), e.json.error);
  }
  assert.equal(validateHeaders({ 'X-N': 5 }), null, 'numbers are sent as text');
});
