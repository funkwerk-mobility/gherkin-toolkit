import { test, assert } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';

test('feature exclusions skip tables and example values, but not steps or headers', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@spellchecker-ignore=tables,examples\nFeature: Account\n  Scenario Outline: Transfer\n    Given acount\n      | tabllle |\n    Examples: Values\n      | hedder |\n      | vallue |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:4:11:.*acount/);
  assert.match(result.stderr, /sample\.feature:7:9:.*hedder/);
  assert.notMatch(result.stderr, /tabllle|vallue/);
});

test('scenario and Examples exclusions do not leak to siblings', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  @spellchecker-ignore=tables,docStrings\n  Scenario: First\n    Given a transfer\n      | tabllle |\n    Then a message\n      """\n      snippettt\n      """\n  Scenario: Second\n    Given a transfer\n      | tabllle |\n  Scenario Outline: Third\n    Given a transfer\n    @spellchecker-ignore=examples\n    Examples: First\n      | item |\n      | vallue |\n    Examples: Second\n      | item |\n      | vallue |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.notMatch(result.stderr, /sample\.feature:(5|8|18):/);
  assert.match(result.stderr, /sample\.feature:12:9:.*tabllle/);
  assert.match(result.stderr, /sample\.feature:21:9:.*vallue/);
});

test('language tags affect examples and docstrings, not prose or step tables', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@spellchecker-language=de\nFeature: Account\n  Scenario Outline: Transfer\n    Given Bahnsteig\n      | Bahnsteig |\n    Then a message\n      """\n      Bahnsteig\n      """\n    Examples: Values\n      | Bahnsteig |\n      | Bahnsteig |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:4:11:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:5:9:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:11:9:.*Bahnsteig/);
  assert.notMatch(result.stderr, /sample\.feature:(8|12):/);
});

test('docstring language override and Examples tags stay within their own scopes', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario Outline: Transfer\n    Given a message\n      """language=de\n      Bahnsteig quabble\n      """\n    @spellchecker-language=de\n    Examples: First\n      | item |\n      | Bahnsteig |\n    Examples: Second\n      | item |\n      | Bahnsteig |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:5:17:.*quabble/);
  assert.notMatch(result.stderr, /sample\.feature:10:/);
  assert.match(result.stderr, /sample\.feature:13:9:.*Bahnsteig/);
});

test('malformed and unknown spellchecker options produce clickable errors', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), '@spellchecker-ignore=tables,banana\n@spellchecker-language=xx\n@spellchecker-ignore=\n@spellchecker-unexpected=de\nFeature: Account\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:1:1:.*tables,banana/);
  assert.match(result.stderr, /sample\.feature:2:1:.*language=xx/);
  assert.match(result.stderr, /sample\.feature:3:1:.*ignore=/);
  assert.match(result.stderr, /sample\.feature:4:1:.*unexpected/);
});
