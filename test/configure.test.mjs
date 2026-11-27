import { test, assert } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

test('selects checks and remembers a configuration while preserving other settings', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), '# Team settings\nchecks: [spell]\ndiagnostics:\n  limit: 17\n');
  const result = wizard(dir, [
    ['Configuration file', '\r'],
    ['What would you like to configure?', ' \r'],
    ['Checks to run by default', ' \r'],
    ['Remember this configuration', '\u001b[D\r'],
  ]);
  assert.strictEqual(result.status, 0, result.output);
  const yaml = readFileSync(join(dir, 'cuke.yml'), 'utf8');
  assert.match(yaml, /# Team settings/);
  assert.match(yaml, /limit: 17/);
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  assert.strictEqual(cuke(dir, 'check', 'sample.feature').status, 0);
  assert.match(cuke(dir, 'configure', '--show').stdout, /cuke\.yml/);
});

test('selects a region and languages while preserving unrelated spelling policies', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'cuke.yml'), 'dictionary: dictionary\nspelling:\n  docStrings:\n    locale: en-GB\n');
  const result = wizard(dir, [
    ['What would you like to configure?', `${down}${down}${down} \r`],
    ['Which spelling regions', `${down}${down}${down} \r`],
    ['tables: language policy', `${down}\r`],
    ['tables: languages', ` ${down}${down} \r`],
    ['tables: fix dictionary name', 'places\r'],
    ['Remember this configuration', `${down}\r`],
  ], '--config', 'cuke.yml');
  assert.strictEqual(result.status, 0, result.output);
  const yaml = readFileSync(join(dir, 'cuke.yml'), 'utf8');
  assert.match(yaml, /locale: en-GB/);
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given a station\n      | Bahnsteig | florple |\n');
  const checked = cuke(dir, 'check', '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.strictEqual(checked.status, 0, checked.stderr);
  assert.match(readFileSync(join(dir, 'dictionary', 'places.dic'), 'utf8'), /florple/);
});

test('explicit config overrides remembered config and clear removes the selection', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'first.yml'), 'checks: []\n');
  writeFileSync(join(dir, 'second.yml'), 'checks: [spell]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  const configured = wizard(dir, [['What would you like to configure?', '\r'], ['Remember this configuration', '\u001b[D\r']], '--config', 'first.yml');
  assert.strictEqual(configured.status, 0, configured.output);
  assert.strictEqual(cuke(dir, 'check', 'sample.feature').status, 0);
  assert.notStrictEqual(cuke(dir, 'check', '--config', 'second.yml', 'sample.feature').status, 0);
  assert.strictEqual(cuke(dir, 'configure', '--clear').status, 0);
  assert.match(cuke(dir, 'configure', '--show').stdout, /No configuration selected/);
  assert.notStrictEqual(cuke(dir, 'check', 'sample.feature').status, 0);
});

test('does not activate a home file implicitly and leaves files untouched when cancelled', () => {
  const dir = workspace();
  writeFileSync(join(dir, '.cuke.yml'), 'checks: []\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  assert.notStrictEqual(cuke(dir, 'check', 'sample.feature').status, 0);
  const result = wizard(dir, [['Configuration file', '$HOME/.cuke.yml\r'], ['What would you like to configure?', '\u0003']]);
  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(readFileSync(join(dir, '.cuke.yml'), 'utf8'), 'checks: []\n');
  assert.match(cuke(dir, 'configure', '--show').stdout, /No configuration selected/);
});
