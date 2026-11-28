import { test, assert } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, outdent } from './fixtures.mjs';

test('checks French and Norwegian feature languages using their dictionaries', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'fr.feature'), outdent`
    # language: fr
    Fonctionnalité: Bonjour
      Scénario: Compte
        Soit un compte
  `);
  writeFileSync(join(dir, 'no.feature'), outdent`
    # language: no
    Egenskap: Konto
      Scenario: Konto
        Gitt en konto
  `);
  const result = run(dir, '--only', 'spell', 'fr.feature', 'no.feature');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('checks Luxembourgish inflections and combines languages without leaking custom words', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'dictionary', 'lb.dic'), outdent`
    florple
    !Moien
  `);
  writeFileSync(join(dir, 'cuke.yml'), outdent`
    dictionary: dictionary
    spell:
      quotes:
        locales: [en, lb]
  `);
  writeFileSync(join(dir, 'sample.feature'), outdent`
    Feature: Account
      Scenario: Account
        Given "Garen Zich florple Moien"
        And florple
  `);
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
  writeFileSync(join(dir, 'sample.feature'), outdent`
    @spell.quotes=no
    Feature: Account
      Scenario: Account
        Given "florple quabble"
        And florple
  `);
  const result = run(dir, '--only', 'spell', '--dictionary', 'dictionary', 'sample.feature');
  assert.match(result.stderr, /sample\.feature:5:9:.*florple/);
  assert.notMatch(result.stderr, /sample\.feature:4:/);
});

test('discovers another Hunspell dictionary from dependencies without language-specific code', async () => {
  const { cpSync, readFileSync, symlinkSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { resolve } = await import('node:path');
  const dir = workspace();
  cpSync(resolve('dist'), join(dir, 'dist'), { recursive: true });
  mkdirSync(join(dir, 'node_modules'));
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  packageJson.dependencies['dictionary-zz'] = '1.0.0';
  writeFileSync(join(dir, 'package.json'), JSON.stringify(packageJson));
  for (const entry of ['@cucumber', '@cspell', 'cspell-lib', 'yaml', 'nspell', '@clack']) {
    symlinkSync(resolve('node_modules', entry), join(dir, 'node_modules', entry), 'dir');
  }
  const fake = join(dir, 'node_modules', 'dictionary-zz');
  mkdirSync(fake);
  writeFileSync(join(fake, 'package.json'), JSON.stringify({ name: 'dictionary-zz', type: 'module', exports: './index.js' }));
  writeFileSync(join(fake, 'index.js'), "export default { aff: Buffer.from('SET UTF-8\\n'), dic: Buffer.from('1\\nflorple\\n') };\n");
  writeFileSync(join(dir, 'example.feature'), outdent`
    @spell.quotes=zz
    Feature: Example
      Scenario: Example
        Given "florple"
  `);
  const result = spawnSync(process.execPath, [join(dir, 'dist/cli.js'), 'check', 'example.feature'], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: dir, XDG_CONFIG_HOME: join(dir, 'settings') } });
  assert.strictEqual(result.status, 0, result.stderr);
});
