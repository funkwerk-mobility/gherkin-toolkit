import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli.js');
function run(dir, ...args) {
  return spawnSync(process.execPath, [cli, 'check', ...args], { cwd: dir, encoding: 'utf8' });
}

test('reports spelling mistakes in prose and steps with precise locations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-spell-'));
  try {
    writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  An acount holds funds.\n  Scenario: Transfer\n    Given the acount is open\n');
    const result = run(dir, '--only', 'spell', 'sample.feature');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sample\.feature:2:6:.*acount/);
    assert.match(result.stderr, /sample\.feature:4:15:.*acount/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a product dictionary selected on the command line accepts its words', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-spell-'));
  try {
    mkdirSync(join(dir, 'dictionaries'));
    writeFileSync(join(dir, 'dictionaries', 'en-US.dic'), '# Project words\nflorple\n');
    writeFileSync(join(dir, 'dictionaries', 'en-GB.dic'), 'acount\n');
    writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given florple and acount\n');
    const result = run(dir, '--only', 'spell', '--dictionary', 'dictionaries', 'sample.feature');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /acount/);
    assert.doesNotMatch(result.stderr, /florple/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('splits identifiers and numbers while treating contractions as whole words', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-spell-'));
  try {
    writeFileSync(join(dir, 'sample.feature'), "Feature: Account\n  Scenario: Transfer\n    Given customerAccount has 123 orders and doesn't fail\n    And customerAcount doesn’t pass\n    And doesn fail\n");
    const result = run(dir, '--only', 'spell', 'sample.feature');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sample\.feature:4:17:.*Acount/);
    assert.match(result.stderr, /sample\.feature:5:9:.*doesn/);
    assert.doesNotMatch(result.stderr, /doesn’t|doesn't|customerAccount|123/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('configuration dictionary paths follow their declaring file and CLI overrides them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-spell-'));
  try {
    mkdirSync(join(dir, 'shared'));
    mkdirSync(join(dir, 'product'));
    mkdirSync(join(dir, 'other'));
    writeFileSync(join(dir, 'shared', 'en-US.dic'), 'florple\n');
    writeFileSync(join(dir, 'other', 'en-US.dic'), 'quabble\n');
    writeFileSync(join(dir, 'shared', 'common.yml'), 'dictionary: .\nchecks: [spell]\n');
    writeFileSync(join(dir, 'product', 'cuke.yml'), 'extends: ../shared/common.yml\n');
    writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given florple\n');
    const inherited = run(dir, '--config', 'product/cuke.yml', 'sample.feature');
    assert.equal(inherited.status, 0, inherited.stderr);
    const overridden = run(dir, '--config', 'product/cuke.yml', '--dictionary', 'other', 'sample.feature');
    assert.notEqual(overridden.status, 0);
    assert.match(overridden.stderr, /florple/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a feature in an unsupported language does not silently use English', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-spell-'));
  try {
    writeFileSync(join(dir, 'de.feature'), '# language: de\nFunktionalität: Konto\n');
    const result = run(dir, '--only', 'spell', 'de.feature');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /de\.feature.*unsupported.*de/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rejects malformed contractions instead of accepting their fragments', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-spell-'));
  try {
    writeFileSync(join(dir, 'sample.feature'), "Feature: Account\n  Scenario: Transfer\n    Given the user do'nt and does’n pass\n");
    const result = run(dir, '--only', 'spell', 'sample.feature');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sample\.feature:3:20:.*do'nt/);
    assert.match(result.stderr, /sample\.feature:3:30:.*does’n/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('reports descriptions after comments at the description line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-spell-'));
  try {
    writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  # acount\n  acount\n');
    const result = run(dir, '--only', 'spell', 'sample.feature');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sample\.feature:3:3:.*acount/);
    assert.doesNotMatch(result.stderr, /sample\.feature:2:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('checks Examples titles and descriptions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-spell-'));
  try {
    writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario Outline: Transfer\n    Given a transfer\n    Examples: acount\n      An acount description\n      | amount |\n      | 1 |\n');
    const result = run(dir, '--only', 'spell', 'sample.feature');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sample\.feature:4:15:.*acount/);
    assert.match(result.stderr, /sample\.feature:5:10:.*acount/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
