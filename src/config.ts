import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';

type Check = 'syntax';

function checks(value: unknown, source: string): Check[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${source}: checks must be a list of check names`);
  }
  for (const name of value) {
    if (name !== 'syntax') throw new Error(`${source}: unknown or unavailable check: ${name}`);
  }
  return value as Check[];
}

export function selectChecks(path: string | undefined, only: string[] | undefined): Check[] {
  const active = new Set<string>();
  function load(file: string): Check[] {
    let canonical: string;
    let text: string;
    try {
      canonical = realpathSync(file);
      text = readFileSync(canonical, 'utf8');
    } catch (error) {
      throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (active.has(canonical)) throw new Error(`${file}: circular configuration extends`);
    active.add(canonical);
    try {
      let parsed: unknown;
      try { parsed = parse(text, { uniqueKeys: true }); }
      catch (error) { throw new Error(`${file}: invalid YAML: ${error instanceof Error ? error.message : String(error)}`); }
      if (parsed === null) parsed = {};
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${file}: configuration must be a mapping`);
      const config = parsed as Record<string, unknown>;
      for (const key of Object.keys(config)) {
        if (key !== 'checks' && key !== 'extends') throw new Error(`${file}: unknown setting: ${key}`);
      }
      if (config.extends !== undefined && (typeof config.extends !== 'string' || !config.extends)) {
        throw new Error(`${file}: extends must be a path`);
      }
      const inherited = config.extends === undefined ? ['syntax' as const] : load(resolve(dirname(file), config.extends as string));
      return config.checks === undefined ? inherited : checks(config.checks, file);
    } finally { active.delete(canonical); }
  }
  const configured = path === undefined ? ['syntax' as const] : load(resolve(path));
  return only === undefined ? configured : checks(only, '--only');
}
