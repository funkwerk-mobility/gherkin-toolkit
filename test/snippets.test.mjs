import { test, assert } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';

test('checks JSON property names and values, including repeated and escaped words', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given a message\n      """json\n      {"abbrevationCode": "acount acount", "name": "\\u0061count"}\n      """\n');
  const result = run(dir, 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:5:9: unknown word: abbrevation/);
  assert.match(result.stderr, /sample\.feature:5:28: unknown word: acount/);
  assert.match(result.stderr, /sample\.feature:5:35: unknown word: acount/);
  assert.match(result.stderr, /sample\.feature:5:53: unknown word: acount/);
});

test('configures content type handling without ignoring other docstrings', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'shared.yml'), 'spelling:\n  docStringTypes:\n    xml: ignore\n    custom: json\n');
  writeFileSync(join(dir, 'cuke.yml'), 'extends: shared.yml\nspelling:\n  docStringTypes:\n    xml: text\n    json: ignore\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given a message\n      """xml\n      acount\n      """\n    And another message\n      """json\n      {"acount": "acount"}\n      """\n    And a custom message\n      """custom\n      {"acount": 123}\n      """\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:5:7:.*acount/);
  assert.notMatch(result.stderr, /sample\.feature:9:/);
  assert.match(result.stderr, /sample\.feature:13:9:.*acount/);
});
