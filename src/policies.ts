export const locales: Record<string, { package: string; file: string; short?: string }> = {
  'en-US': { package: '@cspell/dict-en_us', file: 'en_US.trie.gz', short: 'en' },
  'en-GB': { package: '@cspell/dict-en-gb', file: 'en_GB.trie.gz' },
  'de-DE': { package: '@cspell/dict-de-de', file: 'de_DE.trie.gz', short: 'de' },
};
const aliases: Record<string, string> = { en: 'en-US', de: 'de-DE' };

export function spellingLocale(value: string): string {
  const locale = aliases[value] ?? value;
  if (!Object.hasOwn(locales, locale)) throw new Error(`unsupported spelling language: ${value}`);
  return locale;
}

export type Policy = { locale?: string; locales?: string[] };
export type Region = 'prose' | 'content' | 'quotes' | 'tables' | 'dataTables' | 'examples' | 'docStrings';
export type SnippetMode = 'json' | 'text' | 'ignore';
export type SpellConfig = { dialects?: Record<string, string>; specification?: Record<string, string>; docStringTypes?: Record<string, SnippetMode> } & Partial<Record<Region, Policy>>;

export function parseSpelling(value: unknown, source: string): SpellConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${source}: spell must be a mapping`);
  const result: SpellConfig = {};
  for (const [key, setting] of Object.entries(value)) {
    if (key === 'docStringTypes') {
      if (!setting || typeof setting !== 'object' || Array.isArray(setting) || Object.entries(setting).some(([name, mode]) => !name || name !== name.toLowerCase() || !['json', 'text', 'ignore'].includes(mode as string))) throw new Error(`${source}: spell.docStringTypes must map lowercase content types to json, text or ignore`);
      result.docStringTypes = setting as Record<string, SnippetMode>;
      continue;
    }
    if (key === 'dialects' || key === 'specification') {
      if (!setting || typeof setting !== 'object' || Array.isArray(setting) || Object.values(setting).some(v => typeof v !== 'string' || !v)) {
        throw new Error(`${source}: spell.${key} must map keyword languages to single locales`);
      }
      for (const locale of Object.values(setting)) spellingLocale(locale as string);
      result[key] = setting as Record<string, string>;
      continue;
    }
    if (!['prose', 'content', 'quotes', 'tables', 'dataTables', 'examples', 'docStrings'].includes(key)) throw new Error(`${source}: unknown spell setting: ${key}`);
    if (!setting || typeof setting !== 'object' || Array.isArray(setting)) throw new Error(`${source}: spell.${key} must be a mapping`);
    const policy = setting as Record<string, unknown>;
    if (Object.keys(policy).some(k => k !== 'locale' && k !== 'locales')) throw new Error(`${source}: unknown spell.${key} setting`);
    if (policy.locale !== undefined && (typeof policy.locale !== 'string' || !policy.locale)) throw new Error(`${source}: spell.${key}.locale must be a locale`);
    if (policy.locales !== undefined && (!Array.isArray(policy.locales) || !policy.locales.length || policy.locales.some(v => typeof v !== 'string' || !v))) throw new Error(`${source}: spell.${key}.locales must be a nonempty list of locales`);
    if (policy.locale !== undefined && policy.locales !== undefined) throw new Error(`${source}: spell.${key} cannot specify both locale and locales`);
    if (Array.isArray(policy.locales)) for (const locale of policy.locales) spellingLocale(locale as string);
    if (typeof policy.locale === 'string') spellingLocale(policy.locale);
    result[key as Region] = policy as Policy;
  }
  return result;
}

export function mergePolicy(base: Policy = {}, override: Policy = {}): Policy {
  const inherited = { ...base };
  if (override.locale !== undefined) delete inherited.locales;
  if (override.locales !== undefined) delete inherited.locale;
  return { ...inherited, ...override };
}

export function mergeSpelling(base: SpellConfig = {}, override: SpellConfig = {}): SpellConfig {
  const result: SpellConfig = { dialects: { ...base.dialects, ...override.dialects }, specification: { ...base.specification, ...override.specification } };
  if (base.docStringTypes || override.docStringTypes) result.docStringTypes = { ...base.docStringTypes, ...override.docStringTypes };
  for (const region of ['prose', 'content', 'quotes', 'tables', 'dataTables', 'examples', 'docStrings'] as const) {
    if (base[region] || override[region]) {
      result[region] = mergePolicy(base[region], override[region]);
    }
  }
  return result;
}
