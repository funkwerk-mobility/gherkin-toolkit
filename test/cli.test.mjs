import { test, assert } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, outdent } from './fixtures.mjs';

test('check accepts a valid feature silently', () => {
  const dir = workspace();
  const file = join(dir, 'valid.feature');
  writeFileSync(file, outdent`
    Feature: A valid feature
      Scenario: A scenario
        Given a step
  `);
  const result = run(dir, file);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
  assert.strictEqual(result.stderr, '');
});

test('check discovers nested features once and reports all parse errors', () => {
  const dir = workspace();
  const nested = join(dir, 'nested');
  mkdirSync(nested);
  const first = join(dir, 'first.feature');
  const second = join(nested, 'second.feature');
  writeFileSync(first, outdent`
    Feature: Bad
      Scenario: Bad
        Given one
          | a | b |
          | x |
  `);
  writeFileSync(second, outdent`
    Feature: Bad
      Scenario: Bad
        Given one
          | a | b |
          | x |
  `);
  writeFileSync(join(nested, 'ignored.txt'), 'not a feature');
  const result = run(dir, dir, first);
  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
  assert.ok(result.stderr.includes(`${first}:5:7:`));
  assert.ok(result.stderr.includes(`${second}:5:7:`));
  assert.strictEqual(result.stderr.split(first).length - 1, 1);
});

test('check with no inputs succeeds silently', () => {
  const result = run(process.cwd());
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
  assert.strictEqual(result.stderr, '');
});

test('missing inputs fail without preventing other files from being checked', () => {
  const dir = workspace();
  const bad = join(dir, 'bad.feature');
  const missing = join(dir, 'missing.feature');
  writeFileSync(bad, outdent`
    # language: unknown
    Feature: Bad
  `);
  const result = run(dir, missing, bad);
  assert.notStrictEqual(result.status, 0);
  assert.ok(result.stderr.includes(missing));
  assert.ok(result.stderr.includes(`${bad}:1:1:`));
});

test('verbose output shows each check when it starts and avoids duplicate files', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'valid.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given an account
  `);
  const result = run(dir, '--verbose', '--only', 'spell', '.', 'valid.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(result.stdout, outdent`
    Parsing: valid.feature
    Checking spelling: valid.feature
  `);
  assert.strictEqual(result.stderr, '');
});

test('verbose reports parsing but not spelling if parsing fails', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'bad.feature'), outdent`
    # language: unknown
    Feature: Bad
  `);
  const result = run(dir, '--verbose', '--only', 'spell', 'bad.feature');
  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(result.stdout, 'Parsing: bad.feature\n');
  assert.match(result.stderr, /bad\.feature:1:1:/);
});
