#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { AstBuilder, Errors, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import type { Feature } from '@cucumber/messages';
import { resolveConfiguration, type Check } from './config.js';
import type { SpellConfig } from './policies.js';

function report(path: string, error: unknown): void {
  process.exitCode = 1;
  if (error instanceof Errors.GherkinException) {
    if (error.errors) {
      for (const child of error.errors) report(path, child);
    } else {
      const line = error.location?.line ?? 1;
      const column = error.location?.column ?? 1;
      console.error(`${path}:${line}:${column}: ${error.message.replace(/^\(\d+:\d+\):\s*/, '')}`);
    }
  } else {
    console.error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function check(inputs: string[], checks: Check[], dictionary: string | undefined, verbose: boolean, fix: boolean, policies?: SpellConfig): Promise<void> {
  let spelling: typeof import('./spell.js') | undefined;
  let fixes: import('./spell.js').SpellingFixes | undefined;
  const checked: { feature?: Feature; source: string; path: string }[] = [];

  const seen = new Set<string>();
  async function visit(path: string): Promise<void> {
    try {
      const stat = statSync(path);
      if (stat.isFile() && !inputs.includes(path) && !path.endsWith('.feature')) return;
      const realPath = realpathSync(path);
      if (seen.has(realPath)) return;
      seen.add(realPath);
      if (stat.isDirectory()) {
        for (const entry of readdirSync(path).sort()) await visit(join(path, entry));
      } else if (stat.isFile()) {
        if (verbose) console.log(`Parsing: ${path}`);
        const parser = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher());
        const source = readFileSync(path, 'utf8');
        const document = parser.parse(source);
        if (checks.includes('spell')) {
          if (verbose) console.log(`Checking spelling: ${path}`);
          spelling ??= await import('./spell.js');
          if (fix) fixes ??= new spelling.SpellingFixes();
          await spelling.checkSpelling(document.feature, source, path, dictionary, policies, fixes);
          if (fix) checked.push({ feature: document.feature, source, path });
        }
      }
    } catch (error) { report(path, error); }
  }
  for (const input of inputs) await visit(input);
  fixes?.apply();
  if (fix && spelling) for (const { feature, source, path } of checked) {
    try { await spelling.checkSpelling(feature, source, path, dictionary, policies); }
    catch (error) { report(path, error); }
  }
}

if (process.argv[2] === 'check') {
  try {
    const inputs: string[] = [];
    let config: string | undefined;
    let only: string[] | undefined;
    let dictionary: string | undefined;
    let verbose = false;
    let fix = false;
    const args = process.argv.slice(3);
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--verbose') verbose = true;
      else if (arg === '--fix') fix = true;
      else if (arg === '--config' || arg === '--only' || arg === '--dictionary') {
        const value = args[++i];
        if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
        if (arg === '--config') config = value;
        else if (arg === '--dictionary') dictionary = value;
        else only = [...(only ?? []), ...value.split(',')];
      } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
      else inputs.push(arg);
    }
    const selected = resolveConfiguration(config, only);
    await check(inputs, selected.checks, dictionary ?? selected.dictionary, verbose, fix, selected.spelling);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else if (process.argv.length === 2 || process.argv[2] === '--help') {
  console.log('Usage: cuke check [--verbose] [files or directories...]');
} else {
  console.error(`Unknown command: ${process.argv[2]}`);
  process.exitCode = 1;
}
