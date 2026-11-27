import { test, assert } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';


test('a product check list replaces the inherited list', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'product'));
  writeFileSync(join(dir, 'shared.yml'), 'checks: [syntax]\n');
  writeFileSync(join(dir, 'product', 'cuke.yml'), 'extends: ../shared.yml\nchecks: []\n');
  writeFileSync(join(dir, 'bad.feature'), '# language: unknown\nFeature: Bad\n');
  const result = run(dir, '--config', 'product/cuke.yml', 'bad.feature');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(result.stdout, '');
  assert.strictEqual(result.stderr, '');
});

test('--only runs syntax even when the selected configuration disables it', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: []\n');
  writeFileSync(join(dir, 'bad.feature'), '# language: unknown\nFeature: Bad\n');
  const result = run(dir, '--config', 'cuke.yml', '--only', 'syntax', 'bad.feature');
  assert.notStrictEqual(result.status, 0);
  assert.ok(result.stderr.includes('bad.feature:1:1:'), result.stderr);
});

test('invalid configurations and options fail with a useful error', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'invalid.yml'), 'checks: [nonsense]\n');
  const invalid = run(dir, '--config', 'invalid.yml');
  assert.notStrictEqual(invalid.status, 0);
  assert.match(invalid.stderr, /invalid\.yml.*nonsense/);
  const missing = run(dir, '--only');
  assert.notStrictEqual(missing.status, 0);
  assert.match(missing.stderr, /--only requires a value/);
});

test('cyclic configuration inheritance fails instead of recursing indefinitely', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'a.yml'), 'extends: b.yml\n');
  writeFileSync(join(dir, 'b.yml'), 'extends: a.yml\n');
  const result = run(dir, '--config', 'a.yml');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /circular/i);
});

test('inherits checks through paths relative to each configuration file', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'shared'));
  mkdirSync(join(dir, 'product'));
  writeFileSync(join(dir, 'base.yml'), 'checks: [syntax]\n');
  writeFileSync(join(dir, 'shared', 'team.yml'), 'extends: ../base.yml\n');
  writeFileSync(join(dir, 'product', 'product.yml'), 'extends: ../shared/team.yml\n');
  writeFileSync(join(dir, 'bad.feature'), '# language: unknown\nFeature: Bad\n');
  const result = run(dir, '--config', 'product/product.yml', 'bad.feature');
  assert.notStrictEqual(result.status, 0);
  assert.ok(result.stderr.includes('bad.feature:1:1:'));
});

test('malformed YAML is reported even without feature files', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'bad.yml'), 'checks: [syntax\n');
  const result = run(dir, '--config', 'bad.yml');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /bad\.yml.*invalid YAML/);
});
