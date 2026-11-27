import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import { isMap, parseDocument, type Node } from 'yaml';
import { resolveConfiguration } from './config.js';
import { parseSpelling, spellingLocale, type Region } from './policies.js';

function selectionFile(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return join(xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.config'), 'cuke', 'selection.json');
}

export function rememberedConfiguration(): string | undefined {
  const file = selectionFile();
  if (!existsSync(file)) return undefined;
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error(`${file}: invalid remembered configuration`);
  return value;
}

function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) throw new Error('Configuration cancelled.');
  return value as Exclude<T, symbol>;
}

const languages = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'de-DE', label: 'German' },
];
const regions: { value: Region; label: string }[] = [
  { value: 'prose', label: 'Prose' }, { value: 'content', label: 'Content (default for regions below)' },
  { value: 'quotes', label: 'Quoted content' }, { value: 'tables', label: 'Tables and Examples' },
  { value: 'dataTables', label: 'Step data tables' }, { value: 'examples', label: 'Examples values' },
  { value: 'docStrings', label: 'Docstrings' },
];

export async function configure(args: string[]): Promise<void> {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: cuke configure [--config <file> | --show | --clear]');
    return;
  }
  if (args.length === 1 && args[0] === '--show') {
    console.log(rememberedConfiguration() ?? 'No configuration selected.');
    return;
  }
  if (args.length === 1 && args[0] === '--clear') {
    rmSync(selectionFile(), { force: true });
    console.log('Cleared the selected configuration.');
    return;
  }
  if (args.length && (args.length !== 2 || args[0] !== '--config' || !args[1] || args[1].startsWith('--'))) {
    throw new Error('Usage: cuke configure [--config <file> | --show | --clear]');
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('cuke configure requires an interactive terminal.');
  p.intro('Configure cuke');
  const previous = rememberedConfiguration();
  const given = args[1] ?? answer(await p.text({ message: 'Configuration file', initialValue: previous ?? 'cuke.yml', validate: value => value?.trim() ? undefined : 'Enter a path.' }));
  const file = resolve(given.replace(/^(?:~|\$HOME)(?=\/|$)/u, () => homedir()));
  const exists = existsSync(file);
  const current = resolveConfiguration(exists ? file : undefined, undefined);
  const document = parseDocument<Node>(exists ? readFileSync(file, 'utf8') : '{}\n', { uniqueKeys: true });
  if (document.contents === null) document.contents = document.createNode({});
  if (document.errors.length || !isMap(document.contents)) throw new Error(`${file}: configuration must be a valid YAML mapping`);
  let changed = !exists;

  const sections = answer(await p.multiselect({
    message: 'What would you like to configure?', required: false,
    options: [
      { value: 'checks', label: 'Checks' },
      { value: 'dictionary', label: 'Product dictionary path' },
      { value: 'specification', label: 'Specification languages' },
      { value: 'regions', label: 'Spelling regions and fix destinations' },
    ],
  }));
  if (sections.includes('checks')) {
    const checks = answer(await p.multiselect({ message: 'Checks to run by default', required: false,
      options: [{ value: 'spell', label: 'Spelling' }], initialValues: current.checks }));
    if (checks.join(',') !== current.checks.join(',')) { document.set('checks', checks); changed = true; }
  }
  if (sections.includes('dictionary')) {
    const old = document.get('dictionary');
    const dictionary = answer(await p.text({ message: 'Product dictionary path (relative to this configuration)', initialValue: typeof old === 'string' ? old : '', placeholder: 'e.g. spellchecker' }));
    if (dictionary !== (typeof old === 'string' ? old : '')) {
      if (dictionary) document.set('dictionary', dictionary); else document.delete('dictionary');
      changed = true;
    }
  }
  if (sections.includes('specification')) {
    for (const [dialect, label, fallback] of [['en', 'English', 'en-US'], ['de', 'German', 'de-DE']] as const) {
      const currentLocale = spellingLocale(current.spelling?.specification?.[dialect] ?? current.spelling?.dialects?.[dialect] ?? fallback);
      const locale = answer(await p.select({ message: `Specification language for ${label} features`, options: languages, initialValue: currentLocale }));
      if (locale !== currentLocale) { document.setIn(['spelling', 'specification', dialect], locale); changed = true; }
    }
  }
  if (sections.includes('regions')) {
    const selected = answer(await p.multiselect({ message: 'Which spelling regions would you like to configure?', options: regions, required: false }));
    for (const region of selected) {
      const policy = current.spelling?.[region];
      const existing = (policy?.locales ?? (policy?.locale ? [policy.locale] : [])).map(spellingLocale);
      const mode = answer(await p.select({ message: `${region}: language policy`, initialValue: existing.length ? 'select' : 'inherit',
        options: [{ value: 'inherit', label: 'Use inherited or default language' }, { value: 'select', label: 'Select languages' }] }));
      if (mode === 'select') {
        const chosen = answer(await p.multiselect({ message: `${region}: languages`, options: languages, initialValues: existing, required: true }));
        if (chosen.join(',') !== existing.join(',')) {
          if (document.hasIn(['spelling', region, 'locale'])) document.deleteIn(['spelling', region, 'locale']);
          document.setIn(['spelling', region, 'locales'], chosen); changed = true;
        }
      } else if (document.hasIn(['spelling', region, 'locale']) || document.hasIn(['spelling', region, 'locales'])) {
        if (document.hasIn(['spelling', region, 'locale'])) document.deleteIn(['spelling', region, 'locale']);
        if (document.hasIn(['spelling', region, 'locales'])) document.deleteIn(['spelling', region, 'locales']);
        changed = true;
      }
      const localDestination = document.getIn(['spelling', region, 'fixDestination']);
      const destination = answer(await p.text({ message: `${region}: fix dictionary name (blank uses the default)`, initialValue: typeof localDestination === 'string' ? localDestination : '',
        validate: value => { try { if (value) parseSpelling({ [region]: { fixDestination: value } }, file); return undefined; } catch { return 'Enter a dictionary name, not a path.'; } } }));
      if (destination !== (typeof localDestination === 'string' ? localDestination : '')) {
        if (destination) document.setIn(['spelling', region, 'fixDestination'], destination);
        else if (document.hasIn(['spelling', region, 'fixDestination'])) document.deleteIn(['spelling', region, 'fixDestination']);
        changed = true;
      }
    }
  }
  const remember = answer(await p.confirm({ message: 'Remember this configuration for future checks?', initialValue: previous === file }));
  if (changed) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, document.toString());
  }
  if (remember) {
    const selection = selectionFile();
    mkdirSync(dirname(selection), { recursive: true });
    writeFileSync(selection, `${JSON.stringify(file)}\n`);
  }
  p.outro(changed ? `Saved configuration: ${file}` : 'Configuration unchanged.');
}
