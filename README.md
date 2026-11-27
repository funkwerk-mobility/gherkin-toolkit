# Gherkin Toolkit

Gherkin Toolkit is an early-stage command-line tool for checking Gherkin feature files. It requires Node.js 22.18 or newer.

```sh
npm install
npm run build
node dist/cli.js check features/ path/to/example.feature
```

Directories are searched recursively for `.feature` files. Pass individual paths to check a selection; shell glob expansion is supported. Valid files produce no output. Syntax errors are printed with file, line and column and cause a nonzero exit status. Running `check` without paths succeeds silently. Add `--verbose` to show each check as it starts for each file, including parsing before the selected checks.

For development, run `npm run typecheck` and `npm test` (Vitest).

## Configuration

Pass a YAML file explicitly with `--config`:

```yaml
extends: ../shared/cuke.yml
checks:
  - spell
```

`extends` is optional and resolved relative to the file that declares it. A `checks` list replaces the inherited list; an empty list disables all optional checks. Parsing still runs for every selected file. Without a configuration, spelling is enabled. The available check is `spell`.

Use `cuke check --config product/cuke.yml --only spell features/` to override the configured list for one run. Command-line paths are relative to the working directory. `--only` accepts a comma-separated list or may be repeated. Invalid configurations, unsupported check names and missing option values cause an error. No configuration file is selected automatically.

## Spelling

Feature, rule, scenario and Examples tags support `@spellchecker-ignore=tables,examples,docStrings`. Exclusions accumulate in nested scopes: `tables` skips step data tables, `examples` skips Examples values (not headers), and `docStrings` skips docstring contents. Prose and steps continue to be checked. An Examples tag applies only to that Examples block. Invalid options produce an error.

The tag `@spellchecker-language=de` changes the language for Examples values and docstrings in its scope; it does not change steps, step tables or Examples headers. An Examples tag affects that block only. A docstring can set its own language with an opening delimiter such as `"""language=de`. Supported values are `en`, `en-US`, `en-GB`, `de` and `de-DE`. Other typed docstrings are handled separately.

Enable spelling with `checks: [spell]` in YAML, or run it on its own:

```sh
cuke check --only spell --dictionary spellchecker/ features/
```

Spelling supports US English (`en-US`), British English (`en-GB`) and German (`de-DE`). By default the Gherkin dialects `en` and `de` map to `en-US` and `de-DE`. Prose, steps, data tables, Examples headers and values, and docstrings are checked. Syntax is checked before spelling even when only spelling is selected.

Docstrings tagged `json` or `application/json` are checked as JSON: property names and string values are checked, including words in identifiers and JSON escapes. Other content types and untyped docstrings are checked as plain text by default. Configure exceptions per content type:

```yaml
spelling:
  docStringTypes:
    application/problem+json: json
    xml: text
    binary: ignore
```

Content-type names are matched case-insensitively against lowercase configuration keys. The modes are `json`, `text` and `ignore`; child configurations override individual keys. The normal docstring language policy applies to checked content. JSON mode scans string tokens and does not validate JSON syntax.

A product dictionary directory contains UTF-8 word lists with one word per line; blank lines and lines starting with `#` are ignored. Prefix a word with `!` to forbid it, even if an ordinary dictionary accepts it. Locale-specific forbidden entries apply only when that locale is selected; forbidden entries in shared dictionaries apply everywhere. Locale-specific files are selected only for their locale: `en-US.dic` or `en.dic` for US English, `en-GB.dic` for British English, and `de-DE.dic` or `de.dic` for German. Both corresponding filenames are loaded if present. These files are optional. A direct `--dictionary` file is applied only to the feature's default locale.

All non-language `.dic` files in the directory, such as `places.dic` and `terms.dic`, are used in every spelling region. Filenames matching Gherkin keyword languages, locale codes such as `en-GB`, and common language names such as `english` and `german` are treated as language dictionaries and are not shared. Use language-code names for locale dictionaries.

```yaml
checks: [spell]
dictionary: ./spellchecker
spelling:
  specification:
    en: en-US
    de: de-DE
  content:
    locales: [en-US, de-DE]
  prose:
    locales: [en-US, en-GB]
  tables:
    locales: [en-US, de-DE]
  quotes:
    locales: [en-US, de-DE]
```

`specification` maps each feature's Gherkin keyword language to one spelling locale for titles and unquoted step text. Defaults are `en: en-US` and `de: de-DE`; an unmapped, unsupported keyword language is an error. The previously supported `dialects` map remains available; `specification` takes precedence when both specify a language.

`prose` covers descriptive paragraphs and defaults to the specification locale independently of `content`. The `content` policy is the default for `quotes` in titles, prose and steps, `docStrings`, step `dataTables`, and `examples` values. Without an override, content also defaults to the specification locale. `tables` overrides `content` for both data tables and Examples values; `dataTables` and `examples` override `tables`. Examples headers use the specification locale. A region accepts a word if any of its selected locales or a shared dictionary accepts it. A region can use `locale` for one language or `locales` for a nonempty list; a list replaces an inherited list.

Double-quoted spans in titles, steps and descriptive prose use the `quotes` policy; escaped quotation marks are kept within the span. A quote inside a table or docstring uses the table or docstring policy instead. Unmatched quotes remain part of the surrounding text. Unquoted title text uses the specification policy.

Feature, rule and scenario tags can override a policy with a comma-separated list, for example `@spell-content=en-US,de-DE`, `@spell-quotes=de-DE`, or `@spell-prose=en-GB`. Supported region names are `prose`, `content`, `quotes`, `tables`, `dataTables`, `examples`, and `docStrings`. Within each scope a more specific region overrides a broader one; a child scope overrides its parent, even when the parent is more specific. Thus policies apply in global, feature, rule, scenario, then Examples scope order. Locale lists replace earlier selections, not append to them. Existing `@spellchecker-language` and exclusion tags continue to work. A docstring's `language=...` override takes precedence for that docstring.

Shared configuration inheritance merges spelling settings by region and property. Existing `dictionaries` lists are validated if specified, but do not restrict the automatically loaded shared dictionaries. A YAML `dictionary` path is relative to the file declaring it; `--dictionary` overrides it relative to the working directory. Spelling is enabled without a configuration; parsing always runs before selected checks.

`cuke check --fix --dictionary spellchecker/ features/` adds unknown words to product dictionaries and reports each addition. A forbidden word remains an error and is never added. The command rechecks after additions and reports any remaining findings. It requires an existing dictionary directory (or an existing direct dictionary file) to fix unknown words. New entries are inserted near alphabetical position without reordering existing entries or comments.

By default, additions go to the feature's specification-language dictionary: `en.dic` for US English, `en-GB.dic` for British English, or `de.dic` for German, even for a region with a different or multiple locales. Set `fixDestination` on a spelling region to choose a dictionary name within the directory, for example `spelling.tables.fixDestination: places` (or `places.dic`). Region and scope policy precedence applies as for other spelling settings. A direct dictionary file is always its own destination. A destination outside a region's selected locales may leave a word unresolved; the recheck reports it.

The dictionaries have separate licenses; see [third-party dictionary notices](THIRD_PARTY_NOTICES.md) for licenses, source locations and distribution notes.
