import { test, assert } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';

test('checks French and Norwegian feature languages using their dictionaries', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'fr.feature'), '# language: fr\nFonctionnalité: Bonjour\n  Scénario: Compte\n    Soit un compte\n');
  writeFileSync(join(dir, 'no.feature'), '# language: no\nEgenskap: Konto\n  Scenario: Konto\n    Gitt en konto\n');
  const result = run(dir, '--only', 'spell', 'fr.feature', 'no.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('checks Luxembourgish inflections and combines languages without leaking custom words', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'lb.dic'), 'florple\n!Moien\n');
  writeFileSync(join(dir, 'cuke.yml'), 'dictionary: dictionary\nspell:\n  quotes:\n    locales: [en, lb]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Account\n    Given "Garen Zich florple Moien"\n    And florple\n');
  const result = run(dir, '--only', 'spell', '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /forbidden word: Moien/);
  assert.match(result.stderr, /sample\.feature:4:9:.*florple/);
  assert.notMatch(result.stderr, /unknown word: (Garen|Zich)/);
  assert.notMatch(result.stderr, /sample\.feature:3:.*florple/);
});

test('Norwegian aliases select both no and nb custom dictionaries without sharing them', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'no.dic'), 'florple\n');
  writeFileSync(join(dir, 'dictionary', 'nb.dic'), 'quabble\n');
  writeFileSync(join(dir, 'sample.feature'), '@spell.quotes=no\nFeature: Account\n  Scenario: Account\n    Given "florple quabble"\n    And florple\n');
  const result = run(dir, '--only', 'spell', '--dictionary', 'dictionary', 'sample.feature');
  assert.match(result.stderr, /sample\.feature:5:9:.*florple/);
  assert.notMatch(result.stderr, /sample\.feature:4:/);
});
