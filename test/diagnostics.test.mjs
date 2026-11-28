import { test, assert } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, outdent } from './fixtures.mjs';

test('JSON diagnostics contain locations, descriptive rules and severity', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given an acount
  `);
  const result = run(dir, '--json', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.deepStrictEqual(report.diagnostics, [{ path: 'sample.feature', line: 3, column: 14, rule: 'unknown-word', severity: 'error', word: 'acount' }]);
  assert.strictEqual(report.total, 1);
  assert.notProperty(report, 'hidden');
});

test('JSON forbidden-word diagnostics expose the forbidden word', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'terms.dic'), '!account\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n');
  const result = run(dir, '--json', '--dictionary', 'dictionary', 'sample.feature');
  const finding = JSON.parse(result.stdout).diagnostics[0];
  assert.strictEqual(finding.rule, 'forbidden-word');
  assert.strictEqual(finding.word, 'Account');
  assert.notProperty(finding, 'message');
});

test('reports parse errors and continues checking other files in JSON', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'bad.feature'), outdent`
    # language: unknown
    Feature: Bad
  `);
  writeFileSync(join(dir, 'spelling.feature'), 'Feature: acount\n');
  const result = run(dir, '--json', 'bad.feature', 'spelling.feature');
  assert.notStrictEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.deepStrictEqual(report.diagnostics.map(item => item.rule), ['parse-error', 'unknown-word']);
  assert.strictEqual(report.diagnostics[0].line, 1);
});

test('JSON remains parseable when fixes and verbose output are enabled', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  const result = run(dir, '--json', '--verbose', '--fix', '--dictionary', 'dictionary', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.strictEqual(report.total, 0);
  assert.match(report.fixes[0], /florple.*en\.dic/);
  assert.match(result.stderr, /Checking spelling/);
});

test('limits displayed diagnostics while counting hidden findings', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    diagnostics:
      limit: 1
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: florple
      Scenario: quabble
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /florple/);
  assert.notMatch(result.stderr, /quabble/);
  assert.match(result.stderr, /1 additional diagnostic not shown/);
  const json = run(dir, '--config', 'cuke.yml', '--json', '--limit', '0', 'sample.feature');
  assert.notStrictEqual(json.status, 0);
  const report = JSON.parse(json.stdout);
  assert.strictEqual(report.diagnostics.length, 2);
  assert.strictEqual(report.total, 2);
  assert.notProperty(report, 'hidden');
});

test('reports configuration errors as JSON when JSON output was selected', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    diagnostics:
      limit: -1
  `);
  const result = run(dir, '--json', '--config', 'cuke.yml');
  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.strictEqual(report.diagnostics[0].rule, 'configuration-error');
  assert.notProperty(report.diagnostics[0], 'message');
});

test('reports argument errors as JSON even when the format option follows them', () => {
  const dir = workspace();
  const result = run(dir, '--bogus', '--json');
  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(result.stderr, '');
  assert.strictEqual(JSON.parse(result.stdout).diagnostics[0].rule, 'configuration-error');
});

test('reports an invalid spelling tag once in a fix run', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spellchecker-ignore=invalid
    Feature: Account
  `);
  const result = run(dir, '--json', '--fix', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.strictEqual(report.diagnostics.filter(item => item.rule === 'spelling-option').length, 1);
});
