/**
 * Governance files (#46): present, filled in, and reachable from the README.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('AC-GOV-COMPLIANCE-01: governance files present', () => {
  for (const f of ['SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', '.github/pull_request_template.md', '.github/dependabot.yml']) {
    assert.ok(existsSync(join(ROOT, f)), 'missing ' + f);
    assert.ok(read(f).trim().length > 100, f + ' is a stub');
  }
  const templates = readdirSync(join(ROOT, '.github', 'ISSUE_TEMPLATE')).filter((f) => f.endsWith('.md'));
  assert.ok(templates.length >= 2, 'expected bug and feature issue templates, got ' + templates.join(', '));

  const readme = read('README.md');
  for (const f of ['SECURITY.md', 'CONTRIBUTING.md']) assert.ok(readme.includes('](' + f + ')'), 'README does not link ' + f);
  assert.ok(read('CONTRIBUTING.md').includes('](CODE_OF_CONDUCT.md)'), 'CONTRIBUTING.md does not link the code of conduct');
  assert.match(read('SECURITY.md'), /security\/advisories\/new/, 'SECURITY.md has no private reporting channel');
  assert.match(read('CONTRIBUTING.md'), /^## Acceptance criteria and regression tests$/m);
});

test('the community and agent files are present and filled in', () => {
  for (const f of ['GOVERNANCE.md', 'SUPPORT.md', 'CITATION.cff', 'AGENTS.md', '.pre-commit-config.yaml', '.devcontainer/devcontainer.json']) {
    assert.ok(existsSync(join(ROOT, f)), 'missing ' + f);
    assert.ok(read(f).trim().length > 100, f + ' is a stub');
  }
  assert.match(read('CLAUDE.md'), /^@AGENTS\.md$/m, 'CLAUDE.md must import AGENTS.md, not keep a second copy');
  assert.match(read('CITATION.cff'), /^cff-version: 1\.2\.0$/m);
});

test('every GitHub Action is pinned by commit', () => {
  const dir = join(ROOT, '.github', 'workflows');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
      assert.match(m[1], /@[0-9a-f]{40}$/, f + ': ' + m[1] + ' is not pinned by commit');
    }
  }
});

test('AC-GOV-COMPLIANCE-02: license is declared once chosen', () => {
  assert.ok(existsSync(join(ROOT, 'LICENSE')), 'missing LICENSE');
  assert.ok(read('LICENSE').trim().length > 100, 'LICENSE is a stub');
  const spdx = JSON.parse(read('package.json')).license;
  assert.match(spdx, /^[A-Za-z0-9.+-]+$/, 'package.json license is not an SPDX identifier');
  assert.equal(JSON.parse(read('package-lock.json')).packages[''].license, spdx, 'package-lock.json disagrees');
  assert.match(read('CITATION.cff'), new RegExp('^license: ' + spdx.replace(/[.+-]/g, '\\$&') + '$', 'm'), 'CITATION.cff disagrees');
  assert.match(read('README.md'), new RegExp('^<!-- SPDX-License-Identifier: ' + spdx.replace(/[.+-]/g, '\\$&') + ' -->'), 'README has no SPDX line');
  assert.ok(read('README.md').includes('](LICENSE)'), 'README does not link LICENSE');
  assert.match(read('README.md'), /^Required Notice: Copyright /m, 'README has no Required Notice line (PolyForm, Notices)');
});
