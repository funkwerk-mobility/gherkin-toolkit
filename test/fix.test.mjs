import { test, assert } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';

test('forbidden entries override accepted words and remain errors', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'terms.dic'), 'account\n!account\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n');
  const result = run(dir, '--dictionary', 'dictionary', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:1:10: forbidden word: Account/);
});

test('fix adds unknown words in alphabetical position and leaves forbidden words as findings', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'en.dic'), '# Product words\napple\nzebra\n!account\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given florple\n');
  const result = run(dir, '--fix', '--dictionary', 'dictionary', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /forbidden word: Account/);
  assert.match(result.stdout, /florple.*dictionary\/en\.dic/);
  assert.strictEqual(readFileSync(join(dir, 'dictionary', 'en.dic'), 'utf8'), '# Product words\napple\nflorple\nzebra\n!account\n');
});

test('fix uses a region destination and falls back to the feature language for ambiguous content', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'cuke.yml'), 'dictionary: dictionary\nspelling:\n  content:\n    locales: [en-US, de-DE]\n  tables:\n    fixDestination: places\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given "florple"\n      | wibbleton |\n');
  const result = run(dir, '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(readFileSync(join(dir, 'dictionary', 'en.dic'), 'utf8'), 'florple\n');
  assert.strictEqual(readFileSync(join(dir, 'dictionary', 'places.dic'), 'utf8'), 'wibbleton\n');
  const check = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.strictEqual(check.status, 0, check.stderr);
});

test('fix without a product dictionary leaves unknown words as errors', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  const result = run(dir, '--fix', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /unknown word: florple/);
  assert.match(result.stderr, /without a product dictionary/);
});

test('reports words still invalid when the fallback dictionary is outside the region locales', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'cuke.yml'), 'dictionary: dictionary\nspelling:\n  quotes:\n    locale: de-DE\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given "florple"\n');
  const result = run(dir, '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /unknown word: florple/);
  assert.strictEqual(readFileSync(join(dir, 'dictionary', 'en.dic'), 'utf8'), 'florple\n');
});

test('forbidden locale entries do not leak into other language regions', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'de.dic'), '!account\n');
  writeFileSync(join(dir, 'cuke.yml'), 'dictionary: dictionary\nspelling:\n  quotes:\n    locale: de-DE\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given account "account"\n');
  const result = run(dir, '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:20: forbidden word: account/);
  assert.notMatch(result.stderr, /sample\.feature:(1|3:11):/);
});

test('never adds a word forbidden by its configured destination dictionary', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'de.dic'), '!florple\n');
  writeFileSync(join(dir, 'cuke.yml'), 'dictionary: dictionary\nspelling:\n  quotes:\n    fixDestination: de\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given "florple"\n');
  const result = run(dir, '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /unknown word: florple/);
  assert.strictEqual(readFileSync(join(dir, 'dictionary', 'de.dic'), 'utf8'), '!florple\n');
  assert.notMatch(result.stdout, /Added florple/);
});

test('a forbidden word in another locale does not prevent fixing English text', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'de.dic'), '!florple\n');
  writeFileSync(join(dir, 'cuke.yml'), 'dictionary: dictionary\nspelling:\n  quotes:\n    locale: de-DE\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n  Scenario: Transfer\n    Given "Bahnsteig"\n');
  const result = run(dir, '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(readFileSync(join(dir, 'dictionary', 'en.dic'), 'utf8'), 'florple\n');
});
