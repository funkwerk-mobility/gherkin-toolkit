#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AstBuilder, Errors, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import type { Feature } from '@cucumber/messages';
import { resolveConfiguration, type Check } from './config.js';
import type { SpellConfig } from './policies.js';
import { Reporter, type OutputFormat } from './diagnostics.js';
import { formatFeature, type TagLayout } from './format.js';
import { configure, rememberedConfiguration } from './configure.js';

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

async function check(inputs: string[], checks: Check[], dictionary: string | undefined, verbose: boolean, fix: boolean, reporter: Reporter, policies?: SpellConfig, stepTableHeader = false, tagLayout: TagLayout = 'preserve'): Promise<void> {
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
        let source = readFileSync(path, 'utf8');
        let document = parser.parse(source);
        if (checks.includes('format')) {
          if (verbose) reporter.progress(`Checking formatting: ${path}`);
          const formatted = formatFeature(source, document, tagLayout);
          if (formatted !== source) {
            if (fix) { writeFileSync(path, formatted); reporter.fixed(`Formatted: ${path}`); source = formatted; document = parser.parse(source); }
            else reporter.report({ path, line: 1, column: 1, rule: 'format', severity: 'error', message: 'Formatting differs' });
          }
        }
        if (checks.includes('spell')) {
          if (verbose) reporter.progress(`Checking spelling: ${path}`);
          spelling ??= await import('./spell.js');
          if (fix) fixes ??= new spelling.SpellingFixes(reporter);
          await spelling.checkSpelling(document.feature, source, path, dictionary, policies, reporter, fixes, stepTableHeader);
          if (fix) checked.push({ feature: document.feature, source, path });
        }
      }
    } catch (error) { report(reporter, path, error); }
  }
  for (const input of inputs) await visit(input);
  fixes?.apply();
  if (fix && spelling) for (const { feature, source, path } of checked) {
    try { await spelling.checkSpelling(feature, source, path, dictionary, policies, reporter, undefined, stepTableHeader); }
    catch (error) { report(reporter, path, error); }
  }
}

const usage = `Usage: cuke check [options] [files or directories...]

Commands:
  check                 Check feature files
  configure             Configure cuke interactively

Options:
  --config <file>       Use a YAML configuration file
  --dictionary <path>   Use a custom dictionary directory or file
  --only <checks>       Run only the named checks (comma-separated)
  --fix                 Apply available fixes
  --json                Output diagnostics as JSON
  --limit <number>      Maximum diagnostics to display (default: 100)
  --verbose             Show checks as they start
  --help                Show this help`;

if (process.argv[2] === 'configure') {
  try { await configure(process.argv.slice(3)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
} else if (process.argv[2] === 'check' && process.argv.length === 4 && process.argv[3] === '--help') {
  console.log(usage);
} else if (process.argv[2] === 'check') {
  let format: OutputFormat = 'human';
  const errorFormat: OutputFormat = process.argv.slice(3).includes('--json') ? 'json' : 'human';
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
      else if (arg === '--json') format = 'json';
      else if (arg === '--config' || arg === '--only' || arg === '--dictionary' || arg === '--limit') {
        const value = args[++i];
        if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
        if (arg === '--limit') {
          if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('--limit must be a nonnegative integer');
          limit = Number(value);
        } else if (arg === '--config') config = value;
        else if (arg === '--dictionary') dictionary = value;
        else only = [...(only ?? []), ...value.split(',')];
      } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
      else inputs.push(arg);
    }
    const selected = resolveConfiguration(config ?? rememberedConfiguration(), only);
    const reporter = new Reporter(format, limit ?? selected.diagnosticLimit ?? 100);
    await check(inputs, selected.checks, dictionary ?? selected.dictionary, verbose, fix, reporter, selected.spell, selected.stepTableHeader, selected.tagLayout);
    reporter.finish();
  } catch (error) {
    const reporter = new Reporter(errorFormat, 100);
    reporter.report({ rule: 'configuration-error', severity: 'error', message: error instanceof Error ? error.message : String(error) });
    reporter.finish();
  }
} else if (process.argv.length === 2 || process.argv[2] === '--help') {
  console.log(usage);
} else {
  console.error(`Unknown command: ${process.argv[2]}`);
  process.exitCode = 1;
}
