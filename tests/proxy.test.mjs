import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { proxyMcp, parseAllowedOrigins, clampInt, validateTarget, buildOutHeaders, runAttempts, attemptOnce } from '../src/core/proxy.js';
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
  const { json } = await call(init(mock.base + '/hang', { timeoutMs: 500, retries: 2 }));
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
const DIAG_KEYS = ['attemptLog', 'attempts', 'bodyMs', 'colo', 'errorDetail', 'errorType', 'ok', 'targetHost', 'timeoutMs', 'totalMs', 'ttfbMs'];

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
  const bad = await proxyMcp({ url: 'https://mcp.example/mcp', retries: 1 }, { fetch: refused });
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
