import { createRequire } from 'node:module';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getDictionary, validateText } from 'cspell-lib';
import type { Background, Examples, Feature, Rule, Scenario, Step } from '@cucumber/messages';

const require = createRequire(import.meta.url);
const dictionaryPath = join(dirname(require.resolve('@cspell/dict-en_us')), 'en_US.trie.gz');

export function productWords(path: string | undefined): string[] {
  if (!path) return [];
  const stat = statSync(path);
  const wordFile = stat.isDirectory() ? join(path, 'en-US.dic') : path;
  if (stat.isDirectory() && !existsSync(wordFile)) return [];
  return readFileSync(wordFile, 'utf8').split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('!'));
}

export async function checkSpelling(feature: Feature | undefined, source: string, file: string, words: string[]): Promise<void> {
  if (!feature) return;
  if (feature.language !== 'en') throw new Error(`unsupported spelling language: ${feature.language}`);
  const lines = source.split(/\r?\n/u);
  const settings = { dictionaryDefinitions: [{ name: 'en-us', path: dictionaryPath }], dictionaries: ['en-us'], minWordLength: 2, words };
  const dictionary = await getDictionary(settings);
  async function text(value: string, line: number, column: number) {
    const normalized = value.replace(/’/gu, "'");
    const invalidContractions = [...normalized.matchAll(/[\p{L}\p{M}]+(?:'[\p{L}\p{M}]+)+/gu)]
      .filter(match => !dictionary.has(match[0]));
    for (const match of invalidContractions) {
      console.error(`${file}:${line}:${column + match.index}: unknown word: ${value.slice(match.index, match.index + match[0].length)}`);
      process.exitCode = 1;
    }
    for (const issue of await validateText(normalized, settings)) {
      if (invalidContractions.some(match => issue.offset >= match.index && issue.offset < match.index + match[0].length)) continue;
      console.error(`${file}:${line}:${column + issue.offset}: unknown word: ${value.slice(issue.offset, issue.offset + issue.text.length)}`);
      process.exitCode = 1;
    }
  }
  async function header(node: Feature | Rule | Scenario | Background | Examples) {
    const line = node.location.line;
    const nameColumn = lines[line - 1].indexOf(node.name, (node.location.column ?? 1) - 1 + node.keyword.length + 1);
    if (node.name) await text(node.name, line, nameColumn + 1);
    let current = line;
    for (const description of node.description.split('\n')) {
      if (!description.trim()) continue;
      while (++current <= lines.length) {
        if (lines[current - 1].trimStart().startsWith('#')) continue;
        const pos = lines[current - 1].indexOf(description.trim());
        if (pos >= 0) { await text(description.trim(), current, pos + 1); break; }
      }
    }
  }
  async function step(node: Step) {
    const line = node.location.line;
    const pos = lines[line - 1].indexOf(node.text, (node.location.column ?? 1) - 1 + node.keyword.length);
    await text(node.text, line, pos + 1);
  }
  async function scenario(node: Scenario | Background) {
    await header(node);
    for (const item of node.steps) await step(item);
    if ('examples' in node) for (const example of node.examples) await header(example);
  }
  async function rule(node: Rule) {
    await header(node);
    for (const child of node.children) {
      if (child.scenario) await scenario(child.scenario);
      if (child.background) await scenario(child.background);
    }
  }
  await header(feature);
  for (const child of feature.children) {
    if (child.rule) await rule(child.rule);
    if (child.scenario) await scenario(child.scenario);
    if (child.background) await scenario(child.background);
  }
}
