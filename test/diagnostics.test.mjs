import { test, assert } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';

test('JSON diagnostics contain locations, descriptive rules and severity', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given an acount\n');
  const result = run(dir, '--format', 'json', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.deepStrictEqual(report.diagnostics, [{ path: 'sample.feature', line: 3, column: 14, rule: 'unknown-word', severity: 'error', message: 'unknown word: acount' }]);
  assert.strictEqual(report.total, 1);
  assert.strictEqual(report.hidden, 0);
});

test('reports parse errors and continues checking other files in JSON', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'bad.feature'), '# language: unknown\nFeature: Bad\n');
  writeFileSync(join(dir, 'spelling.feature'), 'Feature: acount\n');
  const result = run(dir, '--format', 'json', 'bad.feature', 'spelling.feature');
  assert.notStrictEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.deepStrictEqual(report.diagnostics.map(item => item.rule), ['parse-error', 'unknown-word']);
  assert.strictEqual(report.diagnostics[0].line, 1);
});

test('JSON remains parseable when fixes and verbose output are enabled', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  const result = run(dir, '--format', 'json', '--verbose', '--fix', '--dictionary', 'dictionary', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.strictEqual(report.total, 0);
  assert.match(report.fixes[0], /florple.*en\.dic/);
  assert.match(result.stderr, /Checking spelling/);
});

test('limits displayed diagnostics while counting hidden findings', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'diagnostics:\n  limit: 1\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n  Scenario: quabble\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /florple/);
  assert.notMatch(result.stderr, /quabble/);
  assert.match(result.stderr, /1 additional diagnostic not shown/);
  const json = run(dir, '--config', 'cuke.yml', '--format', 'json', '--limit', '0', 'sample.feature');
  assert.notStrictEqual(json.status, 0);
  const report = JSON.parse(json.stdout);
  assert.strictEqual(report.diagnostics.length, 0);
  assert.strictEqual(report.total, 2);
  assert.strictEqual(report.hidden, 2);
});

test('reports configuration errors as JSON when JSON output was selected', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'diagnostics:\n  limit: -1\n');
  const result = run(dir, '--format', 'json', '--config', 'cuke.yml');
  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.strictEqual(report.diagnostics[0].rule, 'configuration-error');
  assert.match(report.diagnostics[0].message, /nonnegative integer/);
});

test('reports argument errors as JSON even when the format option follows them', () => {
  const dir = workspace();
  const result = run(dir, '--bogus', '--format', 'json');
  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(result.stderr, '');
  assert.match(JSON.parse(result.stdout).diagnostics[0].message, /Unknown option: --bogus/);
});

test('reports an invalid spelling tag once in a fix run', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@spellchecker-ignore=invalid\nFeature: Account\n');
  const result = run(dir, '--format', 'json', '--fix', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.strictEqual(report.diagnostics.filter(item => item.rule === 'spelling-option').length, 1);
});
