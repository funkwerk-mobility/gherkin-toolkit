# Gherkin Toolkit

Gherkin Toolkit is an early-stage command-line tool for checking Gherkin feature files. It requires Node.js 22.18 or newer.

```sh
npm install
npm run build
node dist/cli.js check features/ path/to/example.feature
```

Directories are searched recursively for `.feature` files. Pass individual paths to check a selection; shell glob expansion is supported. Valid files produce no output. Syntax errors are printed with file, line and column and cause a nonzero exit status. Running `check` without paths succeeds silently. Add `--verbose` to show each check as it starts for each file, including the syntax parse required before spelling.

For development, run `npm run typecheck` and `npm test` (Vitest).

## Configuration

Pass a YAML file explicitly with `--config`:

```yaml
extends: ../shared/cuke.yml
checks:
  - syntax
```

`extends` is optional and resolved relative to the file that declares it. A `checks` list replaces the inherited list; an empty list disables all checks. Without a configuration, syntax checking is enabled. The available checks are `syntax` and `spell`.

Use `cuke check --config product/cuke.yml --only syntax features/` to override the configured list for one run. Command-line paths are relative to the working directory. `--only` accepts a comma-separated list or may be repeated. Invalid configurations, unsupported check names and missing option values cause an error. No configuration file is selected automatically.

## Spelling

Feature, rule, scenario and Examples tags support `@spellchecker-ignore=tables,examples,docStrings`. Exclusions accumulate in nested scopes: `tables` skips step data tables, `examples` skips Examples values (not headers), and `docStrings` skips docstring contents. Prose and steps continue to be checked. An Examples tag applies only to that Examples block. Invalid options produce an error.

The tag `@spellchecker-language=de` changes the language for Examples values and docstrings in its scope; it does not change steps, step tables or Examples headers. An Examples tag affects that block only. A docstring can set its own language with an opening delimiter such as `"""language=de`. Supported values are `en`, `en-US`, `en-GB`, `de` and `de-DE`. Other typed docstrings are handled separately.

Enable spelling with `checks: [syntax, spell]` in YAML, or run it on its own:

```sh
cuke check --only spell --dictionary spellchecker/ features/
```

Spelling supports US English (`en-US`), British English (`en-GB`) and German (`de-DE`). By default the Gherkin dialects `en` and `de` map to `en-US` and `de-DE`. Prose, steps, data tables, Examples headers and values, and untyped docstrings are checked. Typed docstrings are deferred. Syntax is checked before spelling even when only spelling is selected.

A product dictionary directory contains UTF-8 word lists with one word per line; blank lines and lines starting with `#` are ignored. Locale-specific files are selected only for their locale: `en-US.dic` or `en.dic` for US English, `en-GB.dic` for British English, and `de-DE.dic` or `de.dic` for German. Both corresponding filenames are loaded if present. These files are optional. A direct `--dictionary` file is applied only to the feature's default locale. Forbidden words are planned separately.

All non-language `.dic` files in the directory, such as `places.dic` and `terms.dic`, are used in every spelling region. Filenames matching Gherkin dialects, locale codes such as `en-GB`, and common language names such as `english` and `german` are treated as language dictionaries and are not shared. Use language-code names for locale dictionaries. For example:

```yaml
checks: [syntax, spell]
dictionary: ./spellchecker
spelling:
  dialects:
    en: en-US
    de: de-DE
  tables:
    locale: de-DE
  examples:
    locale: en-GB
  docStrings:
    locale: en-GB
```

`text` covers feature, rule, scenario and Examples prose and steps; `dataTables` covers step tables, `examples` covers Examples values, and `docStrings` covers untyped docstrings. The broad `tables` policy applies to both data tables and Examples values; `dataTables` or `examples` can override it. Examples headers use the feature dialect's mapped locale, with the shared dictionaries.

Locale overrides can also be attached to a feature, rule or scenario with tags such as `@spell-tables=de`, `@spell-dataTables=en-US`, `@spell-examples=en-GB`, `@spell-docStrings=en-GB` or `@spell-text=en-US`. They affect their scope and descendants. For each scope, the specific region overrides `tables`; a child scope overrides its parent, even when the parent is more specific. Thus precedence is global, then feature, rule and scenario; within each scope it is broad tables followed by the specific region. A tag changes the locale; shared dictionaries still apply.

Shared configuration inheritance merges spelling settings by region and property. Existing `dictionaries` lists are validated if specified, but do not restrict the automatically loaded shared dictionaries. A YAML `dictionary` path is relative to the file declaring it; `--dictionary` overrides it relative to the working directory. Only syntax checking is enabled without a configuration.

The dictionaries have separate licenses; see [third-party dictionary notices](THIRD_PARTY_NOTICES.md) for licenses, source locations and distribution notes.
