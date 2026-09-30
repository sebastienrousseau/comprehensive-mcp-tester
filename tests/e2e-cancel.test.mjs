/**
 * End-to-end cancellation (#86): a real browser, the local Node host and the
 * mock's hang-call scenario, whose tools/call never answers.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/hosts/node-server.js';
import { startMock } from './fixtures/mock-mcp-server.mjs';
import { launchBrowser } from './fixtures/browser.mjs';

const { browser, skip } = await launchBrowser();
let mock, server, page;

before(async () => {
  if (skip) return;
  mock = await startMock({ port: 0 });
  server = createServer({ allowedOrigins: '', allowedHosts: '' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
});

after(async () => {
  if (skip) return;
  await browser.close();
  await new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
  await mock.close();
});

/** The first call to `method` on `path` recorded at index `after` or later */
async function waitForCall(method, path, { after = 0, timeoutMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = mock.calls.slice(after).find((c) => c.body.method === method && c.path === path);
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${method} to ${path}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function startHangingCall() {
  if (await page.evaluate(() => window.state.connected)) await page.click('#connectBtn');
  await page.fill('#urlInput', mock.base + '/scenario/hang-call/mcp');
  await page.click('#connectBtn');
  await page.waitForFunction(() => window.state.connected && window.state.tools.length === 3, null, { timeout: 5000 });
  await page.click('.tab-btn[data-tab="tools"]');
  await page.locator('.item-card').first().click();
  await page.waitForSelector('#invoke-0');
  const mark = mock.calls.length;
  await page.click('#invoke-0');
  const call = await waitForCall('tools/call', '/scenario/hang-call/mcp', { after: mark });
  await page.waitForSelector('#cancel-tool-0');
  return call;
}

test('AC-PROXY-CANCEL-02: cancel frees the UI', { skip }, async () => {
  await startHangingCall();
  assert.equal(await page.isDisabled('#invoke-0'), true, 'the call is running');
  await page.click('#cancel-tool-0');
  assert.equal(await page.isDisabled('#invoke-0'), false, 'the call button is enabled at once');
  assert.equal(await page.locator('#cancel-tool-0').count(), 0);
  await page.waitForFunction(() => window.state.log.some((e) => e.method === 'tools/call' && /Cancelled by the user/.test(JSON.stringify(e.body))), null, { timeout: 2000 });
  await page.waitForFunction(() => { const d = window.state.drafts['tool-0']; return d && d.lastRes && d.lastRes.cancelled; }, null, { timeout: 2000 });
  assert.equal(await page.evaluate(() => window.diag.probes.filter((p) => p.errorType === 'client').length), 0, 'a cancel is not a server failure');
});

test('AC-PROXY-CANCEL-03: server told about the cancel', { skip }, async () => {
  const call = await startHangingCall();
  const mark = mock.calls.length;
  await page.click('#cancel-tool-0');
  const note = await waitForCall('notifications/cancelled', '/scenario/hang-call/mcp', { after: mark });
  assert.equal(note.body.id, undefined, 'a notification has no id');
  assert.equal(note.body.params.requestId, call.body.id);
  assert.equal(note.headers['mcp-session-id'], call.headers['mcp-session-id']);
  await page.click('#connectBtn');
});
