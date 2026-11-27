import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli.js');

test('a product check list replaces the inherited list', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-config-'));
  try {
    mkdirSync(join(dir, 'product'));
    writeFileSync(join(dir, 'shared.yml'), 'checks: [syntax]\n');
    writeFileSync(join(dir, 'product', 'cuke.yml'), 'extends: ../shared.yml\nchecks: []\n');
    writeFileSync(join(dir, 'bad.feature'), '# language: unknown\nFeature: Bad\n');
    const result = spawnSync(process.execPath, [cli, 'check', '--config', 'product/cuke.yml', 'bad.feature'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--only runs syntax even when the selected configuration disables it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-config-'));
  try {
    writeFileSync(join(dir, 'cuke.yml'), 'checks: []\n');
    writeFileSync(join(dir, 'bad.feature'), '# language: unknown\nFeature: Bad\n');
    const result = spawnSync(process.execPath, [cli, 'check', '--config', 'cuke.yml', '--only', 'syntax', 'bad.feature'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('bad.feature:1:1:'), result.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('invalid configurations and options fail with a useful error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-config-'));
  try {
    writeFileSync(join(dir, 'invalid.yml'), 'checks: [nonsense]\n');
    const invalid = spawnSync(process.execPath, [cli, 'check', '--config', 'invalid.yml'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /invalid\.yml.*nonsense/);
    const missing = spawnSync(process.execPath, [cli, 'check', '--only'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /--only requires a value/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cyclic configuration inheritance fails instead of recursing indefinitely', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-config-'));
  try {
    writeFileSync(join(dir, 'a.yml'), 'extends: b.yml\n');
    writeFileSync(join(dir, 'b.yml'), 'extends: a.yml\n');
    const result = spawnSync(process.execPath, [cli, 'check', '--config', 'a.yml'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /circular/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inherits checks through paths relative to each configuration file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-config-'));
  try {
    mkdirSync(join(dir, 'shared'));
    mkdirSync(join(dir, 'product'));
    writeFileSync(join(dir, 'base.yml'), 'checks: [syntax]\n');
    writeFileSync(join(dir, 'shared', 'team.yml'), 'extends: ../base.yml\n');
    writeFileSync(join(dir, 'product', 'product.yml'), 'extends: ../shared/team.yml\n');
    writeFileSync(join(dir, 'bad.feature'), '# language: unknown\nFeature: Bad\n');
    const result = spawnSync(process.execPath, [cli, 'check', '--config', 'product/product.yml', 'bad.feature'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('bad.feature:1:1:'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('malformed YAML is reported even without feature files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-config-'));
  try {
    writeFileSync(join(dir, 'bad.yml'), 'checks: [syntax\n');
    const result = spawnSync(process.execPath, [cli, 'check', '--config', 'bad.yml'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /bad\.yml.*invalid YAML/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
