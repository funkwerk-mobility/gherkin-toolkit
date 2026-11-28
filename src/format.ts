import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator, type GherkinDocument } from '@cucumber/messages';

export type TagLayout = 'preserve' | 'one-per-line' | 'single-line';
type Node = { location: { line: number }; description?: string; tags?: Node[]; children?: { rule?: Node; background?: Node; scenario?: Node }[]; steps?: Node[]; examples?: Node[]; dataTable?: { rows: Node[] }; tableHeader?: Node; tableBody?: Node[]; docString?: { location: { line: number }; delimiter: string; content: string }; };

type Entry = { indent: number; section?: boolean; tag?: boolean; table?: number; doc?: boolean };

export function formatFeature(source: string, document: GherkinDocument, layout: TagLayout): string {
  if (!document.feature) return source;
  const lines = source.replace(/\r\n/gu, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const entries = new Map<number, Entry>();
  let tableId = 0;
  const descriptions = new Set<number>();
  function tags(nodes: Node[] | undefined, indent: number): void {
    for (const tag of nodes ?? []) entries.set(tag.location.line, { indent, tag: true });
  }
  function table(rows: Node[], indent: number): void {
    tableId++;
    for (const row of rows) entries.set(row.location.line, { indent, table: tableId });
  }
  function section(node: Node, indent: number, spaced: boolean): void {
    entries.set(node.location.line, { indent, section: spaced });
    if (node.description) for (let n = 1; n <= node.description.split('\n').length; n++) descriptions.add(node.location.line + n);
    tags(node.tags, indent);
    for (const step of node.steps ?? []) {
      entries.set(step.location.line, { indent: indent + 2 });
      if (step.dataTable) table(step.dataTable.rows, indent + 4);
      if (step.docString) {
        const start = step.docString.location.line;
        let end = start;
        while (end < lines.length && lines[end].trim() !== step.docString.delimiter) end++;
        for (let line = start; line <= end + 1 && line <= lines.length; line++) entries.set(line, { indent: indent + 4, doc: true });
      }
    }
    for (const example of node.examples ?? []) {
      section(example, indent + 2, true);
      if (example.tableHeader) table([example.tableHeader, ...(example.tableBody ?? [])], indent + 4);
    }
    for (const child of node.children ?? []) {
      const value = child.rule ?? child.background ?? child.scenario;
      if (value) section(value, indent + 2, true);
    }
  }
  section(document.feature as unknown as Node, 0, false);
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
      result.push(' '.repeat(entry.indent) + raw.slice(Math.min(docOriginalIndent, raw.match(/^\s*/u)?.[0].length ?? 0)));
      continue;
    }
    if (!raw.trim()) { if (descriptions.has(i + 1) || (result.length && result.at(-1) !== '')) result.push(''); continue; }
    if (!entry && !raw.trimStart().startsWith('#')) { result.push(raw); continue; }
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
    if (entry?.table) { const parts = tableParts(raw); text = `|${parts.values.map((value, index) => ` ${value.padEnd(widths.get(entry.table!)![index])} `).join('|')}|${parts.suffix}`; }
    if (entry?.tag) { const match = /^(.*?)(\s+#.*)?$/u.exec(text)!; text = match[1].trim().replace(/\s+/gu, ' ') + (match[2] ?? ''); }
    if (entry?.tag && layout === 'one-per-line') {
      const [tagText, ...comment] = text.split(/\s+#/u);
      const names = tagText.trim().split(/\s+/u);
      names.forEach((tag, index) => result.push(' '.repeat(currentIndent) + tag + (index === names.length - 1 && comment.length ? ' #' + comment.join(' #') : '')));
    } else if (entry?.tag && layout === 'single-line' && result.length && result.at(-1)!.trimStart().startsWith('@') && !result.at(-1)!.includes('#')) {
      result[result.length - 1] += ' ' + text;
    } else result.push(' '.repeat(currentIndent) + text);
  }
  while (result.at(-1) === '') result.pop();
  const formatted = result.join('\n') + '\n';
  const parser = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher());
  function semantic(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(semantic);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['location', 'id', 'comments'].includes(key)).map(([key, v]) => [key, semantic(v)]));
    return value;
  }
  try {
    if (JSON.stringify(semantic(document.feature)) !== JSON.stringify(semantic(parser.parse(formatted).feature))) throw new Error('formatting would change Gherkin meaning');
  } catch { throw new Error('Cannot safely format this feature without changing its meaning'); }
  return formatted;
}
