import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator, type GherkinDocument } from '@cucumber/messages';

export class UnsafeFormattingError extends Error {
  constructor(message: string, public readonly formatted: string) { super(message); }
}

export type TagLayout = 'preserve' | 'one-per-line' | 'single-line';
type Node = { location: { line: number }; description?: string; tags?: Node[]; children?: { rule?: Node; background?: Node; scenario?: Node }[]; steps?: Node[]; examples?: Node[]; dataTable?: { rows: Node[] }; tableHeader?: Node; tableBody?: Node[]; docString?: { location: { line: number }; delimiter: string; content: string }; };

type Entry = { indent: number; header?: boolean; section?: boolean; tag?: boolean; table?: number; doc?: boolean };

export function formatFeature(source: string, document: GherkinDocument, layout: TagLayout, options: { printWidth: number; indentWidth: number; useTabs: boolean } = { printWidth: 120, indentWidth: 2, useTabs: false }): string {
  const indent = (level: number) => (options.useTabs ? '\t' : ' '.repeat(options.indentWidth)).repeat(level);
  const displayWidth = (line: string) => [...line].reduce((width, char) => char === '\t' ? width + options.indentWidth - width % options.indentWidth : width + 1, 0);
  function spaces(value: string): string {
    let quote = ''; let escaped = false; let result = '';
    for (const char of value) {
      if (!escaped && (char === '"' || char === '“' || char === '”' || char === "'" || char === '‘' || char === '’')) {
        if (!quote && (char === '"' || char === '“' || char === '‘' || (char === "'" && (!result || /[\s([{=:]/u.test(result.at(-1)!))))) quote = char === '“' ? '”' : char === '‘' ? '’' : char;
        else if (char === quote) quote = '';
      }
      if (!quote && /[ \t]/u.test(char) && result.endsWith(' ')) continue;
      result += !quote && char === '\t' ? ' ' : char;
      escaped = char === '\\' && !escaped;
    }
    return result;
  }
  function words(value: string): string[] {
    const result: string[] = [];
    let word = ''; let quote = ''; let escaped = false;
    for (const char of value) {
      if (!quote && /\s/u.test(char)) {
        if (word) { result.push(word); word = ''; }
        continue;
      }
      if (!escaped && (char === '"' || char === '“' || char === '‘' || char === "'" || char === '”' || char === '’')) {
        if (!quote && (char === '"' || char === '“' || char === '‘' || (char === "'" && (!word || /[([{=:]/u.test(word.at(-1)!))))) quote = char === '“' ? '”' : char === '‘' ? '’' : char;
        else if (quote === char) quote = '';
      }
      word += char;
      escaped = char === '\\' && !escaped;
    }
    if (word) result.push(word);
    return result;
  }
  if (!document.feature) return source;
  const lines = source.replace(/\r\n/gu, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const entries = new Map<number, Entry>();
  let tableId = 0;
  const descriptions = new Map<number, number>();
  const descriptionSections: { node: Node; indent: number }[] = [];
  function tags(nodes: Node[] | undefined, indent: number): void {
    for (const tag of nodes ?? []) entries.set(tag.location.line, { indent, tag: true });
  }
  function table(rows: Node[], indent: number): void {
    tableId++;
    for (const row of rows) entries.set(row.location.line, { indent, table: tableId });
  }
  function section(node: Node, indent: number, spaced: boolean): void {
    entries.set(node.location.line, { indent, header: true, section: spaced });
    if (node.description) descriptionSections.push({ node, indent: indent + 1 });
    tags(node.tags, indent);
    for (const step of node.steps ?? []) {
      entries.set(step.location.line, { indent: indent + 1 });
      if (step.dataTable) table(step.dataTable.rows, indent + 2);
      if (step.docString) {
        const start = step.docString.location.line;
        let end = start;
        while (end < lines.length && lines[end].trim() !== step.docString.delimiter) end++;
        for (let line = start; line <= end + 1 && line <= lines.length; line++) entries.set(line, { indent: indent + 2, doc: true });
      }
    }
    for (const example of node.examples ?? []) {
      section(example, indent + 1, true);
      if (example.tableHeader) table([example.tableHeader, ...(example.tableBody ?? [])], indent + 2);
    }
    for (const child of node.children ?? []) {
      const value = child.rule ?? child.background ?? child.scenario;
      if (value) section(value, indent + 1, true);
    }
  }
  section(document.feature as unknown as Node, 0, false);
  for (const { node, indent } of descriptionSections) {
    let remaining = node.description!.split('\n').length;
    let started = false;
    for (let line = node.location.line + 1; line <= lines.length && remaining > 0; line++) {
      if (entries.has(line)) break;
      const text = lines[line - 1].trim();
      if (text.startsWith('#')) continue;
      if (!started && !text) continue;
      started = true;
      descriptions.set(line, indent);
      remaining--;
    }
  }
  const widths = new Map<number, number[]>();
  function tableParts(line: string): { values: string[]; suffix: string } {
    const pieces: string[] = []; let cell = ''; let escaped = false;
    const text = line.trim();
    let end = text.length - 1;
    while (end > 0) {
      if (text[end] === '|') { let slashes = 0; for (let p = end - 1; p >= 0 && text[p] === '\\'; p--) slashes++; if (slashes % 2 === 0) break; }
      end--;
    }
    for (const char of text.slice(1, end)) {
      if (char === '|' && !escaped) { pieces.push(cell.trim()); cell = ''; }
      else { cell += char; if (char === '\\') escaped = !escaped; else escaped = false; }
    }
    pieces.push(cell.trim()); return { values: pieces, suffix: text.slice(end + 1) };
  }
  for (const [line, entry] of entries) if (entry.table) {
    const widthsForTable = widths.get(entry.table) ?? [];
    tableParts(lines[line - 1]).values.forEach((value, i) => { widthsForTable[i] = Math.max(widthsForTable[i] ?? 0, value.length); });
    widths.set(entry.table, widthsForTable);
  }
  const result: string[] = [];
  let currentIndent = 0; let docOriginalIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const entry = entries.get(i + 1);
    const raw = lines[i];
    if (entry?.doc) {
      if (!entries.get(i)?.doc) docOriginalIndent = raw.match(/^\s*/u)?.[0].length ?? 0;
      result.push(indent(entry.indent) + raw.slice(Math.min(docOriginalIndent, raw.match(/^\s*/u)?.[0].length ?? 0)));
      continue;
    }
    if (!raw.trim()) { if (result.length && result.at(-1) !== '') result.push(''); continue; }
    if (!entry && !raw.trimStart().startsWith('#')) {
      if (descriptions.has(i + 1)) {
        const prefix = indent(descriptions.get(i + 1)!);
        let line = prefix;
        for (const word of words(spaces(raw.trim()))) {
          const next = line === prefix ? prefix + word : line + ' ' + word;
          if (line !== prefix && displayWidth(next) > options.printWidth) { result.push(line); line = prefix + word; } else line = next;
        }
        result.push(line);
      } else result.push(raw);
      continue;
    }
    if (entry) currentIndent = entry.indent;
    else if (raw.trimStart().startsWith('#')) {
      const next = [...entries.entries()].find(([line]) => line > i + 1);
      if (next) currentIndent = next[1].indent;
    }
    if (entry?.section) {
      let insertion = result.length;
      while (insertion > 0 && (result[insertion - 1].trimStart().startsWith('@') || result[insertion - 1].trimStart().startsWith('#'))) insertion--;
      if (insertion > 0 && result[insertion - 1] !== '') result.splice(insertion, 0, '');
    }
    let text = raw.trim();
    if ((entry && !entry.table && !entry.tag) || (!entry && text.startsWith('#'))) text = spaces(text);
    if (entry?.header) text = text.replace(/^([^:]+:)[ \t]*(?=\S)/u, '$1 ');
    if (entry?.table) { const parts = tableParts(raw); text = `|${parts.values.map((value, index) => ` ${value.padEnd(widths.get(entry.table!)![index])} `).join('|')}|${parts.suffix}`; }
    if (entry?.tag) { const match = /^(.*?)(\s+#.*)?$/u.exec(text)!; text = match[1].trim().replace(/\s+/gu, ' ') + (match[2] ?? ''); }
    if (entry?.tag) {
      const [tagText, ...comment] = text.split(/\s+#/u);
      const names = tagText.trim().split(/\s+/u);
      const suffix = comment.length ? ' #' + spaces(comment.join(' #')) : '';
      if (layout === 'one-per-line') {
        names.forEach((tag, index) => result.push(indent(currentIndent) + tag + (index === names.length - 1 ? suffix : '')));
      } else {
        let current = '';
        if (layout === 'single-line' && result.length && result.at(-1)!.trimStart().startsWith('@') && !result.at(-1)!.includes('#')) current = result.pop()!;
        for (const name of names) {
          const next = current ? current + ' ' + name : indent(currentIndent) + name;
          if (current && displayWidth(next) > options.printWidth) { result.push(current); current = indent(currentIndent) + name; }
          else current = next;
        }
        result.push(current + suffix);
      }
    } else result.push(indent(currentIndent) + text);
  }
  while (result.at(-1) === '') result.pop();
  const formatted = result.join('\n') + '\n';
  const parser = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher());
  function semantic(value: unknown, key = ''): unknown {
    if (typeof value === 'string' && key === 'description') return spaces(value.replace(/\r?\n[ \t]*/gu, ' ')).trim();
    if (typeof value === 'string' && ['name', 'text'].includes(key)) return spaces(value).trim();
    if (Array.isArray(value)) return value.map(item => semantic(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['location', 'id', 'comments'].includes(key)).map(([key, v]) => [key, semantic(v, key)]));
    return value;
  }
  let parsed: GherkinDocument;
  try { parsed = parser.parse(formatted); }
  catch { throw new UnsafeFormattingError('Formatted output would not parse; first proposed change shown', formatted); }
  if (JSON.stringify(semantic(document.feature)) !== JSON.stringify(semantic(parsed.feature))) {
    throw new UnsafeFormattingError('Formatting would change parsed Gherkin content; first proposed change shown', formatted);
  }
  return formatted;
}
