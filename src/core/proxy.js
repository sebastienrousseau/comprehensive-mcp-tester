/**
 * MCP proxy core — platform-agnostic.
 *
 * Forwards one MCP JSON-RPC request to a target server and returns an
 * envelope carrying the origin's status, headers and body plus timing
 * diagnostics. It has no knowledge of Cloudflare, Node or any host: hosts
 * parse the incoming request, call proxyMcp(), and serialise the result.
 *
 * Contract (relied on by the UI):
 *   input  { url, method?, headers?, body?, timeoutMs?, retries?, purpose? }
 *          purpose: 'mcp' (default) or 'oauth'. OAuth discovery and token calls
 *          aren't MCP requests, so the MCP Accept/Content-Type repairs are skipped.
 *   output { status, json }  where json is either
 *          { error }                                  (bad input, 4xx)
 *          { status, headers, body, diag }             (origin reached or failed)
 *
 * A failed transport (timeout / network) is reported with HTTP 200 and
 * envelope status 0, so the UI can always read the diagnostics.
 */

export const DEFAULT_TIMEOUT_MS = 15000;
export const MAX_TIMEOUT_MS = 120000;
export const MAX_RETRIES = 3;

// Hop-by-hop and identity headers never forwarded to the origin
export const SKIP_HEADERS = ['host', 'origin', 'referer', 'connection', 'upgrade', 'transfer-encoding', 'content-length'];

export function clampInt(v, lo, hi, dflt) {
  var n = parseInt(v, 10);
  if (isNaN(n)) return dflt;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** "a.com, b.com" → ["a.com","b.com"]; empty/undefined → [] (no restriction) */
export function parseAllowedOrigins(str) {
  return String(str || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function badRequest(error) {
  return { status: 400, json: { error: error } };
}

/** Reads the UI's payload into a request with defaults and clamped limits. */
function readRequest(payload) {
  return {
    url: payload.url,
    method: String(payload.method || 'POST').toUpperCase(),
    headers: payload.headers || {},
    body: payload.body || null,
    timeoutMs: clampInt(payload.timeoutMs, 500, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    retries: clampInt(payload.retries, 0, MAX_RETRIES, 0),
    purpose: payload.purpose === 'oauth' ? 'oauth' : 'mcp',
  };
}

/** → { url: URL } or { error: { status, json } } */
export function validateTarget(targetUrl, allowed) {
  var parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { error: badRequest('Invalid target URL') };
  }
  if (allowed.length > 0 && allowed.indexOf(parsed.hostname) === -1) {
    return { error: { status: 403, json: { error: 'Target domain not in allowlist', allowed: allowed } } };
  }
  return { url: parsed };
}

function hasBody(method) {
  return method !== 'GET' && method !== 'HEAD';
}

/** The headers sent to the origin: the UI's, minus hop-by-hop ones, repaired for MCP. */
export function buildOutHeaders(headers, method, purpose) {
  var out = new Headers();
  Object.keys(headers).forEach(function (k) {
    if (SKIP_HEADERS.indexOf(k.toLowerCase()) === -1) out.set(k, headers[k]);
  });
  var accept = out.get('accept') || '';
  if (purpose === 'oauth') {
    if (!accept) out.set('accept', 'application/json');
    return out;
  }
  // MCP Streamable HTTP requires the client to accept BOTH content types.
  // Enforced here so it can never be missing or partial.
  if (accept.indexOf('application/json') === -1 || accept.indexOf('text/event-stream') === -1) {
    out.set('accept', 'application/json, text/event-stream');
  }
  if (!out.get('content-type') && hasBody(method)) out.set('content-type', 'application/json');
  return out;
}

function transportError(err, timedOut, timeoutMs, ms) {
  var isTimeout = timedOut || (err && err.name === 'AbortError');
  return {
    errorType: isTimeout ? 'timeout' : 'network',
    errorDetail: isTimeout
      ? ('No response within ' + timeoutMs + 'ms')
      : ((err && err.message) ? err.message : 'Network failure reaching origin'),
    ms: ms,
  };
}

/**
 * One fetch with its own timeout, covering the body as well as the headers.
 * → { response, status, headers, body, ttfbMs, bodyMs, ms } or { errorType, errorDetail, ms }
 */
export async function attemptOnce(req, doFetch) {
  // On Workers the clock advances on I/O, so spans around an awaited fetch are real.
  var t0 = Date.now();
  var controller = new AbortController();
  var timedOut = false;
  var timer = setTimeout(function () { timedOut = true; controller.abort(); }, req.timeoutMs);
  try {
    var resp = await doFetch(req.url, {
      method: req.method,
      headers: req.outHeaders,
      body: hasBody(req.method) ? req.body : null,
      redirect: 'follow',
      signal: controller.signal,
    });
    // fetch resolves once response headers arrive — time to first byte
    var tHeaders = Date.now();
    var body = await resp.text();
    var tEnd = Date.now();
    var headers = {};
    resp.headers.forEach(function (val, key) { headers[key] = val; });
    return { response: true, status: resp.status, headers: headers, body: body, ttfbMs: tHeaders - t0, bodyMs: tEnd - tHeaders, ms: tEnd - t0 };
  } catch (err) {
    return transportError(err, timedOut, req.timeoutMs, Date.now() - t0);
  } finally {
    clearTimeout(timer);
  }
}

function backoff(n) {
  return new Promise(function (r) { setTimeout(r, Math.min(2000, 250 * Math.pow(2, n - 1))); });
}

/**
 * Calls attempt(n) until one returns a response or maxAttempts are used,
 * waiting between failures. → { ...response, attempt, attemptLog } or { failure, attemptLog }
 */
export async function runAttempts(maxAttempts, attempt, wait) {
  wait = wait || backoff;
  var attemptLog = [];
  var last = null;
  for (var n = 1; n <= maxAttempts; n++) {
    last = await attempt(n);
    if (last.response) {
      attemptLog.push({ n: n, outcome: 'response', status: last.status, ms: last.ms });
      return Object.assign({}, last, { attempt: n, attemptLog: attemptLog });
    }
    attemptLog.push({ n: n, outcome: last.errorType, status: null, ms: last.ms });
    if (n < maxAttempts) await wait(n);
  }
  return { failure: last, attemptLog: attemptLog };
}

function baseDiag(req, colo, attemptLog) {
  return { attemptLog: attemptLog, colo: colo, targetHost: req.target.hostname, timeoutMs: req.timeoutMs };
}

export function successEnvelope(req, colo, r) {
  return {
    status: 200,
    json: {
      status: r.status,
      headers: r.headers,
      body: r.body,
      diag: Object.assign({
        ok: true,
        errorType: null,
        errorDetail: null,
        ttfbMs: r.ttfbMs,
        bodyMs: r.bodyMs,
        totalMs: r.ms,
        attempts: r.attempt,
      }, baseDiag(req, colo, r.attemptLog)),
    },
  };
}

/** All attempts failed — a transport failure, not an HTTP status */
export function failureEnvelope(req, colo, r) {
  var err = r.failure;
  return {
    status: 200,
    json: {
      status: 0,
      headers: {},
      body: JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: err.errorDetail }, id: null }),
      diag: Object.assign({
        ok: false,
        errorType: err.errorType,
        errorDetail: err.errorDetail,
        ttfbMs: null,
        bodyMs: null,
        totalMs: err.ms,
        attempts: r.attemptLog.length,
      }, baseDiag(req, colo, r.attemptLog)),
    },
  };
}

/**
 * @param {object} payload  parsed proxy request from the UI
 * @param {object} env
 * @param {Function} env.fetch          fetch implementation (global fetch in every host)
 * @param {string[]} [env.allowedOrigins] target hostnames allowed; empty = any
 * @param {string|null} [env.colo]      where this proxy instance runs (diagnostics only)
 */
export async function proxyMcp(payload, env) {
  env = env || {};
  var req = readRequest(payload || {});
  if (!req.url) return badRequest("Missing 'url' in request");
  var target = validateTarget(req.url, env.allowedOrigins || []);
  if (target.error) return target.error;
  req.target = target.url;
  req.outHeaders = buildOutHeaders(req.headers, req.method, req.purpose);
  var doFetch = env.fetch || fetch;
  var result = await runAttempts(req.retries + 1, function () { return attemptOnce(req, doFetch); });
  var colo = env.colo || null;
  return result.failure ? failureEnvelope(req, colo, result) : successEnvelope(req, colo, result);
}
