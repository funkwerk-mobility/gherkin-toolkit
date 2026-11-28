import { test, assert } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, outdent } from './fixtures.mjs';

test('language aliases follow configured specification mappings in tags and YAML', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    spell:
      specification:
        en: en-GB
      content:
        locales: [en, de]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell.quotes=en,de
    Feature: Colour
      Scenario: Show "colour" and "Hinweis"
        Given the colour
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('table header languages can be overridden without changing the header convention', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    tables:
      stepHeader: true
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      @spell.tables.headers=en,de
      Scenario Outline: Transfer
        Given a transfer
          | Hinweis |
          | station |
        Examples: Values
          | Hinweis |
          | station |
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('table header override does not affect body values or sibling scenarios', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    tables:
      stepHeader: true
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      @spell.tables.headers=de
      Scenario: First
        Given a transfer
          | Hinweis |
          | Hinweis |
      Scenario: Second
        Given a transfer
          | Hinweis |
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:6:.*Hinweis/);
  assert.match(result.stderr, /sample\.feature:9:.*Hinweis/);
  assert.notMatch(result.stderr, /sample\.feature:5:/);
});
