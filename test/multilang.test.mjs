import { test, assert } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run } from './fixtures.mjs';

test('step table headers use the specification language when the table convention is enabled', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'en.dic'), 'florple\n');
  writeFileSync(join(dir, 'cuke.yml'), 'dictionary: dictionary\ntables:\n  stepHeader: true\nspell:\n  dataTables:\n    locale: de-DE\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given the stations\n      | florple | Bahnsteig |\n      | Bahnsteig | florple |\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:4:19:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:5:21:.*florple/);
  assert.notMatch(result.stderr, /sample\.feature:4:9:|sample\.feature:5:9:/);
});

test('the step table header convention is inherited and can be disabled', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'base.yml'), 'tables:\n  stepHeader: true\nspell:\n  dataTables:\n    locale: de-DE\n');
  writeFileSync(join(dir, 'child.yml'), 'extends: base.yml\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given the stations\n      | Bahnsteig |\n');
  assert.match(run(dir, '--config', 'child.yml', 'sample.feature').stderr, /Bahnsteig/);
  writeFileSync(join(dir, 'child.yml'), 'extends: base.yml\ntables:\n  stepHeader: false\n');
  assert.strictEqual(run(dir, '--config', 'child.yml', 'sample.feature').status, 0);
});

test('multiple content locales accept both languages without affecting specification or prose', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\nspell:\n  content:\n    locales: [en-US, de-DE]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Bahnsteig\n  Scenario: Transfer\n    Given Bahnsteig\n      | train | Bahnsteig |\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:2:3:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:4:11:.*Bahnsteig/);
  assert.notMatch(result.stderr, /sample\.feature:5:/);
});

test('checks quoted content separately, preserves locations and contractions', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\nspell:\n  content:\n    locales: [en-US, de-DE]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given Bahnsteig and "Bahnsteig \\"Halt\\" quabble" and doesn’t fail\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:11:.*Bahnsteig/);
  assert.strictEqual((result.stderr.match(/Bahnsteig/g) ?? []).length, 1);
  assert.match(result.stderr, /sample\.feature:3:45:.*quabble/);
  assert.notMatch(result.stderr, /doesn’t|Halt/);
});

test('feature and scenario locale overrides replace broader lists without leaking', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\nspell:\n  content:\n    locales: [de-DE]\n  tables:\n    locales: [en-US]\n');
  writeFileSync(join(dir, 'sample.feature'), '@spell-content=en-US,de-DE\nFeature: Account\n  Scenario: First\n    Given a transfer\n      | Bahnsteig |\n  @spell-dataTables=en-US\n  Scenario: Second\n    Given a transfer\n      | Bahnsteig |\n  Scenario: Third\n    Given a transfer\n      | Bahnsteig |\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:9:9:.*Bahnsteig/);
  assert.notMatch(result.stderr, /sample\.feature:(5|12):/);
});

test('locale word lists are isolated between content and specification', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'de.dic'), 'quabble\n');
  writeFileSync(join(dir, 'dictionary', 'terms.dic'), 'wibbleton\n');
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\ndictionary: dictionary\nspell:\n  content:\n    locales: [en-US, de-DE]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given quabble and wibbleton and "quabble wibbleton"\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:11:.*quabble/);
  assert.strictEqual((result.stderr.match(/quabble/g) ?? []).length, 1);
  assert.notMatch(result.stderr, /wibbleton/);
});

test('specification mapping controls titles and Examples headers while prose has an independent override', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\nspell:\n  specification:\n    en: en-GB\n  prose:\n    locales: [en-US, de-DE]\n  content:\n    locales: [en-US, de-DE]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Colour\n  The Bahnsteig is open\n  Scenario Outline: Colour\n    Given a colour\n    Examples: Values\n      | colour |\n      | Bahnsteig |\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('rejects a specification mapping with multiple locales', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'spell:\n  specification:\n    en: [en-US, de-DE]\n');
  const result = run(dir, '--config', 'cuke.yml');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /specification.*single locales/);
});

test('specific policies override content and quotes inside tables keep the table policy', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\nspell:\n  content:\n    locales: [en-US, de-DE]\n  quotes:\n    locales: [en-US]\n  tables:\n    locales: [de-DE]\n  dataTables:\n    locales: [en-US]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario Outline: Transfer\n    Given "Bahnsteig"\n      | "Bahnsteig" |\n    Examples: Values\n      | item |\n      | Bahnsteig |\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:12:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:4:10:.*Bahnsteig/);
  assert.notMatch(result.stderr, /sample\.feature:7:/);
});

test('prose overrides do not alter titles or quoted content', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\nspell:\n  prose:\n    locales: [en-US, de-DE]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Bahnsteig\n  The Bahnsteig is open and "Bahnsteig"\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:1:10:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:2:30:.*Bahnsteig/);
  assert.strictEqual((result.stderr.match(/Bahnsteig/g) ?? []).length, 2);
});

test('invalid region locale lists and scoped tag locales are rejected', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'spell:\n  content:\n    locales: []\n');
  const config = run(dir, '--config', 'cuke.yml');
  assert.notStrictEqual(config.status, 0);
  assert.match(config.stderr, /nonempty list/);
  writeFileSync(join(dir, 'sample.feature'), '@spell-content=de-DE,xx-ZZ\nFeature: Account\n');
  const tag = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(tag.status, 0);
  assert.match(tag.stderr, /sample\.feature:1:1:.*invalid spelling locales/);
});

test('obsolete text overrides are rejected', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'spell:\n  text:\n    locale: en-GB\n');
  const config = run(dir, '--config', 'cuke.yml');
  assert.notStrictEqual(config.status, 0);
  assert.match(config.stderr, /unknown spell setting: text/);
  writeFileSync(join(dir, 'sample.feature'), '@spell-text=en-GB\nFeature: Account\n');
  const tag = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(tag.status, 0);
  assert.match(tag.stderr, /sample\.feature:1:1:.*unsupported spelling option/);
});

test('quoted prose can span lines and retains source locations', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\nspell:\n  content:\n    locales: [en-US, de-DE]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Display "Bahnsteig\n  und Haltestelle quabble"\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:19:.*quabble/);
  assert.notMatch(result.stderr, /Bahnsteig|Haltestelle|\bund\b/);
});

test('titles check quoted values as content and surrounding words as specification', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), 'checks: [spell]\nspell:\n  content:\n    locales: [en-US, de-DE]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: "Hinweis" acount\n  Scenario: Show "Leerfahrt" on acount\n    Given a transfer\n');
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:1:20:.*acount/);
  assert.match(result.stderr, /sample\.feature:2:33:.*acount/);
  assert.notMatch(result.stderr, /Hinweis|Leerfahrt/);
});
