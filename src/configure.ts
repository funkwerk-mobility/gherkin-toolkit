import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import * as p from '@clack/prompts';
import { isMap, parseDocument, type Node } from 'yaml';
import { resolveConfiguration } from './config.js';
import { configuredLocale, locales, spellingLocale, type Region } from './policies.js';

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
  { value: 'fr-FR', label: 'French' },
  { value: 'nb-NO', label: 'Norwegian Bokmål' },
  { value: 'lb-LU', label: 'Luxembourgish' },
];
for (const locale of Object.keys(locales)) {
  if (!languages.some(language => language.value === locale)) languages.push({ value: locale, label: new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale });
}
const regions: { value: Region; label: string; name: string }[] = [
  { value: 'prose', label: 'Prose', name: 'Prose' }, { value: 'content', label: 'Content', name: 'Content' },
  { value: 'quotes', label: '> Quoted content', name: 'Quoted content' }, { value: 'tables', label: '> All tables', name: 'All tables' },
  { value: 'dataTables', label: '> > Step data tables', name: 'Step data tables' },
  { value: 'tableHeaders', label: '> Table headers', name: 'Table headers' }, { value: 'examples', label: '> > Examples tables', name: 'Examples tables' },
  { value: 'docStrings', label: '> Docstrings', name: 'Docstrings' },
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
  const document = parseDocument<Node>(exists ? readFileSync(file, 'utf8') : '', { uniqueKeys: true });
  if (document.contents === null) document.contents = document.createNode({});
  if (document.errors.length || !isMap(document.contents)) throw new Error(`${file}: configuration must be a valid YAML mapping`);
  let changed = !exists;

  const checks = answer(await p.multiselect({ message: 'Checks to run by default', required: false,
      options: [{ value: 'spell', label: 'Spelling' }, { value: 'format', label: 'Formatting' }], initialValues: current.checks }));
  if (checks.join(',') !== current.checks.join(',')) { document.set('checks', checks); changed = true; }
  const stepHeader = answer(await p.confirm({ message: 'Step data tables have a header row?', initialValue: current.stepTableHeader ?? false }));
  if (stepHeader !== (current.stepTableHeader ?? false)) { document.setIn(['tables', 'stepHeader'], stepHeader); changed = true; }
  if (checks.includes('format')) {
    const tags = answer(await p.select({ message: 'Tag layout', options: [
      { value: 'preserve', label: 'Keep line breaks' },
      { value: 'one-per-line', label: 'One tag per line' },
      { value: 'single-line', label: 'Combine tags on one line where possible' },
    ], initialValue: current.tagLayout ?? 'preserve' }));
    if (tags !== (current.tagLayout ?? 'preserve')) { document.setIn(['format', 'tags'], tags); changed = true; }
    const positive = (value: string | undefined) => value && /^[1-9]\d*$/u.test(value) && Number.isSafeInteger(Number(value)) ? undefined : 'Enter a positive integer.';
    const width = Number(answer(await p.text({ message: 'Line width', initialValue: String(current.printWidth ?? 120), validate: positive })));
    if (width !== (current.printWidth ?? 120)) { document.setIn(['format', 'printWidth'], width); changed = true; }
    const indent = Number(answer(await p.text({ message: 'Indentation width', initialValue: String(current.tabWidth ?? 2), validate: positive })));
    if (indent !== (current.tabWidth ?? 2)) { document.setIn(['format', 'tabWidth'], indent); changed = true; }
    const useTabs = answer(await p.confirm({ message: 'Use tabs for indentation?', initialValue: current.useTabs ?? false }));
    if (useTabs !== (current.useTabs ?? false)) { document.setIn(['format', 'useTabs'], useTabs); changed = true; }
  }
  if (checks.includes('spell')) {
    const initialDictionary = current.dictionary ? relative(process.cwd(), current.dictionary) || '.' : 'spellchecker';
    const dictionary = answer(await p.text({ message: 'Custom dictionary path (relative to the working directory)', initialValue: initialDictionary }));
    if ((!current.dictionary && dictionary) || (current.dictionary && (!dictionary || resolve(dictionary) !== current.dictionary))) {
      if (dictionary) document.set('dictionary', relative(dirname(file), resolve(dictionary)) || '.'); else document.delete('dictionary');
      changed = true;
    }
    const currentLocale = spellingLocale(current.spell?.specification?.en ?? current.spell?.dialects?.en ?? 'en-US');
    const locale = answer(await p.select({ message: 'Specification language for English features', options: languages.filter(language => language.value.startsWith('en-')), initialValue: currentLocale }));
    if (locale !== currentLocale) { document.setIn(['spell', 'specification', 'en'], locale); changed = true; }

    const initialRegions = regions.filter(({ value }) => document.hasIn(['spell', value, 'locale']) || document.hasIn(['spell', value, 'locales'])).map(({ value }) => value);
    const selected = answer(await p.multiselect({ message: 'Which spelling language overrides do you want to configure?', options: regions, initialValues: initialRegions, required: false }));
    for (const { value: region, name } of regions) {
      const policy = current.spell?.[region];
      const existing = (policy?.locales ?? (policy?.locale ? [policy.locale] : [])).map(value => configuredLocale(value, current.spell ?? {}));
      if (selected.includes(region)) {
        const chosen = answer(await p.multiselect({ message: `${name}: languages`, options: languages, initialValues: existing.length ? existing : [locale], required: true }));
        if (chosen.join(',') !== existing.join(',')) {
          if (document.hasIn(['spell', region, 'locale'])) document.deleteIn(['spell', region, 'locale']);
          document.setIn(['spell', region, 'locales'], chosen); changed = true;
        }
      } else if (initialRegions.includes(region)) {
        if (document.hasIn(['spell', region, 'locale'])) document.deleteIn(['spell', region, 'locale']);
        if (document.hasIn(['spell', region, 'locales'])) document.deleteIn(['spell', region, 'locales']);
        changed = true;
      }
    }
  }
  if (changed) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, document.toString());
  }
  const selection = selectionFile();
  mkdirSync(dirname(selection), { recursive: true });
  writeFileSync(selection, `${JSON.stringify(file)}\n`);
  p.outro(changed ? `Saved and selected configuration: ${given}` : `Selected configuration: ${given}`);
}
