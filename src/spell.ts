import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { dialects } from '@cucumber/gherkin';
import { dirname, join } from 'node:path';
import { getDictionary, validateText } from 'cspell-lib';
import type { Background, Examples, Feature, Rule, Scenario, Step, TableRow, Tag } from '@cucumber/messages';
import { locales, mergePolicy, spellingLocale, type Policy, type Region, type SpellConfig } from './policies.js';
import type { Reporter } from './diagnostics.js';

const require = createRequire(import.meta.url);

type Exclusion = 'tables' | 'examples' | 'docStrings';
type Scope = Partial<Record<Region, Policy>> & { ignored?: Set<Exclusion> };
function tagPolicy(tags: readonly Tag[], file: string, reporter: Reporter, reportErrors = true): Scope {
  const result: Scope = {};
  function invalid(tag: Tag, message: string): void {
    if (!reportErrors) return;
    reporter.report({ path: file, line: tag.location.line, column: tag.location.column ?? 1, rule: 'spelling-option', severity: 'error', message: `${message}: ${tag.name}` });
  }
  for (const tag of tags) {
    if (tag.name.startsWith('@spellchecker-ignore')) {
      const match = /^@spellchecker-ignore=(.+)$/u.exec(tag.name);
      const ignored = match?.[1].split(',') ?? [];
      if (!ignored.length || ignored.some(item => !['tables', 'examples', 'docStrings'].includes(item))) {
        invalid(tag, 'invalid spelling exclusion');
      } else {
        result.ignored ??= new Set();
        for (const item of ignored) result.ignored.add(item as Exclusion);
      }
      continue;
    }
    if (tag.name.startsWith('@spellchecker-language')) {
      const match = /^@spellchecker-language=(.+)$/u.exec(tag.name);
      try {
        if (!match) throw new Error('missing language');
        spellingLocale(match[1]);
        result.examples = { locale: match[1] };
        result.docStrings = { locale: match[1] };
      } catch {
        invalid(tag, 'invalid spelling language');
      }
      continue;
    }
    if (tag.name.startsWith('@spellchecker-')) {
      invalid(tag, 'unknown spelling option');
      continue;
    }
    if (tag.name === '@spell-text' || tag.name.startsWith('@spell-text=')) {
      invalid(tag, 'unsupported spelling option');
      continue;
    }
    const match = /^@spell-(prose|content|quotes|tables|dataTables|examples|docStrings)=(.*)$/u.exec(tag.name);
    if (match) {
      const region = match[1] as Region;
      const values = match[2].split(',');
      try {
        if (values.some(value => !value)) throw new Error('invalid locale list');
        values.forEach(spellingLocale);
        result[region] = { locales: values };
      } catch {
        invalid(tag, 'invalid spelling locales');
      }
    }
  }
  return result;
}

function combine(base: Policy, region: Region, ...scopes: Scope[]): Policy {
  let result = { ...base };
  const apply = (policy?: Policy) => {
    if (!policy) return;
    result = mergePolicy(result, policy);
  };
  for (const scope of scopes) {
    if (['quotes', 'docStrings', 'dataTables', 'examples'].includes(region)) apply(scope.content);
    if (region === 'dataTables' || region === 'examples') apply(scope.tables);
    apply(scope[region]);
  }
  return result;
}

function isLanguageDictionary(name: string): boolean {
  const lower = name.toLowerCase();
  return ['english', 'german', 'british', 'american', 'british-english', 'american-english'].includes(lower)
    || Object.keys(dialects).some(dialect => dialect.toLowerCase() === lower)
    || Object.keys(locales).some(locale => locale.toLowerCase() === lower)
    || /^[a-z]{2,3}[-_](?:[a-z]{2}|[0-9]{3})$/iu.test(name);
}

function readWords(path: string): string[] {
  return readFileSync(path, 'utf8').split(/\r?\n/u).map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

type FixCandidate = { word: string; path?: string; location: string };
export class SpellingFixes {
  private candidates: FixCandidate[] = [];
  constructor(private reporter: Reporter) {}
  add(candidate: FixCandidate): void { this.candidates.push(candidate); }
  apply(): void {
    const groups = new Map<string, FixCandidate[]>();
    let missingDictionary = false;
    for (const candidate of this.candidates) {
      if (!candidate.path) {
        if (!candidate.path) missingDictionary = true;
        continue;
      }
      groups.set(candidate.path, [...(groups.get(candidate.path) ?? []), candidate]);
    }
    if (missingDictionary) this.reporter.report({ rule: 'missing-dictionary', severity: 'error', message: 'Cannot fix spelling without a custom dictionary.' });
    for (const [path, candidates] of groups) {
      try {
        const original = existsSync(path) ? readFileSync(path, 'utf8') : '';
        const newline = original.includes('\r\n') ? '\r\n' : '\n';
        const lines = original ? original.split(/\r?\n/u) : [];
        const endsWithNewline = /\r?\n$/u.test(original);
        if (endsWithNewline) lines.pop();
        const existing = new Set(lines.map(line => line.trim().toLocaleLowerCase()));
        const added: string[] = [];
        for (const word of [...new Set(candidates.map(candidate => candidate.word))].sort((a, b) => a.localeCompare(b))) {
          if (existing.has(word.toLocaleLowerCase()) || existing.has(`!${word.toLocaleLowerCase()}`)) continue;
          const index = lines.findIndex(line => line.trim() && !/^[#!]/u.test(line.trim()) && line.trim().localeCompare(word, undefined, { sensitivity: 'base' }) > 0);
          if (index >= 0) lines.splice(index, 0, word); else lines.push(word);
          existing.add(word.toLocaleLowerCase());
          added.push(word);
        }
        if (added.length) {
          writeFileSync(path, lines.join(newline) + (endsWithNewline || !original ? newline : ''), 'utf8');
          for (const word of added) this.reporter.fixed(`Added ${word} to ${path}`);
        }
      } catch (error) {
        this.reporter.report({ path, rule: 'dictionary-write', severity: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

export async function checkSpelling(feature: Feature | undefined, source: string, file: string, dictionaryDir: string | undefined, config: SpellConfig = {}, reporter: Reporter, fixes?: SpellingFixes, stepTableHeader = false): Promise<void> {
  if (!feature) return;
  const defaultLocale = spellingLocale(config.specification?.[feature.language] ?? config.dialects?.[feature.language] ?? feature.language);
  const lines = source.split(/\r?\n/u);
  const featureScope = tagPolicy(feature.tags, file, reporter, !fixes);
  const base: Policy = { locale: defaultLocale };
  const cache = new Map<string, { settings: Parameters<typeof getDictionary>[0]; dictionary: Awaited<ReturnType<typeof getDictionary>> }>();
  const directoryStat = dictionaryDir ? statSync(dictionaryDir) : undefined;
  const sharedFiles = dictionaryDir && directoryStat?.isDirectory()
    ? readdirSync(dictionaryDir, { withFileTypes: true })
      .filter(item => (item.isFile() || item.isSymbolicLink()) && item.name.endsWith('.dic') && !isLanguageDictionary(item.name.slice(0, -4)))
      .map(item => item.name).sort()
    : [];

  async function text(value: string, line: number, column: number, policy: Policy, positions?: number[]) {
    if (!value) return;
    const selectedLocales = (policy.locales ?? [policy.locale ?? defaultLocale]).map(spellingLocale);
    const key = JSON.stringify(selectedLocales);
    let entry = cache.get(key);
    if (!entry) {
      const definitions = selectedLocales.map(locale => {
        const info = locales[locale];
        return { name: locale, path: join(dirname(require.resolve(info.package)), info.file) };
      });
      const words: string[] = [];
      if (dictionaryDir && directoryStat?.isDirectory()) {
        for (const locale of selectedLocales) {
          const short = locales[locale].short;
          for (const name of [locale, ...(short ? [short] : [])]) {
            const wordFile = join(dictionaryDir, `${name}.dic`);
            if (existsSync(wordFile)) words.push(...readWords(wordFile));
          }
        }
        for (const sharedFile of sharedFiles) words.push(...readWords(join(dictionaryDir, sharedFile)));
      } else {
        if (dictionaryDir && selectedLocales.includes(defaultLocale)) words.push(...readWords(dictionaryDir));
      }
      const settings = { dictionaryDefinitions: definitions, dictionaries: selectedLocales, minWordLength: 2, words: words.filter(word => !word.startsWith('!')), flagWords: words.filter(word => word.startsWith('!')).map(word => word.slice(1)) };
      entry = { settings, dictionary: await getDictionary(settings) };
      cache.set(key, entry);
    }
    const normalized = value.replace(/’/gu, "'");
    const invalid = [...normalized.matchAll(/[\p{L}\p{M}]+(?:'[\p{L}\p{M}]+)+/gu)].filter(match => !entry!.dictionary.has(match[0]));
    function diagnostic(offset: number, word: string, forbidden = false) {
      const location = `${file}:${line}:${column + (positions?.[offset] ?? offset)}`;
      if (fixes && forbidden) return;
      if (fixes && !forbidden) {
        const destination = `${locales[defaultLocale].short ?? defaultLocale}.dic`;
        const path = dictionaryDir && directoryStat?.isDirectory() ? join(dictionaryDir, destination) : dictionaryDir;
        fixes.add({ location, word, path });
        return;
      }
      reporter.report({ path: file, line, column: column + (positions?.[offset] ?? offset), rule: forbidden ? 'forbidden-word' : 'unknown-word', severity: 'error', message: `${forbidden ? 'forbidden' : 'unknown'} word: ${word}`, word });
    }
    const issues = await validateText(normalized, entry.settings);
    for (const match of invalid) diagnostic(match.index, value.slice(match.index, match.index + match[0].length), issues.some(issue => issue.isFlagged && issue.offset >= match.index && issue.offset < match.index + match[0].length));
    for (const issue of issues) {
      if (invalid.some(match => issue.offset >= match.index && issue.offset < match.index + match[0].length)) continue;
      diagnostic(issue.offset, value.slice(issue.offset, issue.offset + issue.text.length), issue.isFlagged);
    }
  }
  async function textWithQuotes(value: string, line: number, column: number, policy: Policy, quotePolicy: Policy) {
    let offset = 0;
    for (const match of value.matchAll(/"(?:\\.|[^"\\])*"/gu)) {
      await text(value.slice(offset, match.index), line, column + offset, policy);
      await text(match[0], line, column + match.index, quotePolicy);
      offset = match.index + match[0].length;
    }
    await text(value.slice(offset), line, column + offset, policy);
  }
  async function header(node: Feature | Rule | Scenario | Background | Examples, policy: Policy, prosePolicy: Policy, quotePolicy: Policy) {
    const line = node.location.line;
    const nameColumn = lines[line - 1].indexOf(node.name, (node.location.column ?? 1) - 1 + node.keyword.length + 1);
    if (node.name) await textWithQuotes(node.name, line, nameColumn + 1, policy, quotePolicy);
    let current = line;
    const parts: { value: string; line: number; column: number }[] = [];
    for (const description of node.description.split('\n')) {
      if (!description.trim()) continue;
      while (++current <= lines.length) {
        if (lines[current - 1].trimStart().startsWith('#')) continue;
        const pos = lines[current - 1].indexOf(description.trim());
        if (pos >= 0) { parts.push({ value: description.trim(), line: current, column: pos + 1 }); break; }
      }
    }
    const combined = parts.map(part => part.value).join('\n');
    const quoted = [...combined.matchAll(/"(?:\\.|[^"\\])*"/gu)]
      .map(match => ({ start: match.index, end: match.index + match[0].length }));
    let lineStart = 0;
    for (const part of parts) {
      const lineEnd = lineStart + part.value.length;
      let offset = 0;
      for (const span of quoted) {
        const start = Math.max(span.start, lineStart) - lineStart;
        const end = Math.min(span.end, lineEnd) - lineStart;
        if (start >= end) continue;
        await text(part.value.slice(offset, start), part.line, part.column + offset, prosePolicy);
        await text(part.value.slice(start, end), part.line, part.column + start, quotePolicy);
        offset = end;
      }
      await text(part.value.slice(offset), part.line, part.column + offset, prosePolicy);
      lineStart = lineEnd + 1;
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
  function ignored(scopes: Scope[], region: Exclusion): boolean {
    return scopes.some(scope => scope.ignored?.has(region));
  }
  async function scenario(node: Scenario | Background, parent: Scope[]) {
    const scopes = 'tags' in node ? [...parent, tagPolicy(node.tags, file, reporter, !fixes)] : parent;
    const textPolicy = base;
    await header(node, textPolicy, combine(base, 'prose', config, ...scopes), combine(base, 'quotes', config, ...scopes));
    for (const step of node.steps) {
      const line = step.location.line;
      const pos = lines[line - 1].indexOf(step.text, (step.location.column ?? 1) - 1 + step.keyword.length);
      await textWithQuotes(step.text, line, pos + 1, textPolicy, combine(base, 'quotes', config, ...scopes));
      if (step.dataTable && !ignored(scopes, 'tables')) for (const [index, item] of step.dataTable.rows.entries()) {
        await row(item, stepTableHeader && index === 0 ? base : combine(base, 'dataTables', config, ...scopes));
      }
      if (step.docString && !ignored(scopes, 'docStrings')) {
        const doc = step.docString;
        const language = /^language[= ](.+)$/u.exec(doc.mediaType ?? '');
        const mediaType = doc.mediaType?.toLowerCase();
        const mode = language || !mediaType ? 'text' : config.docStringTypes?.[mediaType] ?? (mediaType === 'json' || mediaType === 'application/json' ? 'json' : 'text');
        if (mode === 'ignore') continue;
        const docPolicy = combine(base, 'docStrings', config, ...scopes);
        if (language) { delete docPolicy.locales; docPolicy.locale = language[1]; }
        for (const [i, content] of doc.content.split('\n').entries()) {
          const sourceLine = doc.location.line + i + 1;
          const raw = lines[sourceLine - 1] ?? '';
          const indent = raw.length - raw.trimStart().length;
          const start = Math.min(indent, (doc.location.column ?? 1) - 1);
          const positions: number[] = [];
          let index = start;
          for (const character of content.split('')) {
            if (raw[index] !== character && raw[index] === '\\' && raw[index + 1] === character) index++;
            positions.push(index - start);
            index++;
          }
          if (mode === 'json') {
            for (const match of content.matchAll(/"(?:\\.|[^"\\])*"/gu)) {
              let decoded = '';
              const decodedPositions: number[] = [];
              const body = match[0].slice(1, -1);
              for (let i = 0; i < body.length;) {
                const offset = i;
                let part = body[i++];
                if (part === '\\' && i < body.length) {
                  part += body[i++];
                  if (part === '\\u') { part += body.slice(i, i + 4); i += 4; }
                  try { part = JSON.parse(`"${part}"`) as string; } catch { continue; }
                }
                decoded += part;
                for (let j = 0; j < part.length; j++) decodedPositions.push(positions[match.index + 1 + offset] ?? match.index + 1 + offset);
              }
              await text(decoded, sourceLine, start + 1, docPolicy, decodedPositions);
            }
          } else if (content) await text(content, sourceLine, start + 1, docPolicy, positions);
        }
      }
    }
    if ('examples' in node) for (const example of node.examples) {
      const exampleScopes = [...scopes, tagPolicy(example.tags, file, reporter, !fixes)];
      await header(example, textPolicy, combine(base, 'prose', config, ...exampleScopes), combine(base, 'quotes', config, ...exampleScopes));
      if (example.tableHeader) await row(example.tableHeader, base);
      if (!ignored(exampleScopes, 'examples')) for (const item of example.tableBody ?? []) await row(item, combine(base, 'examples', config, ...exampleScopes));
    }
  }
  async function rule(node: Rule, parent: Scope[]) {
    const scopes = [...parent, tagPolicy(node.tags, file, reporter, !fixes)];
    await header(node, base, combine(base, 'prose', config, ...scopes), combine(base, 'quotes', config, ...scopes));
    for (const child of node.children) {
      if (child.scenario) await scenario(child.scenario, scopes);
      if (child.background) await scenario(child.background, scopes);
    }
  }
  await header(feature, base, combine(base, 'prose', config, featureScope), combine(base, 'quotes', config, featureScope));
  for (const child of feature.children) {
    if (child.rule) await rule(child.rule, [featureScope]);
    if (child.scenario) await scenario(child.scenario, [featureScope]);
    if (child.background) await scenario(child.background, [featureScope]);
  }
}
