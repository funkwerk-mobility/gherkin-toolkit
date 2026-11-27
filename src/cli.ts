#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { AstBuilder, Errors, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';

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

function check(inputs: string[]): void {
  const seen = new Set<string>();
  function visit(path: string): void {
    try {
      const stat = statSync(path);
      if (stat.isFile() && !inputs.includes(path) && !path.endsWith('.feature')) return;
      const realPath = realpathSync(path);
      if (seen.has(realPath)) return;
      seen.add(realPath);
      if (stat.isDirectory()) {
        for (const entry of readdirSync(path).sort()) visit(join(path, entry));
      } else if (stat.isFile()) {
        const parser = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher());
        parser.parse(readFileSync(path, 'utf8'));
      }
    } catch (error) { report(path, error); }
  }
  for (const input of inputs) visit(input);
}

if (process.argv[2] === 'check') {
  check(process.argv.slice(3));
} else if (process.argv.length === 2 || process.argv[2] === '--help') {
  console.log('Usage: cuke check [files or directories...]');
} else {
  console.error(`Unknown command: ${process.argv[2]}`);
  process.exitCode = 1;
}
