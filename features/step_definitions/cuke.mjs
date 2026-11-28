import { After, Before, Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli.js');
setDefaultTimeout(15_000);

Before(function () {
  this.dir = mkdtempSync(join(tmpdir(), 'cuke-showcase-'));
  this.feature = join(this.dir, 'example.feature');
  writeFileSync(join(this.dir, 'cuke.yml'), 'checks: [spell, format]\n');
});

After(function () {
  rmSync(this.dir, { recursive: true, force: true });
});

function cuke(world, ...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: world.dir,
    encoding: 'utf8',
    env: { ...process.env, HOME: world.dir, XDG_CONFIG_HOME: join(world.dir, 'settings') },
  });
}

Given('a feature file containing:', function (content) {
  writeFileSync(this.feature, `${content}\n`);
});

Given('a custom dictionary containing:', function (content) {
  mkdirSync(join(this.dir, 'dictionary'));
  writeFileSync(join(this.dir, 'dictionary', 'terms.dic'), `${content}\n`);
});

When('I check its spelling with Cuke', function () {
  this.result = cuke(this, 'check', '--config', 'cuke.yml', '--dictionary', 'dictionary', '--only', 'spell', '--json', 'example.feature');
});

When('I format it with Cuke', function () {
  this.result = cuke(this, 'format', '--config', 'cuke.yml', 'example.feature');
});

Then('the check fails', function () {
  assert.notEqual(this.result.status, 0);
});

Then('the command succeeds', function () {
  assert.equal(this.result.status, 0, this.result.stderr);
});

Then('the following spelling diagnostics are reported:', function (table) {
  const { diagnostics } = JSON.parse(this.result.stdout);
  assert.deepEqual(diagnostics.map(({ rule, word }) => ({ rule, word })), table.hashes());
});

Then('the feature file contains:', function (content) {
  assert.equal(readFileSync(this.feature, 'utf8'), `${content}\n`);
});

Then('the feature file passes the formatting check', function () {
  const result = cuke(this, 'check', '--config', 'cuke.yml', '--only', 'format', 'example.feature');
  assert.equal(result.status, 0, result.stderr);
});
