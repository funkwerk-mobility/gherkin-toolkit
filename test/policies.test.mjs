import { test, assert } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, outdent } from './fixtures.mjs';

test('isolates locale word lists and selects shared project dictionaries by policy', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'en-US.dic'), 'quabble\n');
  writeFileSync(join(dir, 'dictionary', 'en-GB.dic'), 'florple\n');
  writeFileSync(join(dir, 'dictionary', 'places.dic'), 'wibbleton\n');
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    dictionary: ./dictionary
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given quabble and wibbleton and florple
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /florple/);
  assert.notMatch(result.stderr, /quabble|wibbleton/);
});

test('uses a global table language without changing step or Examples header spelling', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    spell:
      tables:
        locale: de-DE
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario Outline: Transfer
        Given Bahnsteig
          | Bahnsteig |
        Examples: Values
          | Bahnsteig |
          | Bahnsteig |
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:11:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:6:9:.*Bahnsteig/);
  assert.notMatch(result.stderr, /sample\.feature:(4|7):/);
});

test('scenario broad override beats feature specific override, and scenario specific beats broad', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell-examples=en-GB
    Feature: Account
      @spell-tables=de-DE @spell-examples=en-US
      Scenario Outline: Transfer
        Given a transfer
          | Bahnsteig |
        Examples: Values
          | item |
          | colour |
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:9:9:.*colour/);
  assert.notMatch(result.stderr, /sample\.feature:6:/);
});

test('uses dialect mappings and applies the docstring language separately', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    spell:
      dialects:
        en: en-GB
      docStrings:
        locale: de-DE
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Colour
      Scenario: Colour
        Given the colour
          """
          Bahnsteig
          """
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('checks escaped table cells at their original source column', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given an account
          | one \\| acount |
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:4:16:.*acount/);
});

test('feature and scenario overrides stay within their own scopes', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell-tables=de
    Feature: Account
      Scenario: First
        Given a transfer
          | Bahnsteig |
      @spell-tables=en-GB
      Scenario: Second
        Given a transfer
          | colour |
      Scenario: Third
        Given a transfer
          | colour |
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:12:9:.*colour/);
  assert.notMatch(result.stderr, /sample\.feature:(5|9):/);
});

test('uses shared dictionaries for text, tables and docstrings', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'places.dic'), 'wibbleton\n');
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    dictionary: dictionary
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given wibbleton
          | wibbleton |
        Then transfer
          """
          wibbleton
          """
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('inherits locale settings while using all shared dictionaries', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  mkdirSync(join(dir, 'project'));
  writeFileSync(join(dir, 'dictionary', 'places.dic'), 'wibbleton\n');
  writeFileSync(join(dir, 'dictionary', 'terms.dic'), 'florple\n');
  writeFileSync(join(dir, 'shared.yml'), outdent`
    checks: [spell]
    dictionary: dictionary
    spell:
      specification:
        en: en-GB
  `);
  writeFileSync(join(dir, 'project', 'cuke.yml'), outdent`
    extends: ../shared.yml
    spell:
      content:
        locales: [en-US]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Colour
      Scenario: Transfer
        Given florple and wibbleton
  `);
  const result = run(dir, '--config', 'project/cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('rejects unsupported configured locales before checking files', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    spell:
      tables:
        locale: xx-ZZ
  `);
  const result = run(dir, '--config', 'cuke.yml');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /unsupported spelling language: xx-ZZ/);
});

test('checks docstring text after an escaped delimiter at its source location', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given an account
          """
          value \\"\\"\\" acount
          """
  `);
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
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: wibbleton
      Scenario Outline: Transfer
        Given florple and quabble and knurbel and zorflin and plimzor
          | wibbleton |
        Examples: Values
          | item |
          | florple |
  `);
  const result = run(dir, '--only', 'spell', '--dictionary', 'dictionary', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /quabble/);
  assert.match(result.stderr, /knurbel/);
  assert.match(result.stderr, /zorflin/);
  assert.match(result.stderr, /plimzor/);
  assert.notMatch(result.stderr, /wibbleton|florple/);
});
