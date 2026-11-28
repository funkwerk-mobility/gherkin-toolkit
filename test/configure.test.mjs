import { test, assert } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { workspace } from './fixtures.mjs';

const cli = resolve('dist/cli.js');
const driver = resolve('test/terminal.py');
function environment(dir) { return { ...process.env, HOME: dir, XDG_CONFIG_HOME: join(dir, 'settings'), TERM: 'xterm' }; }
function cuke(dir, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', env: environment(dir) });
}
function wizard(dir, steps, ...args) {
  const result = spawnSync('python3', [driver], { input: JSON.stringify({ command: [process.execPath, cli, 'configure', ...args], cwd: dir, env: environment(dir), steps }), encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.deepEqual(response.remaining, [], response.output);
  return response;
}
const down = '\u001b[B';

test('skips spelling questions when spelling is deselected and remembers the configuration', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), '# Team settings\nchecks: [spell]\ndiagnostics:\n  limit: 17\n');
  const result = wizard(dir, [['Configuration file', '\r'], ['Checks to run by default', ' \r'], ['Step data tables have a header row?', '\r']]);
  assert.strictEqual(result.status, 0, result.output);
  assert.match(result.output, /Saved and selected configuration: cuke\.yml/);
  assert.notMatch(result.output, /Custom dictionary path|Specification language|spelling language overrides/);
  const yaml = readFileSync(join(dir, 'cuke.yml'), 'utf8');
  assert.match(yaml, /# Team settings/);
  assert.match(yaml, /limit: 17/);
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  assert.strictEqual(cuke(dir, 'check', 'sample.feature').status, 0);
  assert.match(cuke(dir, 'configure', '--show').stdout, /cuke\.yml/);
});

test('offers all overrides together and checks selected table values in two languages', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'cuke.yml'), 'dictionary: dictionary\nspell:\n  docStrings:\n    locale: en-GB\n');
  const result = wizard(dir, [
    ['Checks to run by default', '\r'],
    ['Step data tables have a header row?', '\r'],
    ['Custom dictionary path', '\r'],
    ['Specification language for English', '\r'],
    ['Which spelling language overrides', `${down}${down}${down}${down} \r`],
    ['Step data tables: languages', `${down}${down} \r`],
    ['Docstrings: languages', '\r'],
  ], '--config', 'cuke.yml');
  assert.strictEqual(result.status, 0, result.output);
  assert.notMatch(result.output, /Specification language for German|fix dictionary name/);
  // Terminal output contains ANSI escape sequences.
  // oxlint-disable-next-line eslint/no-control-regex
  const plain = result.output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  assert.match(plain, /Step data tables: languages\s*\n[^\n]*English \(United States\), German/);
  assert.match(plain, /> All tables/);
  assert.match(plain, /> > Step data tables/);
  assert.match(plain, /> > Examples tables/);
  assert.match(plain, /> Docstrings/);
  assert.notMatch(plain, /> > Step data tables: languages/);
  assert.match(readFileSync(join(dir, 'cuke.yml'), 'utf8'), /locale: en-GB/);
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given a station\n      | Bahnsteig | florple |\n');
  const checked = cuke(dir, 'check', '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.strictEqual(checked.status, 0, checked.stderr);
  assert.match(readFileSync(join(dir, 'dictionary', 'en.dic'), 'utf8'), /florple/);
});

test('the default dictionary is relative to the working directory even for a nested config', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'config'));
  mkdirSync(join(dir, 'spellchecker'));
  writeFileSync(join(dir, 'spellchecker', 'terms.dic'), 'florple\n');
  const configured = wizard(dir, [
    ['Checks to run by default', '\r'], ['Step data tables have a header row?', '\r'], ['Custom dictionary path', '\r'],
    ['Specification language for English', '\r'], ['Which spelling language overrides', '\r'],
  ], '--config', 'config/cuke.yml');
  assert.strictEqual(configured.status, 0, configured.output);
  assert.match(readFileSync(join(dir, 'config', 'cuke.yml'), 'utf8'), /\.\.\/spellchecker/);
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  assert.strictEqual(cuke(dir, 'check', 'sample.feature').status, 0);
});

test('the wizard records the step table header convention', () => {
  const dir = workspace();
  const result = wizard(dir, [
    ['Checks to run by default', '\r'], ['Step data tables have a header row?', '\u001b[D\r'],
    ['Custom dictionary path', '\r'], ['Specification language for English', '\r'],
    ['Which spelling language overrides', '\r'],
  ], '--config', 'cuke.yml');
  assert.strictEqual(result.status, 0, result.output);
  assert.strictEqual(parse(readFileSync(join(dir, 'cuke.yml'), 'utf8')).tables.stepHeader, true);
});

test('explicit config overrides remembered config and clear removes the selection', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'first.yml'), 'checks: []\n');
  writeFileSync(join(dir, 'second.yml'), 'checks: [spell]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  const configured = wizard(dir, [['Checks to run by default', '\r'], ['Step data tables have a header row?', '\r']], '--config', 'first.yml');
  assert.strictEqual(configured.status, 0, configured.output);
  assert.strictEqual(cuke(dir, 'check', 'sample.feature').status, 0);
  assert.notStrictEqual(cuke(dir, 'check', '--config', 'second.yml', 'sample.feature').status, 0);
  assert.strictEqual(cuke(dir, 'configure', '--clear').status, 0);
  assert.match(cuke(dir, 'configure', '--show').stdout, /No configuration selected/);
});

test('escape leaves the file and remembered configuration untouched', () => {
  const dir = workspace();
  writeFileSync(join(dir, '.cuke.yml'), 'checks: []\n');
  const result = wizard(dir, [['Checks to run by default', '\u001b']], '--config', '.cuke.yml');
  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(readFileSync(join(dir, '.cuke.yml'), 'utf8'), 'checks: []\n');
  assert.match(cuke(dir, 'configure', '--show').stdout, /No configuration selected/);
});
