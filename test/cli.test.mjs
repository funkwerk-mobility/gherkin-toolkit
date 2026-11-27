import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli.js');
test('check accepts a valid feature silently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-'));
  try {
    const file = join(dir, 'valid.feature');
    writeFileSync(file, 'Feature: A valid feature\n  Scenario: A scenario\n    Given a step\n');
    const result = spawnSync(process.execPath, [cli, 'check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('check discovers nested features once and reports all parse errors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-'));
  try {
    const nested = join(dir, 'nested');
    mkdirSync(nested);
    const first = join(dir, 'first.feature');
    const second = join(nested, 'second.feature');
    writeFileSync(first, 'Feature: Bad\n  Scenario: Bad\n    Given one\n      | a | b |\n      | x |\n');
    writeFileSync(second, 'Feature: Bad\n  Scenario: Bad\n    Given one\n      | a | b |\n      | x |\n');
    writeFileSync(join(nested, 'ignored.txt'), 'not a feature');
    const result = spawnSync(process.execPath, [cli, 'check', dir, first], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(`${first}:5:7:`));
    assert.ok(result.stderr.includes(`${second}:5:7:`));
    assert.equal(result.stderr.split(first).length - 1, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('check with no inputs succeeds silently', () => {
  const result = spawnSync(process.execPath, [cli, 'check'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('missing inputs fail without preventing other files from being checked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-'));
  try {
    const bad = join(dir, 'bad.feature');
    const missing = join(dir, 'missing.feature');
    writeFileSync(bad, '# language: unknown\nFeature: Bad\n');
    const result = spawnSync(process.execPath, [cli, 'check', missing, bad], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(missing));
    assert.ok(result.stderr.includes(`${bad}:1:1:`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
