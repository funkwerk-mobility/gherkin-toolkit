import { test, assert } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, outdent } from './fixtures.mjs';

test('feature exclusions skip tables and example values, but not steps or headers', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spellchecker-ignore=tables,examples
    Feature: Account
      Scenario Outline: Transfer
        Given acount
          | tabllle |
        Examples: Values
          | hedder |
          | vallue |
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:4:11:.*acount/);
  assert.match(result.stderr, /sample\.feature:7:9:.*hedder/);
  assert.notMatch(result.stderr, /tabllle|vallue/);
});

test('scenario and Examples exclusions do not leak to siblings', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      @spellchecker-ignore=tables,docStrings
      Scenario: First
        Given a transfer
          | tabllle |
        Then a message
          """
          snippettt
          """
      Scenario: Second
        Given a transfer
          | tabllle |
      Scenario Outline: Third
        Given a transfer
        @spellchecker-ignore=examples
        Examples: First
          | item |
          | vallue |
        Examples: Second
          | item |
          | vallue |
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.notMatch(result.stderr, /sample\.feature:(5|8|18):/);
  assert.match(result.stderr, /sample\.feature:12:9:.*tabllle/);
  assert.match(result.stderr, /sample\.feature:21:9:.*vallue/);
});

test('language tags affect examples and docstrings, not prose or step tables', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spellchecker-language=de
    Feature: Account
      Scenario Outline: Transfer
        Given Bahnsteig
          | Bahnsteig |
        Then a message
          """
          Bahnsteig
          """
        Examples: Values
          | Bahnsteig |
          | Bahnsteig |
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:4:11:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:5:9:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:11:9:.*Bahnsteig/);
  assert.notMatch(result.stderr, /sample\.feature:(8|12):/);
});

test('docstring language override and Examples tags stay within their own scopes', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario Outline: Transfer
        Given a message
          """language=de
          Bahnsteig quabble
          """
        @spellchecker-language=de
        Examples: First
          | item |
          | Bahnsteig |
        Examples: Second
          | item |
          | Bahnsteig |
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:5:17:.*quabble/);
  assert.notMatch(result.stderr, /sample\.feature:10:/);
  assert.match(result.stderr, /sample\.feature:13:9:.*Bahnsteig/);
});

test('malformed and unknown spellchecker options produce clickable errors', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spellchecker-ignore=tables,banana
    @spellchecker-language=xx
    @spellchecker-ignore=
    @spellchecker-unexpected=de
    Feature: Account
  `);
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:1:1:.*tables,banana/);
  assert.match(result.stderr, /sample\.feature:2:1:.*language=xx/);
  assert.match(result.stderr, /sample\.feature:3:1:.*ignore=/);
  assert.match(result.stderr, /sample\.feature:4:1:.*unexpected/);
});
