import { createRequire } from 'node:module';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getDictionary, validateText } from 'cspell-lib';
import type { Background, Examples, Feature, Rule, Scenario, Step, TableRow, Tag } from '@cucumber/messages';
import { locales, spellingLocale, type Policy, type Region, type SpellConfig } from './policies.js';

const require = createRequire(import.meta.url);

type Scope = Partial<Record<Region, Policy>>;
function tagPolicy(tags: readonly Tag[]): Scope {
  const result: Scope = {};
  for (const tag of tags) {
    const match = /^@spell-(text|tables|dataTables|examples|docStrings)=(.+)$/u.exec(tag.name);
    if (match) result[match[1] as Region] = { locale: match[2] };
  }
  return result;
}

function combine(base: Policy, region: Region, ...scopes: Scope[]): Policy {
  let result = { ...base };
  for (const scope of scopes) {
    if (region === 'dataTables' || region === 'examples') result = { ...result, ...scope.tables };
    result = { ...result, ...scope[region] };
  }
  return result;
}

function readWords(path: string): string[] {
  return readFileSync(path, 'utf8').split(/\r?\n/u).map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('!'));
}

export async function checkSpelling(feature: Feature | undefined, source: string, file: string, dictionaryDir?: string, config: SpellConfig = {}): Promise<void> {
  if (!feature) return;
  const defaultLocale = spellingLocale(config.dialects?.[feature.language] ?? feature.language);
  const lines = source.split(/\r?\n/u);
  const featureScope = tagPolicy(feature.tags);
  const base: Policy = { locale: defaultLocale };
  const cache = new Map<string, { settings: Parameters<typeof getDictionary>[0]; dictionary: Awaited<ReturnType<typeof getDictionary>> }>();
  const directoryStat = dictionaryDir ? statSync(dictionaryDir) : undefined;

  async function text(value: string, line: number, column: number, policy: Policy, positions?: number[]) {
    if (!value) return;
    const locale = spellingLocale(policy.locale ?? defaultLocale);
    const names = policy.dictionaries ?? [];
    const key = JSON.stringify([locale, names]);
    let entry = cache.get(key);
    if (!entry) {
      const info = locales[locale];
      const path = join(dirname(require.resolve(info.package)), info.file);
      const words: string[] = [];
      if (dictionaryDir && directoryStat?.isDirectory()) {
        const short = info.short;
        for (const name of [locale, ...(short ? [short] : [])]) {
          const wordFile = join(dictionaryDir, `${name}.dic`);
          if (existsSync(wordFile)) words.push(...readWords(wordFile));
        }
        for (const name of names) {
          if (Object.hasOwn(locales, name) || Object.values(locales).some(item => item.short === name)) throw new Error(`locale dictionary cannot be used as a shared dictionary: ${name}`);
          words.push(...readWords(join(dictionaryDir, `${name}.dic`)));
        }
      } else {
        if (names.length) throw new Error('shared dictionaries require a dictionary directory');
        if (dictionaryDir && locale === defaultLocale) words.push(...readWords(dictionaryDir));
      }
      const settings = { dictionaryDefinitions: [{ name: locale, path }], dictionaries: [locale], minWordLength: 2, words };
      entry = { settings, dictionary: await getDictionary(settings) };
      cache.set(key, entry);
    }
    const normalized = value.replace(/’/gu, "'");
    const invalid = [...normalized.matchAll(/[\p{L}\p{M}]+(?:'[\p{L}\p{M}]+)+/gu)].filter(match => !entry!.dictionary.has(match[0]));
    function diagnostic(offset: number, word: string) {
      console.error(`${file}:${line}:${column + (positions?.[offset] ?? offset)}: unknown word: ${word}`);
      process.exitCode = 1;
    }
    for (const match of invalid) diagnostic(match.index, value.slice(match.index, match.index + match[0].length));
    for (const issue of await validateText(normalized, entry.settings)) {
      if (invalid.some(match => issue.offset >= match.index && issue.offset < match.index + match[0].length)) continue;
      diagnostic(issue.offset, value.slice(issue.offset, issue.offset + issue.text.length));
    }
  }
  async function header(node: Feature | Rule | Scenario | Background | Examples, policy: Policy) {
    const line = node.location.line;
    const nameColumn = lines[line - 1].indexOf(node.name, (node.location.column ?? 1) - 1 + node.keyword.length + 1);
    if (node.name) await text(node.name, line, nameColumn + 1, policy);
    let current = line;
    for (const description of node.description.split('\n')) {
      if (!description.trim()) continue;
      while (++current <= lines.length) {
        if (lines[current - 1].trimStart().startsWith('#')) continue;
        const pos = lines[current - 1].indexOf(description.trim());
        if (pos >= 0) { await text(description.trim(), current, pos + 1, policy); break; }
      }
    }
  }
  async function row(row: TableRow, policy: Policy) {
    for (const cell of row.cells) {
      const line = cell.location.line;
      const column = cell.location.column ?? 1;
      const raw = lines[line - 1].slice(column - 1);
      const positions: number[] = [];
      let value = '';
      for (let i = 0; i < raw.length && raw[i] !== '|'; i++) {
        const start = i;
        let character = raw[i];
        if (character === '\\' && i + 1 < raw.length && ['\\', '|', 'n'].includes(raw[i + 1])) {
          character = raw[++i] === 'n' ? '\n' : raw[i];
        }
        positions.push(start);
        value += character;
      }
      value = value.trimEnd();
      await text(value, line, column, policy, positions);
    }
  }
  async function scenario(node: Scenario | Background, parent: Scope[]) {
    const scopes = 'tags' in node ? [...parent, tagPolicy(node.tags)] : parent;
    const textPolicy = combine(base, 'text', config, ...scopes);
    await header(node, textPolicy);
    for (const step of node.steps) {
      const line = step.location.line;
      const pos = lines[line - 1].indexOf(step.text, (step.location.column ?? 1) - 1 + step.keyword.length);
      await text(step.text, line, pos + 1, textPolicy);
      if (step.dataTable) for (const item of step.dataTable.rows) await row(item, combine(base, 'dataTables', config, ...scopes));
      if (step.docString && !step.docString.mediaType) {
        const doc = step.docString;
        for (const [i, content] of doc.content.split('\n').entries()) {
          const sourceLine = doc.location.line + i + 1;
          const raw = lines[sourceLine - 1] ?? '';
          const indent = raw.length - raw.trimStart().length;
          const start = Math.min(indent, (doc.location.column ?? 1) - 1);
          const positions: number[] = [];
          let index = start;
          for (const character of content) {
            if (raw[index] !== character && raw[index] === '\\' && raw[index + 1] === character) index++;
            positions.push(index - start);
            index++;
          }
          if (content) await text(content, sourceLine, start + 1, combine(base, 'docStrings', config, ...scopes), positions);
        }
      }
    }
    if ('examples' in node) for (const example of node.examples) {
      await header(example, textPolicy);
      if (example.tableHeader) await row(example.tableHeader, { ...textPolicy, locale: defaultLocale });
      for (const item of example.tableBody ?? []) await row(item, combine(base, 'examples', config, ...scopes));
    }
  }
  async function rule(node: Rule, parent: Scope[]) {
    const scopes = [...parent, tagPolicy(node.tags)];
    await header(node, combine(base, 'text', config, ...scopes));
    for (const child of node.children) {
      if (child.scenario) await scenario(child.scenario, scopes);
      if (child.background) await scenario(child.background, scopes);
    }
  }
  await header(feature, combine(base, 'text', config, featureScope));
  for (const child of feature.children) {
    if (child.rule) await rule(child.rule, [featureScope]);
    if (child.scenario) await scenario(child.scenario, [featureScope]);
    if (child.background) await scenario(child.background, [featureScope]);
  }
}
