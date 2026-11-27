import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { isMap, parseDocument, type Node } from 'yaml';
import { resolveConfiguration } from './config.js';
import { parseSpelling, spellingLocale } from './policies.js';

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
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const lines = input[Symbol.asyncIterator]();
  async function ask(prompt: string): Promise<string> {
    process.stdout.write(prompt);
    const line = await lines.next();
    if (line.done) throw new Error('Configuration cancelled: input ended.');
    return line.value.trim();
  }
  try {
    const previous = rememberedConfiguration();
    const given = args[1] ?? await ask(`Configuration file [${previous ?? 'cuke.yml'}]: `);
    const selectedPath = given || previous || 'cuke.yml';
    const file = resolve(selectedPath.replace(/^(?:~|\$HOME)(?=\/|$)/u, () => homedir()));
    const exists = existsSync(file);
    if (exists) resolveConfiguration(file, undefined);
    const document = parseDocument<Node>(exists ? readFileSync(file, 'utf8') : '{}\n', { uniqueKeys: true });
    if (document.contents === null) document.contents = document.createNode({});
    if (document.errors.length || !isMap(document.contents)) throw new Error(`${file}: configuration must be a valid YAML mapping`);
    console.log('Press Enter to keep each existing setting (or its default).');
    const spell = (await ask('Enable spelling for cuke check? [y/n]: ')).toLowerCase();
    if (!['', 'y', 'yes', 'n', 'no'].includes(spell)) throw new Error('Please answer yes or no.');
    const dictionary = await ask('Product dictionary path: ');
    const english = await ask('Specification locale for English (en-US or en-GB): ');
    const german = await ask('Specification locale for German (de-DE): ');
    const content = await ask('Content locales (comma-separated, e.g. en-US,de-DE): ');
    const advanced = (await ask('Configure individual spelling regions? [y/N]: ')).toLowerCase();
    if (!['', 'y', 'yes', 'n', 'no'].includes(advanced)) throw new Error('Please answer yes or no.');
    const regions: { name: string; languages: string; destination: string }[] = [];
    if (advanced === 'y' || advanced === 'yes') {
      for (const name of ['prose', 'quotes', 'tables', 'dataTables', 'examples', 'docStrings']) {
        regions.push({ name, languages: await ask(`${name} locales (comma-separated): `), destination: await ask(`${name} fix dictionary name: `) });
      }
      regions.push({ name: 'content', languages: '', destination: await ask('content fix dictionary name: ') });
    }
    for (const value of [english, german]) if (value) spellingLocale(value);
    const contentLocales = content ? content.split(',').map(value => value.trim()) : [];
    for (const value of contentLocales) spellingLocale(value);
    for (const region of regions) {
      if (region.languages) for (const value of region.languages.split(',').map(value => value.trim())) spellingLocale(value);
      if (region.destination) parseSpelling({ [region.name]: { fixDestination: region.destination } }, file);
    }
    if (spell) document.set('checks', spell === 'y' || spell === 'yes' ? ['spell'] : []);
    if (dictionary) document.set('dictionary', dictionary);
    if (english) document.setIn(['spelling', 'specification', 'en'], english);
    if (german) document.setIn(['spelling', 'specification', 'de'], german);
    if (content) {
      if (document.hasIn(['spelling', 'content', 'locale'])) document.deleteIn(['spelling', 'content', 'locale']);
      document.setIn(['spelling', 'content', 'locales'], contentLocales);
    }
    for (const region of regions) {
      if (region.languages) {
        if (document.hasIn(['spelling', region.name, 'locale'])) document.deleteIn(['spelling', region.name, 'locale']);
        document.setIn(['spelling', region.name, 'locales'], region.languages.split(',').map(value => value.trim()));
      }
      if (region.destination) document.setIn(['spelling', region.name, 'fixDestination'], region.destination);
    }
    const remember = (await ask('Remember this configuration for future checks? [y/N]: ')).toLowerCase();
    if (!['', 'y', 'yes', 'n', 'no'].includes(remember)) throw new Error('Please answer yes or no.');
    if (!exists || spell || dictionary || english || german || content || regions.some(region => region.languages || region.destination)) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, document.toString());
      console.log(`Saved configuration: ${file}`);
    }
    if (remember === 'y' || remember === 'yes') {
      const selection = selectionFile();
      mkdirSync(dirname(selection), { recursive: true });
      writeFileSync(selection, `${JSON.stringify(file)}\n`);
      console.log(`Selected configuration: ${file}`);
    }
  } finally { input.close(); }
}
