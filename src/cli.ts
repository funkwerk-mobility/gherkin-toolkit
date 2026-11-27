#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { AstBuilder, Errors, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import type { Feature } from '@cucumber/messages';
import { resolveConfiguration, type Check } from './config.js';
import type { SpellConfig } from './policies.js';
import { Reporter, type OutputFormat } from './diagnostics.js';

function report(reporter: Reporter, path: string, error: unknown): void {
  if (error instanceof Errors.GherkinException) {
    if (error.errors) {
      for (const child of error.errors) report(reporter, path, child);
    } else {
      const line = error.location?.line ?? 1;
      const column = error.location?.column ?? 1;
      reporter.report({ path, line, column, rule: 'parse-error', severity: 'error', message: error.message.replace(/^\(\d+:\d+\):\s*/, '') });
    }
  } else {
    reporter.report({ path, rule: 'input-error', severity: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

async function check(inputs: string[], checks: Check[], dictionary: string | undefined, verbose: boolean, fix: boolean, reporter: Reporter, policies?: SpellConfig): Promise<void> {
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
        if (verbose) reporter.progress(`Parsing: ${path}`);
        const parser = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher());
        const source = readFileSync(path, 'utf8');
        const document = parser.parse(source);
        if (checks.includes('spell')) {
          if (verbose) reporter.progress(`Checking spelling: ${path}`);
          spelling ??= await import('./spell.js');
          if (fix) fixes ??= new spelling.SpellingFixes(reporter);
          await spelling.checkSpelling(document.feature, source, path, dictionary, policies, reporter, fixes);
          if (fix) checked.push({ feature: document.feature, source, path });
        }
      }
    } catch (error) { report(reporter, path, error); }
  }
  for (const input of inputs) await visit(input);
  fixes?.apply();
  if (fix && spelling) for (const { feature, source, path } of checked) {
    try { await spelling.checkSpelling(feature, source, path, dictionary, policies, reporter); }
    catch (error) { report(reporter, path, error); }
  }
}

if (process.argv[2] === 'check') {
  let format: OutputFormat = 'human';
  let errorFormat: OutputFormat = 'human';
  for (let i = 3; i < process.argv.length; i++) {
    if (process.argv[i] === '--format' && (process.argv[i + 1] === 'json' || process.argv[i + 1] === 'human')) errorFormat = process.argv[i + 1] as OutputFormat;
  }
  try {
    const inputs: string[] = [];
    let config: string | undefined;
    let only: string[] | undefined;
    let dictionary: string | undefined;
    let verbose = false;
    let fix = false;
    let limit: number | undefined;
    const args = process.argv.slice(3);
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--verbose') verbose = true;
      else if (arg === '--fix') fix = true;
      else if (arg === '--config' || arg === '--only' || arg === '--dictionary' || arg === '--format' || arg === '--limit') {
        const value = args[++i];
        if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
        if (arg === '--limit') {
          if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('--limit must be a nonnegative integer');
          limit = Number(value);
        } else if (arg === '--format') {
          if (value !== 'human' && value !== 'json') throw new Error(`Unknown output format: ${value}`);
          format = value;
        } else if (arg === '--config') config = value;
        else if (arg === '--dictionary') dictionary = value;
        else only = [...(only ?? []), ...value.split(',')];
      } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
      else inputs.push(arg);
    }
    const selected = resolveConfiguration(config, only);
    const reporter = new Reporter(format, limit ?? selected.diagnosticLimit ?? 100);
    await check(inputs, selected.checks, dictionary ?? selected.dictionary, verbose, fix, reporter, selected.spelling);
    reporter.finish();
  } catch (error) {
    const reporter = new Reporter(errorFormat, 100);
    reporter.report({ rule: 'configuration-error', severity: 'error', message: error instanceof Error ? error.message : String(error) });
    reporter.finish();
  }
} else if (process.argv.length === 2 || process.argv[2] === '--help') {
  console.log('Usage: cuke check [--verbose] [files or directories...]');
} else {
  console.error(`Unknown command: ${process.argv[2]}`);
  process.exitCode = 1;
}
