import { test, assert } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';

test('dotted language tags apply to their regions and specification', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@spell.specification=en-GB @spell.quotes=de-DE\nFeature: Colour\n  Scenario: Show "Hinweis"\n    Given the colour\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('dotted overrides cover prose, content, quotes, tables, data tables, examples and docstrings', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@spell.content=de-DE @spell.prose=de-DE @spell.quotes=de-DE @spell.tables=de-DE @spell.data-tables=de-DE @spell.examples=de-DE @spell.docstrings=de-DE\nFeature: Account\n  Bahnsteig\n  Scenario Outline: Show "Hinweis"\n    Given a transfer\n      | Bahnsteig |\n    Then a message\n      """\n      Bahnsteig\n      """\n    Examples: Values\n      | item |\n      | Bahnsteig |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('off disables a region and a more specific scoped language enables it again', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@spell.tables=off\nFeature: Account\n  Scenario: First\n    Given a transfer\n      | quabble |\n  @spell.data-tables=de-DE\n  Scenario: Second\n    Given a transfer\n      | Bahnsteig |\n      | quabble |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:10:.*quabble/);
  assert.notMatch(result.stderr, /sample\.feature:(5|9):/);
});

test('spell off suppresses spelling for its scope and retains sibling checks', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  @spell=off\n  Scenario: quabble\n    Given quabble\n  Scenario: Second\n    Given quabble\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:6:.*quabble/);
  assert.notMatch(result.stderr, /sample\.feature:(3|4):/);
});

test('feature table header convention applies to all step tables', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@step-data-table-header=true @spell.data-tables=de-DE\nFeature: Account\n  Scenario: First\n    Given a transfer\n      | Bahnsteig |\n      | Bahnsteig |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:5:.*Bahnsteig/);
  assert.notMatch(result.stderr, /sample\.feature:6:/);
});

test('rejects invalid tags and a table convention outside the feature', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@spell.quotes=xx-ZZ\nFeature: Account\n  @step-data-table-header=true\n  Scenario: First\n    Given a transfer\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /invalid spelling locales/);
  assert.match(result.stderr, /on a Feature/);
});

test('Examples specification language applies to its quoted title and values', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario Outline: Transfer\n    Given a transfer\n    @spell.specification=de-DE\n    Examples: "Bahnsteig"\n      | Bahnsteig |\n      | Bahnsteig |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('rejects invalid spell switch values', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@spell=on\nFeature: Account\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /invalid spelling option/);
});
