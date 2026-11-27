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

export type Policy = { locale?: string; dictionaries?: string[] };
export type Region = 'text' | 'tables' | 'dataTables' | 'examples' | 'docStrings';
export type SpellConfig = { dialects?: Record<string, string> } & Partial<Record<Region, Policy>>;

export function parseSpelling(value: unknown, source: string): SpellConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${source}: spelling must be a mapping`);
  const result: SpellConfig = {};
  for (const [key, setting] of Object.entries(value)) {
    if (key === 'dialects') {
      if (!setting || typeof setting !== 'object' || Array.isArray(setting) || Object.values(setting).some(v => typeof v !== 'string' || !v)) {
        throw new Error(`${source}: spelling.dialects must map dialects to locales`);
      }
      for (const locale of Object.values(setting)) spellingLocale(locale as string);
      result.dialects = setting as Record<string, string>;
      continue;
    }
    if (!['text', 'tables', 'dataTables', 'examples', 'docStrings'].includes(key)) throw new Error(`${source}: unknown spelling setting: ${key}`);
    if (!setting || typeof setting !== 'object' || Array.isArray(setting)) throw new Error(`${source}: spelling.${key} must be a mapping`);
    const policy = setting as Record<string, unknown>;
    if (Object.keys(policy).some(k => k !== 'locale' && k !== 'dictionaries')) throw new Error(`${source}: unknown spelling.${key} setting`);
    if (policy.locale !== undefined && (typeof policy.locale !== 'string' || !policy.locale)) throw new Error(`${source}: spelling.${key}.locale must be a locale`);
    if (policy.dictionaries !== undefined && (!Array.isArray(policy.dictionaries) || policy.dictionaries.some(v => typeof v !== 'string' || !/^[\p{L}\p{N}_-]+$/u.test(v)))) throw new Error(`${source}: spelling.${key}.dictionaries must be a list of dictionary names`);
    if (typeof policy.locale === 'string') spellingLocale(policy.locale);
    result[key as Region] = policy as Policy;
  }
  return result;
}

export function mergeSpelling(base: SpellConfig = {}, override: SpellConfig = {}): SpellConfig {
  const result: SpellConfig = { dialects: { ...base.dialects, ...override.dialects } };
  for (const region of ['text', 'tables', 'dataTables', 'examples', 'docStrings'] as const) {
    if (base[region] || override[region]) result[region] = { ...base[region], ...override[region] };
  }
  return result;
}
