/**
 * Operator settings (#88): parseConfig() validates every variable both hosts read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, describeConfig } from '../src/core/config.js';

test('defaults: any target, the built-in ceilings', () => {
  const { config, errors, warnings } = parseConfig({});
  assert.deepEqual([errors, warnings], [[], []]);
  assert.deepEqual(config, { allowedTargets: [], maxTimeoutMs: 120000, maxRetries: 3, maxResponseBytes: 8 * 1024 * 1024 });
});

test('MCP_TESTER_ALLOWED_TARGETS: origins only, normalised', () => {
  const ok = parseConfig({ MCP_TESTER_ALLOWED_TARGETS: ' https://A.example/ , http://127.0.0.1:8788,https://b.example:443 ' });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.config.allowedTargets, ['https://a.example', 'http://127.0.0.1:8788', 'https://b.example']);
  for (const bad of ['not a url', 'example.com', 'ftp://x.example', 'https://x.example/mcp', 'https://u:p@x.example', 'https://x.example/?a=1']) {
    const r = parseConfig({ MCP_TESTER_ALLOWED_TARGETS: bad });
    assert.equal(r.errors.length, 1, bad);
    assert.ok(r.errors[0].startsWith('MCP_TESTER_ALLOWED_TARGETS: "' + bad + '"'), r.errors[0]);
  }
});

test('ALLOWED_ORIGINS: a deprecated alias; the new name wins when both are set', () => {
  const old = parseConfig({ ALLOWED_ORIGINS: 'a.example, b.example' });
  assert.deepEqual(old.config.allowedTargets, ['a.example', 'b.example']);
  assert.match(old.warnings[0], /ALLOWED_ORIGINS is deprecated/);
  const both = parseConfig({ ALLOWED_ORIGINS: 'a.example', MCP_TESTER_ALLOWED_TARGETS: 'https://c.example' });
  assert.deepEqual(both.config.allowedTargets, ['https://c.example']);
  assert.match(both.warnings.join('\n'), /ALLOWED_ORIGINS is ignored/);
});

test('limits: integers within range, named when wrong', () => {
  const ok = parseConfig({ MCP_TESTER_MAX_TIMEOUT_MS: '5000', MCP_TESTER_MAX_RETRIES: '0', MCP_TESTER_MAX_RESPONSE_BYTES: '1048576' });
  assert.deepEqual([ok.config.maxTimeoutMs, ok.config.maxRetries, ok.config.maxResponseBytes], [5000, 0, 1048576]);
  for (const [name, value] of [['MCP_TESTER_MAX_TIMEOUT_MS', '100'], ['MCP_TESTER_MAX_TIMEOUT_MS', '1e5'], ['MCP_TESTER_MAX_RETRIES', '4'], ['MCP_TESTER_MAX_RESPONSE_BYTES', 'lots'], ['MCP_TESTER_MAX_RESPONSE_BYTES', '999999999999']]) {
    const r = parseConfig({ [name]: value });
    assert.equal(r.errors.length, 1, name + '=' + value);
    assert.match(r.errors[0], new RegExp('^' + name + ': "' + value.replace('+', '\\+') + '" must be a whole number from'));
  }
  assert.deepEqual(parseConfig({ MCP_TESTER_MAX_RETRIES: '' }).errors, [], 'empty means unset');
});

test('describeConfig: targets, limits, legacy entries marked', () => {
  const text = describeConfig(parseConfig({ ALLOWED_ORIGINS: 'a.example' }).config);
  assert.match(text, /Allowed targets: +a\.example \(any scheme or port; deprecated form\)/);
  assert.match(text, /Limits: +timeout up to 120000 ms, retries up to 3, responses up to 8388608 bytes/);
});
