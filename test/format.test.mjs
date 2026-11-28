import { test, assert } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, runCommand } from './fixtures.mjs';

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

test('normalizes description blank lines and preserves inline table comments', () => {
  const dir = workspace();
  const file = join(dir, 'example.feature');
  writeFileSync(file, 'Feature: Example\n  words\n\n\n  more\n  Scenario: Example\n    Given a table\n      | a | b | # explanation\n      | long | x |\n');
  const result = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(readFileSync(file, 'utf8'), /words\n\n  more/);
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

test('requires a blank line between the last step and Examples', () => {
  const dir = workspace();
  const file = join(dir, 'outline.feature');
  const source = 'Feature: Timetable\n\n  Scenario Outline: Show departures\n    Given a train <name>\n    Examples:\n      | name |\n      | ICE  |\n';
  writeFileSync(file, source);
  const check = run(dir, '--only', 'format', 'outline.feature');
  assert.notStrictEqual(check.status, 0);
  assert.match(check.stderr, /outline\.feature:5:1:.*blank line/i);
  assert.strictEqual(readFileSync(file, 'utf8'), source);
  const fixed = run(dir, '--only', 'format', '--fix', 'outline.feature');
  assert.strictEqual(fixed.status, 0, fixed.stderr);
  assert.strictEqual(readFileSync(file, 'utf8'), source.replace('    Examples:', '\n    Examples:'));
  assert.strictEqual(run(dir, '--only', 'format', 'outline.feature').status, 0);
});

test('normalizes spacing after section keywords without changing title content', () => {
  const dir = workspace();
  const file = join(dir, 'outline.feature');
  const source = 'Feature:  Timetable\n\n  Scenario:  Show the "red  signal"\n    Given a train\n';
  writeFileSync(file, source);
  const check = run(dir, '--only', 'format', 'outline.feature');
  assert.notStrictEqual(check.status, 0);
  assert.strictEqual(readFileSync(file, 'utf8'), source);
  const fixed = run(dir, '--only', 'format', '--fix', 'outline.feature');
  assert.strictEqual(fixed.status, 0, fixed.stderr);
  assert.strictEqual(readFileSync(file, 'utf8'), 'Feature: Timetable\n\n  Scenario: Show the "red  signal"\n    Given a train\n');
  assert.strictEqual(run(dir, '--only', 'format', 'outline.feature').status, 0);
});

test('normalizes spacing and wraps prose and tags with configurable indentation', () => {
  const dir = workspace();
  const file = join(dir, 'sample.feature');
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [format]\nformat:\n  printWidth: 30\n  tabWidth: 4\n  useTabs: false\n  tags: single-line\n');
  writeFileSync(file, 'Feature: Example\n  This  is a long description with many words to wrap.\n\n\n  @first @second @third @fourth\n  Scenario: Example\n    Given   a train\n');
  const fix = run(dir, '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.strictEqual(fix.status, 0, fix.stderr);
  assert.strictEqual(readFileSync(file, 'utf8'), 'Feature: Example\n    This is a long description\n    with many words to wrap.\n\n    @first @second @third\n    @fourth\n    Scenario: Example\n        Given a train\n');
  assert.strictEqual(run(dir, '--config', 'cuke.yml', 'sample.feature').status, 0);
});

test('supports tabs for indentation', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [format]\nformat:\n  tabWidth: 4\n  useTabs: true\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Example\n  Scenario: Example\n    Given a train\n');
  const fix = run(dir, '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.strictEqual(fix.status, 0, fix.stderr);
  assert.strictEqual(readFileSync(join(dir, 'sample.feature'), 'utf8'), 'Feature: Example\n\n\tScenario: Example\n\t\tGiven a train\n');
});

test('preserves spacing inside quoted step arguments and docstrings', () => {
  const dir = workspace();
  const file = join(dir, 'quotes.feature');
  writeFileSync(file, 'Feature: Example\n\n  Scenario: Example\n    Given   "a  b" and \'c  d\'\n      """\n      keep  this\n      """\n');
  const fix = run(dir, '--only', 'format', '--fix', 'quotes.feature');
  assert.strictEqual(fix.status, 0, fix.stderr);
  assert.strictEqual(readFileSync(file, 'utf8'), 'Feature: Example\n\n  Scenario: Example\n    Given "a  b" and \'c  d\'\n      """\n      keep  this\n      """\n');
});

test('formats multiline quoted prose when changing indentation to tabs', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [format]\nformat:\n  useTabs: true\n');
  const file = join(dir, 'sample.feature');
  const source = 'Feature: Display\n\n  Scenario: Show a remark\n\n    It shows "via\n    Budapest" on the display.\n\n    Given a train\n';
  writeFileSync(file, source);
  const fix = run(dir, '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.strictEqual(fix.status, 0, fix.stderr);
  assert.match(readFileSync(file, 'utf8'), /"via\n\t\tBudapest"/u);
  assert.strictEqual(run(dir, '--config', 'cuke.yml', 'sample.feature').status, 0);
});

test('keeps punctuation attached to quoted prose while wrapping', () => {
  const dir = workspace();
  const file = join(dir, 'example.feature');
  const source = 'Feature: Example\n\n  Scenario: Example\n\n    The feature "Route band". See ("Cancellation").\n\n    Given a train\n';
  writeFileSync(file, source);
  const fixed = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(fixed.status, 0, fixed.stderr);
  assert.strictEqual(readFileSync(file, 'utf8'), source);
});

test('format command fixes files using Prettier settings when no Cuke configuration is selected', () => {
  const dir = workspace();
  const file = join(dir, 'example.feature');
  writeFileSync(join(dir, '.prettierrc.yml'), 'printWidth: 30\ntabWidth: 4\nuseTabs: true\nsemi: true\n');
  writeFileSync(file, '@one @two\n@three # reason\nFeature: Example\n  A description that is long enough to wrap.\n  Scenario: Example\n    Given a train\n');
  const result = runCommand(dir, 'format', 'example.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  const output = readFileSync(file, 'utf8');
  assert.match(output, /^@one @two\n@three # reason/m);
  assert.match(output, /\tScenario: Example\n\t\tGiven a train/);
  assert.match(output, /description that is long\n\tenough to wrap/);
  assert.strictEqual(runCommand(dir, 'format', 'example.feature').stdout, '');
});

test('explicit Cuke configuration takes precedence over Prettier settings', () => {
  const dir = workspace();
  writeFileSync(join(dir, '.prettierrc.yml'), 'tabWidth: 8\nuseTabs: true\n');
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\nformat:\n  tabWidth: 4\n');
  writeFileSync(join(dir, 'example.feature'), 'Feature: Example\nScenario: Example\nGiven a train\n');
  const result = runCommand(dir, 'format', '--config', 'cuke.yml', 'example.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(readFileSync(join(dir, 'example.feature'), 'utf8'), /\n    Scenario: Example\n        Given a train/);
});

test('format fallback also applies to check, and malformed Prettier settings are reported', () => {
  const dir = workspace();
  writeFileSync(join(dir, '.prettierrc.yml'), 'tabWidth: 0\n');
  writeFileSync(join(dir, 'example.feature'), 'Feature: Example\n');
  const result = run(dir, '--only', 'format', 'example.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /tabWidth must be a positive integer/);
});
