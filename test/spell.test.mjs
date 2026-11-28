import { test, assert } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';


test('reports spelling mistakes in prose and steps with precise locations', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  An acount holds funds.\n  Scenario: Transfer\n    Given the acount is open\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:2:6:.*acount/);
  assert.match(result.stderr, /sample\.feature:4:15:.*acount/);
});

test('a custom dictionary selected on the command line accepts its words', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionaries'));
  writeFileSync(join(dir, 'dictionaries', 'en-US.dic'), '# Project words\nflorple\n');
  writeFileSync(join(dir, 'dictionaries', 'en-GB.dic'), 'acount\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given florple and acount\n');
  const result = run(dir, '--only', 'spell', '--dictionary', 'dictionaries', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /acount/);
  assert.notMatch(result.stderr, /florple/);
});

test('splits identifiers and numbers while treating contractions as whole words', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), "Feature: Account\n  Scenario: Transfer\n    Given customerAccount has 123 orders and doesn't fail\n    And customerAcount doesn’t pass\n    And doesn fail\n");
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:4:17:.*Acount/);
  assert.match(result.stderr, /sample\.feature:5:9:.*doesn/);
  assert.notMatch(result.stderr, /doesn’t|doesn't|customerAccount|123/);
});

test('configuration dictionary paths follow their declaring file and CLI overrides them', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'shared'));
  mkdirSync(join(dir, 'project'));
  mkdirSync(join(dir, 'other'));
  writeFileSync(join(dir, 'shared', 'en-US.dic'), 'florple\n');
  writeFileSync(join(dir, 'other', 'en-US.dic'), 'quabble\n');
  writeFileSync(join(dir, 'shared', 'common.yml'), 'dictionary: .\nchecks: [spell]\n');
  writeFileSync(join(dir, 'project', 'cuke.yml'), 'extends: ../shared/common.yml\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given florple\n');
  const inherited = run(dir, '--config', 'project/cuke.yml', 'sample.feature');
  assert.strictEqual(inherited.status, 0, inherited.stderr);
  const overridden = run(dir, '--config', 'project/cuke.yml', '--dictionary', 'other', 'sample.feature');
  assert.notStrictEqual(overridden.status, 0);
  assert.match(overridden.stderr, /florple/);
});

test('a feature in an unsupported language does not silently use English', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'fr.feature'), '# language: es\nCaracterística: Cuenta\n');
  const result = run(dir, '--only', 'spell', 'fr.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /fr\.feature.*unsupported.*es/i);
});

test('rejects malformed contractions instead of accepting their fragments', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), "Feature: Account\n  Scenario: Transfer\n    Given the user do'nt and does’n pass\n");
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:20:.*do'nt/);
  assert.match(result.stderr, /sample\.feature:3:30:.*does’n/);
});

test('reports descriptions after comments at the description line', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  # acount\n  acount\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:3:.*acount/);
  assert.notMatch(result.stderr, /sample\.feature:2:/);
});

test('checks Examples titles and descriptions', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario Outline: Transfer\n    Given a transfer\n    Examples: acount\n      An acount description\n      | amount |\n      | 1 |\n');
  const result = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:4:15:.*acount/);
  assert.match(result.stderr, /sample\.feature:5:10:.*acount/);
});
