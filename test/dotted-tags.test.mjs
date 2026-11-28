import { test, assert } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, outdent } from './fixtures.mjs';

test('dotted language tags apply to their regions and specification', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell.specification=en-GB @spell.quotes=de-DE
    Feature: Colour
      Scenario: Show "Hinweis"
        Given the colour
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('dotted overrides cover prose, content, quotes, tables, data tables, examples and docstrings', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell.content=de-DE @spell.prose=de-DE @spell.quotes=de-DE @spell.tables=de-DE @spell.data-tables=de-DE @spell.examples=de-DE @spell.docstrings=de-DE
    Feature: Account
      Bahnsteig
      Scenario Outline: Show "Hinweis"
        Given a transfer
          | Bahnsteig |
        Then a message
          """
          Bahnsteig
          """
        Examples: Values
          | item |
          | Bahnsteig |
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('off disables a region and a more specific scoped language enables it again', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell.tables=off
    Feature: Account
      Scenario: First
        Given a transfer
          | quabble |
      @spell.data-tables=de-DE
      Scenario: Second
        Given a transfer
          | Bahnsteig |
          | quabble |
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:10:.*quabble/);
  assert.notMatch(result.stderr, /sample\.feature:(5|9):/);
});

test('spell off suppresses spelling for its scope and retains sibling checks', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      @spell=off
      Scenario: quabble
        Given quabble
      Scenario: Second
        Given quabble
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:6:.*quabble/);
  assert.notMatch(result.stderr, /sample\.feature:(3|4):/);
});

test('feature table header convention applies to all step tables', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @step-data-table-header=true @spell.data-tables=de-DE
    Feature: Account
      Scenario: First
        Given a transfer
          | Bahnsteig |
          | Bahnsteig |
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:5:.*Bahnsteig/);
  assert.notMatch(result.stderr, /sample\.feature:6:/);
});

test('rejects invalid tags and a table convention outside the feature', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell.quotes=xx-ZZ
    Feature: Account
      @step-data-table-header=true
      Scenario: First
        Given a transfer
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /invalid spelling locales/);
  assert.match(result.stderr, /on a Feature/);
});

test('Examples specification language applies to its quoted title and values', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario Outline: Transfer
        Given a transfer
        @spell.specification=de-DE
        Examples: "Bahnsteig"
          | Bahnsteig |
          | Bahnsteig |
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('rejects invalid spell switch values', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell=on
    Feature: Account
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /invalid spelling option/);
});
