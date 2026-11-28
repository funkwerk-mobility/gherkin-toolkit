import { test, assert } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';

test('format checks without writing and fixes indentation and aligned tables idempotently', () => {
  const dir = workspace();
  const file = join(dir, 'example.feature');
  const original = 'Feature: Sample\nScenario: Example\nGiven a table\n|one|two|\n|longer|x|\n';
  writeFileSync(file, original);
  const check = run(dir, '--only', 'format', 'example.feature');
  assert.notStrictEqual(check.status, 0);
  assert.match(check.stderr, /example\.feature:.*format/);
  assert.strictEqual(readFileSync(file, 'utf8'), original);
  const fix = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(fix.status, 0, fix.stderr);
  assert.match(fix.stdout, /example\.feature/);
  assert.strictEqual(readFileSync(file, 'utf8'), 'Feature: Sample\n\n  Scenario: Example\n    Given a table\n      | one    | two |\n      | longer | x   |\n');
  const again = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(again.status, 0, again.stderr);
  assert.strictEqual(again.stdout, '');
});

test('tag layouts preserve inline explanations and can put each tag on its own line', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [format]\nformat:\n  tags: one-per-line\n');
  writeFileSync(join(dir, 'example.feature'), '@one @two # reason\nFeature: Example\n  @skip # because of a bug\n  @other\n  Scenario: Example\n    Given a step\n');
  const fixed = run(dir, '--config', 'cuke.yml', '--fix', 'example.feature');
  assert.strictEqual(fixed.status, 0, fixed.stderr);
  assert.strictEqual(readFileSync(join(dir, 'example.feature'), 'utf8'), '@one\n@two # reason\nFeature: Example\n\n  @skip # because of a bug\n  @other\n  Scenario: Example\n    Given a step\n');
  assert.strictEqual(run(dir, '--config', 'cuke.yml', 'example.feature').status, 0);
});

test('preserves tag line breaks and explanations by default', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'example.feature'), '@one @two\n@skip # reason\nFeature: Example\n');
  const result = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(readFileSync(join(dir, 'example.feature'), 'utf8'), '@one @two\n@skip # reason\nFeature: Example\n');
});

test('preserves description blank lines and inline table comments', () => {
  const dir = workspace();
  const file = join(dir, 'example.feature');
  writeFileSync(file, 'Feature: Example\n  words\n\n\n  more\n  Scenario: Example\n    Given a table\n      | a | b | # explanation\n      | long | x |\n');
  const result = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(readFileSync(file, 'utf8'), /words\n\n\n  more/);
  assert.match(readFileSync(file, 'utf8'), /\| a +\| b \| # explanation/);
});

test('preserves tag lines while normalizing spaces', () => {
  const dir = workspace();
  const file = join(dir, 'example.feature');
  writeFileSync(file, '@one    @two # reason\nFeature: Example\n');
  const result = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(readFileSync(file, 'utf8'), '@one @two # reason\nFeature: Example\n');
});
