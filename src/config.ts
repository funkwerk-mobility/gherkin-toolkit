import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';
import { mergeSpelling, parseSpelling, type SpellConfig } from './policies.js';

export type Check = 'syntax' | 'spell';
export type Configuration = { checks: Check[]; dictionary?: string; spelling?: SpellConfig };

function checks(value: unknown, source: string): Check[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${source}: checks must be a list of check names`);
  }
  for (const name of value) {
    if (name !== 'syntax' && name !== 'spell') throw new Error(`${source}: unknown or unavailable check: ${name}`);
  }
  return value as Check[];
}

export function resolveConfiguration(path: string | undefined, only: string[] | undefined): Configuration {
  const active = new Set<string>();
  function load(file: string): Configuration {
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
        if (key !== 'checks' && key !== 'extends' && key !== 'dictionary' && key !== 'spelling') throw new Error(`${file}: unknown setting: ${key}`);
      }
      if (config.extends !== undefined && (typeof config.extends !== 'string' || !config.extends)) {
        throw new Error(`${file}: extends must be a path`);
      }
      if (config.dictionary !== undefined && (typeof config.dictionary !== 'string' || !config.dictionary)) {
        throw new Error(`${file}: dictionary must be a path`);
      }
      const inherited: Configuration = config.extends === undefined ? { checks: ['syntax'] } : load(resolve(dirname(file), config.extends as string));
      return {
        checks: config.checks === undefined ? inherited.checks : checks(config.checks, file),
        dictionary: config.dictionary === undefined ? inherited.dictionary : resolve(dirname(file), config.dictionary as string),
        spelling: mergeSpelling(inherited.spelling, config.spelling === undefined ? undefined : parseSpelling(config.spelling, file)),
      };
    } finally { active.delete(canonical); }
  }
  const configured: Configuration = path === undefined ? { checks: ['syntax'] } : load(resolve(path));
  return { ...configured, checks: only === undefined ? configured.checks : checks(only, '--only') };
}
