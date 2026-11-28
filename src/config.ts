import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';
import { mergeSpelling, parseSpelling, type SpellConfig } from './policies.js';

export type Check = 'spell';
export type Configuration = { checks: Check[]; dictionary?: string; spell?: SpellConfig; diagnosticLimit?: number; stepTableHeader?: boolean };

function checks(value: unknown, source: string): Check[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${source}: checks must be a list of check names`);
  }
  for (const name of value) {
    if (name !== 'spell') throw new Error(`${source}: unknown or unavailable check: ${name}`);
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
        if (key !== 'checks' && key !== 'extends' && key !== 'dictionary' && key !== 'spell' && key !== 'diagnostics' && key !== 'tables') throw new Error(`${file}: unknown setting: ${key}`);
      }
      if (config.extends !== undefined && (typeof config.extends !== 'string' || !config.extends)) {
        throw new Error(`${file}: extends must be a path`);
      }
      if (config.dictionary !== undefined && (typeof config.dictionary !== 'string' || !config.dictionary)) {
        throw new Error(`${file}: dictionary must be a path`);
      }
      if (config.tables !== undefined) {
        const tables = config.tables;
        if (!tables || typeof tables !== 'object' || Array.isArray(tables) || Object.keys(tables).some(key => key !== 'stepHeader') || (Object.hasOwn(tables, 'stepHeader') && typeof (tables as Record<string, unknown>).stepHeader !== 'boolean')) throw new Error(`${file}: tables.stepHeader must be a boolean`);
      }
      if (config.diagnostics !== undefined) {
        const diagnostics = config.diagnostics;
        if (!diagnostics || typeof diagnostics !== 'object' || Array.isArray(diagnostics) || Object.keys(diagnostics).some(key => key !== 'limit')) throw new Error(`${file}: diagnostics must be a mapping with a limit`);
        const limit = (diagnostics as Record<string, unknown>).limit;
        if (limit !== undefined && (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0)) throw new Error(`${file}: diagnostics.limit must be a nonnegative integer`);
      }
      const inherited: Configuration = config.extends === undefined ? { checks: ['spell'] } : load(resolve(dirname(file), config.extends as string));
      return {
        checks: config.checks === undefined ? inherited.checks : checks(config.checks, file),
        dictionary: config.dictionary === undefined ? inherited.dictionary : resolve(dirname(file), config.dictionary as string),
        spell: mergeSpelling(inherited.spell, config.spell === undefined ? undefined : parseSpelling(config.spell, file)),
        diagnosticLimit: (config.diagnostics as { limit?: number } | undefined)?.limit ?? inherited.diagnosticLimit,
        stepTableHeader: (config.tables as { stepHeader?: boolean } | undefined)?.stepHeader ?? inherited.stepTableHeader,
      };
    } finally { active.delete(canonical); }
  }
  const configured: Configuration = path === undefined ? { checks: ['spell'] } : load(resolve(path));
  return { ...configured, checks: only === undefined ? configured.checks : checks(only, '--only') };
}
