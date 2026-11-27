import { test, assert } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { workspace } from './fixtures.mjs';

const cli = resolve('dist/cli.js');
function cuke(dir, input, ...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: dir, input, encoding: 'utf8', env: { ...process.env, HOME: dir, XDG_CONFIG_HOME: join(dir, 'settings') },
  });
}

test('configures spelling while preserving other settings and remembers the selection', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'cuke.yml'), '# Team settings\nchecks: [spell]\ndiagnostics:\n  limit: 17\nspelling:\n  docStrings:\n    locale: en-GB\n');
  const configured = cuke(dir, 'cuke.yml\n\ndictionary\n\n\nen-US,de-DE\nn\ny\n', 'configure');
  assert.strictEqual(configured.status, 0, configured.stderr);
  const yaml = readFileSync(join(dir, 'cuke.yml'), 'utf8');
  assert.match(yaml, /# Team settings/);
  assert.match(yaml, /limit: 17/);
  assert.match(yaml, /locale: en-GB/);
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given "Bahnsteig"\n');
  const checked = cuke(dir, '', 'check', 'sample.feature');
  assert.strictEqual(checked.status, 0, checked.stderr);
  const shown = cuke(dir, '', 'configure', '--show');
  assert.match(shown.stdout, /cuke\.yml/);
});

test('a remembered configuration is overridden explicitly, can be changed, and cleared', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'first.yml'), 'checks: []\n');
  writeFileSync(join(dir, 'second.yml'), 'checks: [spell]\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  assert.strictEqual(cuke(dir, '\n\n\n\n\nn\ny\n', 'configure', '--config', 'first.yml').status, 0);
  assert.strictEqual(cuke(dir, '', 'check', 'sample.feature').status, 0);
  assert.notStrictEqual(cuke(dir, '', 'check', '--config', 'second.yml', 'sample.feature').status, 0);
  assert.strictEqual(cuke(dir, '\n\n\n\n\nn\ny\n', 'configure', '--config', 'second.yml').status, 0);
  assert.match(cuke(dir, '', 'configure', '--show').stdout, /second\.yml/);
  assert.notStrictEqual(cuke(dir, '', 'check', 'sample.feature').status, 0);
  assert.strictEqual(cuke(dir, '', 'configure', '--clear').status, 0);
  assert.match(cuke(dir, '', 'configure', '--show').stdout, /No configuration selected/);
});

test('a home configuration is not selected implicitly', () => {
  const dir = workspace();
  writeFileSync(join(dir, '.cuke.yml'), 'checks: []\n');
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  assert.notStrictEqual(cuke(dir, '', 'check', 'sample.feature').status, 0);
  assert.strictEqual(cuke(dir, '$HOME/.cuke.yml\n\n\n\n\n\nn\ny\n', 'configure').status, 0);
  assert.strictEqual(cuke(dir, '', 'check', 'sample.feature').status, 0);
});

test('cancelling or entering an invalid locale leaves the file unchanged', () => {
  const dir = workspace();
  const original = 'checks: [spell]\n';
  writeFileSync(join(dir, 'cuke.yml'), original);
  assert.notStrictEqual(cuke(dir, 'cuke.yml\n', 'configure').status, 0);
  assert.notStrictEqual(cuke(dir, 'cuke.yml\n\n\ninvalid\n\n\nn\n', 'configure').status, 0);
  assert.strictEqual(readFileSync(join(dir, 'cuke.yml'), 'utf8'), original);
});

test('configures a region language and fix destination without changing other policies', () => {
  const dir = workspace();
  mkdirSync(join(dir, 'dictionary'));
  writeFileSync(join(dir, 'cuke.yml'), 'dictionary: dictionary\nspelling:\n  tables:\n    locale: en-US\n  docStrings:\n    locale: en-GB\n');
  const answers = ['cuke.yml', '', '', '', '', '', 'y', '', '', '', '', 'de-DE', 'places', '', '', '', '', '', '', '', 'n'];
  const configured = cuke(dir, `${answers.join('\n')}\n`, 'configure');
  assert.strictEqual(configured.status, 0, configured.stderr);
  writeFileSync(join(dir, 'sample.feature'), 'Feature: Account\n  Scenario: Transfer\n    Given a station\n      | Bahnsteig | florple |\n');
  const checked = cuke(dir, '', 'check', '--config', 'cuke.yml', '--fix', 'sample.feature');
  assert.strictEqual(checked.status, 0, checked.stderr);
  assert.match(readFileSync(join(dir, 'dictionary', 'places.dic'), 'utf8'), /florple/);
  assert.match(readFileSync(join(dir, 'cuke.yml'), 'utf8'), /locale: en-GB/);
});

test('configures a comment-only file and can disable the default spell check', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'cuke.yml'), '# Team settings\n');
  const configured = cuke(dir, 'cuke.yml\nn\n\n\n\n\nn\ny\n', 'configure');
  assert.strictEqual(configured.status, 0, configured.stderr);
  assert.match(readFileSync(join(dir, 'cuke.yml'), 'utf8'), /# Team settings/);
  writeFileSync(join(dir, 'sample.feature'), 'Feature: florple\n');
  assert.strictEqual(cuke(dir, '', 'check', 'sample.feature').status, 0);
});
