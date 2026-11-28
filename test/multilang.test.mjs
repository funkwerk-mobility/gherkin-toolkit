import { test, assert } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, outdent } from './fixtures.mjs';

test('step table headers use the specification language when the table convention is enabled', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'en.dic'), 'florple\n');
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    dictionary: dictionary
    tables:
      stepHeader: true
    spell:
      dataTables:
        locale: de-DE
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given the stations
          | florple | Bahnsteig |
          | Bahnsteig | florple |
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:4:19:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:5:21:.*florple/);
  assert.notMatch(result.stderr, /sample\.feature:4:9:|sample\.feature:5:9:/);
});

test('the step table header convention is inherited and can be disabled', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'base.yml'), outdent`
    tables:
      stepHeader: true
    spell:
      dataTables:
        locale: de-DE
  `);
  writeFileSync(join(dir, 'child.yml'), 'extends: base.yml\n');
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given the stations
          | Bahnsteig |
  `);
  assert.match(run(dir, '--config', 'child.yml', 'sample.feature').stderr, /Bahnsteig/);
  writeFileSync(join(dir, 'child.yml'), outdent`
    extends: base.yml
    tables:
      stepHeader: false
  `);
  assert.strictEqual(run(dir, '--config', 'child.yml', 'sample.feature').status, 0);
});

test('multiple content locales accept both languages without affecting specification or prose', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    spell:
      content:
        locales: [en-US, de-DE]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Bahnsteig
      Scenario: Transfer
        Given Bahnsteig
          | train | Bahnsteig |
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:2:3:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:4:11:.*Bahnsteig/);
  assert.notMatch(result.stderr, /sample\.feature:5:/);
});

test('checks quoted content separately, preserves locations and contractions', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    spell:
      content:
        locales: [en-US, de-DE]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given Bahnsteig and "Bahnsteig \\"Halt\\" quabble" and doesn’t fail
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:11:.*Bahnsteig/);
  assert.strictEqual((result.stderr.match(/Bahnsteig/g) ?? []).length, 1);
  assert.match(result.stderr, /sample\.feature:3:45:.*quabble/);
  assert.notMatch(result.stderr, /doesn’t|Halt/);
});

test('feature and scenario locale overrides replace broader lists without leaking', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    spell:
      content:
        locales: [de-DE]
      tables:
        locales: [en-US]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell-content=en-US,de-DE
    Feature: Account
      Scenario: First
        Given a transfer
          | Bahnsteig |
      @spell-dataTables=en-US
      Scenario: Second
        Given a transfer
          | Bahnsteig |
      Scenario: Third
        Given a transfer
          | Bahnsteig |
  `);
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
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    dictionary: dictionary
    spell:
      content:
        locales: [en-US, de-DE]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Transfer
        Given quabble and wibbleton and "quabble wibbleton"
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:11:.*quabble/);
  assert.strictEqual((result.stderr.match(/quabble/g) ?? []).length, 1);
  assert.notMatch(result.stderr, /wibbleton/);
});

test('specification mapping controls titles and Examples headers while prose has an independent override', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    spell:
      specification:
        en: en-GB
      prose:
        locales: [en-US, de-DE]
      content:
        locales: [en-US, de-DE]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Colour
      The Bahnsteig is open
      Scenario Outline: Colour
        Given a colour
        Examples: Values
          | colour |
          | Bahnsteig |
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('rejects a specification mapping with multiple locales', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    spell:
      specification:
        en: [en-US, de-DE]
  `);
  const result = run(dir, '--config', 'cuke.yml');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /specification.*single locales/);
});

test('specific policies override content and quotes inside tables keep the table policy', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    spell:
      content:
        locales: [en-US, de-DE]
      quotes:
        locales: [en-US]
      tables:
        locales: [de-DE]
      dataTables:
        locales: [en-US]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario Outline: Transfer
        Given "Bahnsteig"
          | "Bahnsteig" |
        Examples: Values
          | item |
          | Bahnsteig |
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:12:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:4:10:.*Bahnsteig/);
  assert.notMatch(result.stderr, /sample\.feature:7:/);
});

test('prose overrides do not alter titles or quoted content', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    spell:
      prose:
        locales: [en-US, de-DE]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Bahnsteig
      The Bahnsteig is open and "Bahnsteig"
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:1:10:.*Bahnsteig/);
  assert.match(result.stderr, /sample\.feature:2:30:.*Bahnsteig/);
  assert.strictEqual((result.stderr.match(/Bahnsteig/g) ?? []).length, 2);
});

test('invalid region locale lists and scoped tag locales are rejected', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    spell:
      content:
        locales: []
  `);
  const config = run(dir, '--config', 'cuke.yml');
  assert.notStrictEqual(config.status, 0);
  assert.match(config.stderr, /nonempty list/);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell-content=de-DE,xx-ZZ
    Feature: Account
  `);
  const tag = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(tag.status, 0);
  assert.match(tag.stderr, /sample\.feature:1:1:.*invalid spelling locales/);
});

test('obsolete text overrides are rejected', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    spell:
      text:
        locale: en-GB
  `);
  const config = run(dir, '--config', 'cuke.yml');
  assert.notStrictEqual(config.status, 0);
  assert.match(config.stderr, /unknown spell setting: text/);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell-text=en-GB
    Feature: Account
  `);
  const tag = run(dir, '--only', 'spell', 'sample.feature');
  assert.notStrictEqual(tag.status, 0);
  assert.match(tag.stderr, /sample\.feature:1:1:.*unsupported spelling option/);
});

test('quoted prose can span lines and retains source locations', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    spell:
      content:
        locales: [en-US, de-DE]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Display "Bahnsteig
      und Haltestelle quabble"
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:3:19:.*quabble/);
  assert.notMatch(result.stderr, /Bahnsteig|Haltestelle|\bund\b/);
});

test('titles check quoted values as content and surrounding words as specification', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    checks: [spell]
    spell:
      content:
        locales: [en-US, de-DE]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: "Hinweis" acount
      Scenario: Show "Leerfahrt" on acount
        Given a transfer
  `);
  const result = run(dir, '--config', 'cuke.yml', 'sample.feature');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /sample\.feature:1:20:.*acount/);
  assert.match(result.stderr, /sample\.feature:2:33:.*acount/);
  assert.notMatch(result.stderr, /Hinweis|Leerfahrt/);
});
