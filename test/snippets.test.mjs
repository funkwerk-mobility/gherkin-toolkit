import { test, assert } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, outdent } from './fixtures.mjs';

test('checks JSON property names and values, including repeated and escaped words', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given a message
          """json
          {"abbrevationCode": "acount acount", "name": "\\u0061count"}
          """
  `);
  const result = run(dir, 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:5:9: unknown word: abbrevation/);
  assert.match(result.stderr, /sample\.feature:5:28: unknown word: acount/);
  assert.match(result.stderr, /sample\.feature:5:35: unknown word: acount/);
  assert.match(result.stderr, /sample\.feature:5:53: unknown word: acount/);
});

test('configures content type handling without ignoring other docstrings', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'shared.yml'), outdent`
    spell:
      docStringTypes:
        xml: ignore
        custom: json
  `);
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    extends: shared.yml
    spell:
      docStringTypes:
        xml: text
        json: ignore
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given a message
          """xml
          acount
          """
        And another message
          """json
          {"acount": "acount"}
          """
        And a custom message
          """custom
          {"acount": 123}
          """
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:5:7:.*acount/);
  assert.notMatch(result.stderr, /sample\.feature:9:/);
  assert.match(result.stderr, /sample\.feature:13:9:.*acount/);
});
