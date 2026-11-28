import { test, assert } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';

test('language aliases follow configured specification mappings in tags and YAML', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'spell:\n  specification:\n    en: en-GB\n  content:\n    locales: [en, de]\n');
  writeFileSync(join(dir, 'sample.feature'), '@spell.quotes=en,de\nFeature: Colour\n  Scenario: Show "colour" and "Hinweis"\n    Given the colour\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('table header languages can be overridden without changing the header convention', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'tables:\n  stepHeader: true\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  @spell.tables.headers=en,de\n  Scenario Outline: Transfer\n    Given a transfer\n      | Hinweis |\n      | station |\n    Examples: Values\n      | Hinweis |\n      | station |\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('table header override does not affect body values or sibling scenarios', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'tables:\n  stepHeader: true\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  @spell.tables.headers=de\n  Scenario: First\n    Given a transfer\n      | Hinweis |\n      | Hinweis |\n  Scenario: Second\n    Given a transfer\n      | Hinweis |\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:6:.*Hinweis/);
  assert.match(result.stderr, /sample\.feature:9:.*Hinweis/);
  assert.notMatch(result.stderr, /sample\.feature:5:/);
});
