/**
 * Operator settings, shared by every host — platform-free.
 *
 * parseConfig(env) reads the variables below from a plain object (process.env,
 * the Worker's env or its globals) and returns { config, errors, warnings }.
 * A host refuses to run (local server) or to proxy (Worker) while errors is not
 * empty, and shows the warnings. config feeds proxyMcp()'s env.
 */
import { DEFAULT_MAX_RESPONSE_BYTES, MAX_RETRIES, MAX_TIMEOUT_MS } from './proxy.js';

export const CONFIG_VARS = [
  { name: 'MCP_TESTER_ALLOWED_TARGETS', help: 'Comma-separated origins the proxy may reach, e.g. "https://developer.hsbc.com". Include your authorization server if you sign in with OAuth. Unset: any.' },
  { name: 'MCP_TESTER_MAX_TIMEOUT_MS', help: 'Longest timeout a request may ask for: 500 to ' + MAX_TIMEOUT_MS + ' (default ' + MAX_TIMEOUT_MS + ').' },
  { name: 'MCP_TESTER_MAX_RETRIES', help: 'Most retries a request may ask for: 0 to ' + MAX_RETRIES + ' (default ' + MAX_RETRIES + ').' },
  { name: 'MCP_TESTER_MAX_RESPONSE_BYTES', help: 'Size at which a server\'s response is cut: 1024 to 67108864 (default ' + DEFAULT_MAX_RESPONSE_BYTES + ').' },
  { name: 'ALLOWED_ORIGINS', help: 'Deprecated: hostnames, any scheme or port. Use MCP_TESTER_ALLOWED_TARGETS.' },
];

var LIMITS = [
  { name: 'MCP_TESTER_MAX_TIMEOUT_MS', key: 'maxTimeoutMs', lo: 500, hi: MAX_TIMEOUT_MS, dflt: MAX_TIMEOUT_MS },
  { name: 'MCP_TESTER_MAX_RETRIES', key: 'maxRetries', lo: 0, hi: MAX_RETRIES, dflt: MAX_RETRIES },
  { name: 'MCP_TESTER_MAX_RESPONSE_BYTES', key: 'maxResponseBytes', lo: 1024, hi: 64 * 1024 * 1024, dflt: DEFAULT_MAX_RESPONSE_BYTES },
];

function isSet(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

function list(v) {
  return String(v).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

/** "https://a.example/" → "https://a.example"; null for anything that is not a bare http(s) origin */
function toOrigin(text) {
  var u;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  var bare = u.pathname === '/' && !u.search && !u.hash && !u.username && !u.password;
  return bare && (u.protocol === 'https:' || u.protocol === 'http:') ? u.origin : null;
}

function readTargets(env, out) {
  var legacy = env.ALLOWED_ORIGINS;
  if (!isSet(env.MCP_TESTER_ALLOWED_TARGETS)) {
    if (isSet(legacy)) {
      out.warnings.push('ALLOWED_ORIGINS is deprecated and will be removed in a later release: set MCP_TESTER_ALLOWED_TARGETS to origins instead, e.g. MCP_TESTER_ALLOWED_TARGETS=https://' + list(legacy)[0]);
      out.config.allowedTargets = list(legacy);
    }
    return;
  }
  if (isSet(legacy)) out.warnings.push('ALLOWED_ORIGINS is ignored because MCP_TESTER_ALLOWED_TARGETS is set');
  list(env.MCP_TESTER_ALLOWED_TARGETS).forEach(function (item) {
    var origin = toOrigin(item);
    if (origin) out.config.allowedTargets.push(origin);
    else out.errors.push('MCP_TESTER_ALLOWED_TARGETS: "' + item + '" is not an origin such as https://mcp.example.com (scheme and host, optional port, no path)');
  });
}

function readLimit(env, limit, out) {
  var raw = env[limit.name];
  if (!isSet(raw)) return;
  var text = String(raw).trim();
  var n = Number(text);
  if (/^\d+$/.test(text) && n >= limit.lo && n <= limit.hi) out.config[limit.key] = n;
  else out.errors.push(limit.name + ': "' + raw + '" must be a whole number from ' + limit.lo + ' to ' + limit.hi);
}

export function parseConfig(env) {
  env = env || {};
  var out = { config: { allowedTargets: [] }, errors: [], warnings: [] };
  LIMITS.forEach(function (l) { out.config[l.key] = l.dflt; });
  readTargets(env, out);
  LIMITS.forEach(function (l) { readLimit(env, l, out); });
  return out;
}

/** The effective policy, one "Label: value" line each, for a startup summary */
export function describeConfig(config) {
  var targets = config.allowedTargets.length
    ? config.allowedTargets.map(function (t) { return t.indexOf('://') === -1 ? t + ' (any scheme or port; deprecated form)' : t; }).join(', ')
    : 'any (set MCP_TESTER_ALLOWED_TARGETS to restrict)';
  return [
    '  Allowed targets: ' + targets,
    '  Limits:          timeout up to ' + config.maxTimeoutMs + ' ms, retries up to ' + config.maxRetries + ', responses up to ' + config.maxResponseBytes + ' bytes',
  ].join('\n');
}
