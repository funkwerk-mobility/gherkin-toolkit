import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { onTestFinished } from 'vitest';
import { outdent as createOutdent } from 'outdent';

export const outdent = createOutdent({ trimTrailingNewline: false });

const cli = resolve('dist/cli.js');

export function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'cuke-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function runCommand(dir, command, ...args) {
  return spawnSync(process.execPath, [cli, command, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: dir, XDG_CONFIG_HOME: join(dir, 'settings') } });
}

export function run(dir, ...args) {
  return runCommand(dir, 'check', ...args);
}
