import { test, assert } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';

test('isolates locale word lists and selects shared product dictionaries by policy', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'en-US.dic'), 'quabble\n');
  writeFileSync(join(dir, 'dictionary', 'en-GB.dic'), 'florple\n');
  writeFileSync(join(dir, 'dictionary', 'places.dic'), 'wibbleton\n');
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\ndictionary: ./dictionary\nspelling:\n  text:\n    dictionaries: [places]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given quabble and wibbleton and florple\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /florple/);
  assert.notMatch(result.stderr, /quabble|wibbleton/);
});

test('uses a global table language without changing step or Examples header spelling', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\nspelling:\n  tables:\n    locale: de-DE\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario Outline: Transfer\n    Given Bahnsteig\n      | Bahnsteig |\n    Examples: Values\n      | Bahnsteig |\n      | Bahnsteig |\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:11:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:6:9:.*Bahnsteig/);
  assert.notMatch(result.stderr, /sample\.feature:(4|7):/);
});

test('scenario broad override beats feature specific override, and scenario specific beats broad', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@spell-examples=en-GB\nFeature: Account\n  @spell-tables=de-DE @spell-examples=en-US\n  Scenario Outline: Transfer\n    Given a transfer\n      | Bahnsteig |\n    Examples: Values\n      | item |\n      | colour |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:9:9:.*colour/);
  assert.notMatch(result.stderr, /sample\.feature:6:/);
});

test('uses dialect mappings and applies the docstring language separately', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\nspelling:\n  dialects:\n    en: en-GB\n  docStrings:\n    locale: de-DE\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Colour\n  Scenario: Colour\n    Given the colour\n      """\n      Bahnsteig\n      """\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('checks escaped table cells at their original source column', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given an account\n      | one \\| acount |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:4:16:.*acount/);
});

test('feature and scenario overrides stay within their own scopes', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@spell-tables=de\nFeature: Account\n  Scenario: First\n    Given a transfer\n      | Bahnsteig |\n  @spell-tables=en-GB\n  Scenario: Second\n    Given a transfer\n      | colour |\n  Scenario: Third\n    Given a transfer\n      | colour |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:12:9:.*colour/);
  assert.notMatch(result.stderr, /sample\.feature:(5|9):/);
});

test('uses shared dictionaries for text, tables and docstrings', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'places.dic'), 'wibbleton\n');
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\ndictionary: dictionary\nspelling:\n  dataTables:\n    dictionaries: [places]\n  docStrings:\n    dictionaries: [places]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given wibbleton\n      | wibbleton |\n    Then transfer\n      """\n      wibbleton\n      """\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('inherits locale settings while using all shared dictionaries', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  mkdirSync(join(dir, 'product'));
  writeFileSync(join(dir, 'dictionary', 'places.dic'), 'wibbleton\n');
  writeFileSync(join(dir, 'dictionary', 'terms.dic'), 'florple\n');
  writeFileSync(join(dir, 'shared.yml'), 'checks: [spell]\ndictionary: dictionary\nspelling:\n  text:\n    locale: en-GB\n    dictionaries: [places]\n');
  writeFileSync(join(dir, 'product', 'cuke.yml'), 'extends: ../shared.yml\nspelling:\n  text:\n    dictionaries: [terms]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Colour\n  Scenario: Transfer\n    Given florple and wibbleton\n');
  const result = run(dir, '--config', 'product/cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('rejects unsupported configured locales before checking files', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'spelling:\n  tables:\n    locale: xx-ZZ\n');
  const result = run(dir, '--config', 'cuke.yml');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /unsupported spelling language: xx-ZZ/);
});

test('checks docstring text after an escaped delimiter at its source location', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given an account\n      """\n      value \\"\\"\\" acount\n      """\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:5:20:.*acount/);
});

test('automatically uses every domain dictionary in all regions without leaking language dictionaries', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'places.dic'), 'wibbleton\n');
  writeFileSync(join(dir, 'dictionary', 'terms.dic'), 'florple\n');
  writeFileSync(join(dir, 'dictionary', 'en-GB.dic'), 'quabble\n');
  writeFileSync(join(dir, 'dictionary', 'de.dic'), 'knurbel\n');
  writeFileSync(join(dir, 'dictionary', 'fr.dic'), 'zorflin\n');
  writeFileSync(join(dir, 'dictionary', 'german.dic'), 'plimzor\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: wibbleton\n  Scenario Outline: Transfer\n    Given florple and quabble and knurbel and zorflin and plimzor\n      | wibbleton |\n    Examples: Values\n      | item |\n      | florple |\n');
  const result = run(dir, '--only', 'spell', '--dictionary', 'dictionary', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /quabble/);
  assert.match(result.stderr, /knurbel/);
  assert.match(result.stderr, /zorflin/);
  assert.match(result.stderr, /plimzor/);
  assert.notMatch(result.stderr, /wibbleton|florple/);
});
