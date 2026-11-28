import { test, assert } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, runCommand, outdent } from './fixtures.mjs';

test('format checks without writing and fixes indentation and aligned tables idempotently', () => {
  const dir = workspace();
  const file = join(dir, 'example.feature');
  const original = outdent`
    Feature: Sample
    Scenario: Example
    Given a table
    |one|two|
    |longer|x|
  `;
  writeFileSync(file, original);
  const check = run(dir, '--only', 'format', 'example.feature');
  assert.notStrictEqual(check.status, 0);
  assert.match(check.stderr, /example\.feature:.*format/);
  assert.strictEqual(readFileSync(file, 'utf8'), original);
  const fix = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(fix.status, 0, fix.stderr);
  assert.match(fix.stdout, /example\.feature/);
  assert.strictEqual(readFileSync(file, 'utf8'), outdent`
    Feature: Sample

      Scenario: Example
        Given a table
          | one    | two |
          | longer | x   |
  `);
  const again = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(again.status, 0, again.stderr);
  assert.strictEqual(again.stdout, '');
});

test('tag layouts preserve inline explanations and can put each tag on its own line', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [format]
    format:
      tags: one-per-line
  `);
  writeFileSync(join(dir, 'example.feature'), outdent`
    @one @two # reason
    Feature: Example
      @skip # because of a bug
      @other
      Scenario: Example
        Given a step
  `);
  const fixed = run(dir, '--config', 'cuke.yml', '--fix', 'example.feature');
  assert.strictEqual(fixed.status, 0, fixed.stderr);
  assert.strictEqual(readFileSync(join(dir, 'example.feature'), 'utf8'), outdent`
    @one
    @two # reason
    Feature: Example

      @skip # because of a bug
      @other
      Scenario: Example
        Given a step
  `);
  assert.strictEqual(run(dir, '--config', 'cuke.yml', 'example.feature').status, 0);
});

test('preserves tag line breaks and explanations by default', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'example.feature'), outdent`
    @one @two
    @skip # reason
    Feature: Example
  `);
  const result = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(readFileSync(join(dir, 'example.feature'), 'utf8'), outdent`
    @one @two
    @skip # reason
    Feature: Example
  `);
});

test('normalizes description blank lines and preserves inline table comments', () => {
  const dir = workspace();
  const file = join(dir, 'example.feature');
  writeFileSync(file, outdent`
    Feature: Example
      words


      more
      Scenario: Example
        Given a table
          | a | b | # explanation
          | long | x |
  `);
  const result = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(readFileSync(file, 'utf8'), /words\n\n  more/);
  assert.match(readFileSync(file, 'utf8'), /\| a +\| b \| # explanation/);
});

test('preserves tag lines while normalizing spaces', () => {
  const dir = workspace();
  const file = join(dir, 'example.feature');
  writeFileSync(file, outdent`
    @one    @two # reason
    Feature: Example
  `);
  const result = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(readFileSync(file, 'utf8'), outdent`
    @one @two # reason
    Feature: Example
  `);
});

test('requires a blank line between the last step and Examples', () => {
  const dir = workspace();
  const file = join(dir, 'outline.feature');
  const source = outdent`
    Feature: Timetable

      Scenario Outline: Show departures
        Given a train <name>
        Examples:
          | name |
          | ICE  |
  `;
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
  const source = outdent`
    Feature:  Timetable

      Scenario:  Show the "red  signal"
        Given a train
  `;
  writeFileSync(file, source);
  const check = run(dir, '--only', 'format', 'outline.feature');
  assert.notStrictEqual(check.status, 0);
  assert.strictEqual(readFileSync(file, 'utf8'), source);
  const fixed = run(dir, '--only', 'format', '--fix', 'outline.feature');
  assert.strictEqual(fixed.status, 0, fixed.stderr);
  assert.strictEqual(readFileSync(file, 'utf8'), outdent`
    Feature: Timetable

      Scenario: Show the "red  signal"
        Given a train
  `);
  assert.strictEqual(run(dir, '--only', 'format', 'outline.feature').status, 0);
});

test('normalizes spacing and wraps prose and tags with configurable indentation', () => {
  const dir = workspace();
  const file = join(dir, 'sample.feature');
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [format]
    format:
      printWidth: 30
      tabWidth: 4
      useTabs: false
      tags: single-line
  `);
  writeFileSync(file, outdent`
    Feature: Example
      This  is a long description with many words to wrap.


      @first @second @third @fourth
      Scenario: Example
        Given   a train
  `);
  const fix = run(dir, '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.strictEqual(fix.status, 0, fix.stderr);
  assert.strictEqual(readFileSync(file, 'utf8'), outdent`
    Feature: Example
        This is a long description
        with many words to wrap.

        @first @second @third
        @fourth
        Scenario: Example
            Given a train
  `);
  assert.strictEqual(run(dir, '--config', 'cuke.yml', 'sample.feature').status, 0);
});

test('supports tabs for indentation', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [format]
    format:
      tabWidth: 4
      useTabs: true
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Example
      Scenario: Example
        Given a train
  `);
  const fix = run(dir, '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.strictEqual(fix.status, 0, fix.stderr);
  assert.strictEqual(readFileSync(join(dir, 'sample.feature'), 'utf8'), 'Feature: Example\n\n\tScenario: Example\n\t\tGiven a train\n');
});

test('preserves spacing inside quoted step arguments and docstrings', () => {
  const dir = workspace();
  const file = join(dir, 'quotes.feature');
  writeFileSync(file, outdent`
    Feature: Example

      Scenario: Example
        Given   "a  b" and 'c  d'
          """
          keep  this
          """
  `);
  const fix = run(dir, '--only', 'format', '--fix', 'quotes.feature');
  assert.strictEqual(fix.status, 0, fix.stderr);
  assert.strictEqual(readFileSync(file, 'utf8'), outdent`
    Feature: Example

      Scenario: Example
        Given "a  b" and 'c  d'
          """
          keep  this
          """
  `);
});

test('formats multiline quoted prose when changing indentation to tabs', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [format]
    format:
      useTabs: true
  `);
  const file = join(dir, 'sample.feature');
  const source = outdent`
    Feature: Display

      Scenario: Show a remark

        It shows "via
        Budapest" on the display.

        Given a train
  `;
  writeFileSync(file, source);
  const fix = run(dir, '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.strictEqual(fix.status, 0, fix.stderr);
  assert.match(readFileSync(file, 'utf8'), /"via\n\t\tBudapest"/u);
  assert.strictEqual(run(dir, '--config', 'cuke.yml', 'sample.feature').status, 0);
});

test('keeps punctuation attached to quoted prose while wrapping', () => {
  const dir = workspace();
  const file = join(dir, 'example.feature');
  const source = outdent`
    Feature: Example

      Scenario: Example

        The feature "Route band". See ("Cancellation").

        Given a train
  `;
  writeFileSync(file, source);
  const fixed = run(dir, '--only', 'format', '--fix', 'example.feature');
  assert.strictEqual(fixed.status, 0, fixed.stderr);
  assert.strictEqual(readFileSync(file, 'utf8'), source);
});

test('format command fixes files using Prettier settings when no Cuke configuration is selected', () => {
  const dir = workspace();
  const file = join(dir, 'example.feature');
  writeFileSync(join(dir, '.prettierrc.yml'), outdent`
    printWidth: 30
    tabWidth: 4
    useTabs: true
    semi: true
  `);
  writeFileSync(file, outdent`
    @one @two
    @three # reason
    Feature: Example
      A description that is long enough to wrap.
      Scenario: Example
        Given a train
  `);
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
  writeFileSync(join(dir, '.prettierrc.yml'), outdent`
    tabWidth: 8
    useTabs: true
  `);
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    format:
      tabWidth: 4
  `);
  writeFileSync(join(dir, 'example.feature'), outdent`
    Feature: Example
    Scenario: Example
    Given a train
  `);
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
