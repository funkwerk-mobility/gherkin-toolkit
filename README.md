# Gherkin Toolkit

Gherkin Toolkit is an early-stage command-line tool for checking Gherkin feature files. It requires Node.js 22.18 or newer.

```sh
npm install
npm run build
node dist/cli.js check features/ path/to/example.feature
```

Directories are searched recursively for `.feature` files. Pass individual paths to check a selection; shell glob expansion is supported. Valid files produce no output. Syntax errors are printed with file, line and column and cause a nonzero exit status. Running `check` without paths succeeds silently. Add `--verbose` to show each check as it starts for each file, including parsing before the selected checks.

For development, run `npm run lint`, `npm run typecheck` and `npm test` (Vitest).

## Diagnostics

Human-readable diagnostics go to standard error as `path:line:column: message [severity, rule]`. Errors make the command fail; warnings do not. Parsing errors do not prevent checking other files. By default at most 100 diagnostics are displayed, followed by a count of hidden diagnostics; every finding affects the exit status, including hidden ones. Set the limit in YAML or override it for one invocation:

```yaml
diagnostics:
  limit: 50
```

```sh
cuke check --limit 25 features/
cuke check --json features/
```

The limit is a nonnegative integer; zero hides all terminal diagnostic details. `--json` writes one JSON object to standard output with `diagnostics`, `total`, and `fixes`. JSON output includes all diagnostics regardless of the display limit. Each diagnostic contains `rule` and `severity`, plus `word` for spelling findings; file-specific findings also include `path` and, where available, `line` and `column`. JSON diagnostics do not contain messages. `fixes` contains human-readable descriptions of applied changes. In JSON mode verbose progress goes to standard error, keeping standard output machine-readable. JSON output is emitted even when there are no findings.

## Configuration

Pass a YAML file explicitly with `--config`:

```yaml
extends: ../shared/cuke.yml
checks:
  - spell
```

`extends` is optional and resolved relative to the file that declares it. A `checks` list replaces the inherited list; an empty list disables all optional checks. Parsing still runs for every selected file. Without a configuration, spelling is enabled. The available check is `spell`.

Use `cuke check --config project/cuke.yml --only spell features/` to override the configured list for one run. Command-line paths are relative to the working directory. `--only` accepts a comma-separated list or may be repeated. Invalid configurations, unsupported check names and missing option values cause an error.

Run `cuke configure` in a terminal to create or edit a YAML configuration interactively. The wizard takes you through checks and, if spelling is enabled, its dictionary path, English specification language and optional language overrides. Use the arrow keys and space bar to choose options. The dictionary path is relative to the working directory and defaults to `spellchecker`; the wizard stores it relative to the configuration file so it continues to resolve correctly. Existing settings and YAML comments are preserved. Other spelling settings can be edited directly in YAML.

The wizard shows the relationship between content, the shared table setting, and the separate step-table and Examples-table overrides. The selections are independent: a broader setting supplies a default, and a more specific selection overrides it. Table headers use the specification language unless a table-header language override is configured.

Step tables are checked in the step-table language by default, including the first row. To treat the first row as a header and check it in the specification language instead, enable the wizard's table-header switch or set this top-level convention:

```yaml
tables:
  stepHeader: true
```

The setting is inherited by extended configurations and can be overridden with `false`. It records a table convention independently of spelling, so future rendering can use it too; rendering is not yet implemented.

The wizard remembers the chosen configuration for subsequent checks when completed. Escape cancels without saving. `cuke configure --config project/cuke.yml` opens a specific configuration, `cuke configure --show` displays the remembered path, and `cuke configure --clear` forgets it. The selection is stored in `$XDG_CONFIG_HOME/cuke/selection.json`, or `~/.config/cuke/selection.json` when `XDG_CONFIG_HOME` is unset. Explicit `--config` overrides it. A home configuration such as `~/.cuke.yml` is never selected automatically; enter its path explicitly in the wizard to use it. The configuration path prompt expands a leading `~` or `$HOME`.

## Spelling

Feature, rule, scenario and Examples tags support `@spellchecker-ignore=tables,examples,docStrings`. Exclusions accumulate in nested scopes: `tables` skips step data tables, `examples` skips Examples values (not headers), and `docStrings` skips docstring contents. Prose and steps continue to be checked. An Examples tag applies only to that Examples block. Invalid options produce an error.

The tag `@spellchecker-language=de` changes the language for Examples values and docstrings in its scope; it does not change steps, step tables or Examples headers. An Examples tag affects that block only. A docstring can set its own language with an opening delimiter such as `"""language=de`. Supported values are `en`, `en-US`, `en-GB`, `de`, `de-DE`, `fr`, `fr-FR`, `no`, `nb`, `nb-NO`, `lb` and `lb-LU`. Other typed docstrings are handled separately.

Enable spelling with `checks: [spell]` in YAML, or run it on its own:

```sh
cuke check --only spell --dictionary spellchecker/ features/
```

Spelling supports US English (`en-US`), British English (`en-GB`) and German (`de-DE`). By default the Gherkin dialects `en` and `de` map to `en-US` and `de-DE`. Prose, steps, data tables, Examples headers and values, and docstrings are checked. Syntax is checked before spelling even when only spelling is selected.

Docstrings tagged `json` or `application/json` are checked as JSON: property names and string values are checked, including words in identifiers and JSON escapes. Other content types and untyped docstrings are checked as plain text by default. Configure exceptions per content type:

```yaml
spell:
  docStringTypes:
    application/problem+json: json
    xml: text
    binary: ignore
```

Content-type names are matched case-insensitively against lowercase configuration keys. The modes are `json`, `text` and `ignore`; child configurations override individual keys. The normal docstring language policy applies to checked content. JSON mode scans string tokens and does not validate JSON syntax.

A custom dictionary directory contains UTF-8 word lists with one word per line; blank lines and lines starting with `#` are ignored. Prefix a word with `!` to forbid it, even if an ordinary dictionary accepts it. Locale-specific forbidden entries apply only when that locale is selected; forbidden entries in shared dictionaries apply everywhere. Locale-specific files are selected only for their locale: `en-US.dic` or `en.dic` for US English, `en-GB.dic` for British English, and `de-DE.dic` or `de.dic` for German. French uses `fr-FR.dic` and `fr.dic`; Bokmål uses `nb-NO.dic`, `nb.dic` and `no.dic`; Luxembourgish uses `lb-LU.dic` and `lb.dic`. All matching filenames are loaded if present. These files are optional. A direct `--dictionary` file is applied only to the feature's default locale.

All non-language `.dic` files in the directory, such as `places.dic` and `terms.dic`, are used in every spelling region. Filenames matching Gherkin keyword languages, locale codes such as `en-GB`, and common language names such as `english` and `german` are treated as language dictionaries and are not shared. Use language-code names for locale dictionaries.

```yaml
checks: [spell]
dictionary: ./spellchecker
spell:
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

`specification` maps each feature's Gherkin keyword language to one spelling locale for titles and unquoted step text. Defaults are `en: en-US`, `de: de-DE`, `fr: fr-FR` and `no: nb-NO`; an unmapped, unsupported keyword language is an error. The previously supported `dialects` map remains available; `specification` takes precedence when both specify a language.

`prose` covers descriptive paragraphs and defaults to the specification locale independently of `content`. The `content` policy is the default for `quotes` in titles, prose and steps, `docStrings`, step `dataTables`, and `examples` values. Without an override, content also defaults to the specification locale. `tables` overrides `content` for both data tables and Examples values; `dataTables` and `examples` override `tables`. Table headers use the specification locale unless `tableHeaders` is configured. A region accepts a word if any of its selected locales or a shared dictionary accepts it. A region can use `locale` for one language or `locales` for a nonempty list; a list replaces an inherited list.

Double-quoted spans in titles, steps and descriptive prose use the `quotes` policy; escaped quotation marks are kept within the span. A quote inside a table or docstring uses the table or docstring policy instead. Unmatched quotes remain part of the surrounding text. Unquoted title text uses the specification policy.

Tags override spelling settings for a Feature, Rule, Scenario or Examples block:

| Tag | Effect |
| --- | --- |
| `@spell=off` | Disable spelling in the scope. |
| `@spell.specification=en-GB` | Set the single language for titles, steps, and headers. |
| `@spell.prose=en-GB,de-DE` | Set languages for prose. |
| `@spell.content=en-US,de-DE` | Set default languages for content regions. |
| `@spell.quotes=de-DE` | Set languages for quoted content. |
| `@spell.tables=de-DE` | Set languages for step data tables and Examples values. |
| `@spell.data-tables=de-DE` | Set languages for step data tables. |
| `@spell.tables.headers=en,de` | Set languages for table headers. |
| `@spell.examples=de-DE` | Set languages for Examples values. |
| `@spell.docstrings=de-DE` | Set languages for docstrings. |

`en` and `de` follow the configured `spell.specification` mapping for those Gherkin keyword languages; without a mapping they mean `en-US` and `de-DE`. Explicit locales such as `en-GB` always retain their meaning. The wizard’s English specification language selection therefore also sets the meaning of `en`.

The `tableHeaders` YAML region and `@spell.tables.headers` tag apply to Examples headers and, when `tables.stepHeader` is enabled, the first row of step data tables. They do not change whether a row is a header.

Use `off` in place of a locale list to disable a region, for example `@spell.tables=off`. A narrower region can re-enable checking with a locale list. The specification language must be one locale and cannot be `off`; use `@spell=off` to disable spelling across the scope. A Feature-only tag `@step-data-table-header=true` or `@step-data-table-header=false` overrides the configured convention for the entire Feature.

Within each scope a more specific region overrides a broader one; a child scope overrides its parent, even when the parent is more specific. Policies apply in configuration, Feature, Rule, Scenario, then Examples scope order. Locale lists replace earlier selections, not append to them. A docstring's `language=...` overrides its language when it is checked. The earlier tags such as `@spell-content=en-US,de-DE`, `@spell-dataTables=de-DE`, and `@spell-docStrings=de-DE` remain supported. Legacy `@spellchecker-ignore` exclusions continue to accumulate and cannot be overridden by language tags.

Shared configuration inheritance merges spelling settings by region and property. A YAML `dictionary` path is relative to the file declaring it; `--dictionary` overrides it relative to the working directory. Spelling is enabled without a configuration; parsing always runs before selected checks.

`cuke check --fix --dictionary spellchecker/ features/` adds unknown words to project dictionaries and reports each addition. A forbidden word remains an error and is never added. The command rechecks after additions and reports any remaining findings. It requires an existing dictionary directory (or an existing direct dictionary file) to fix unknown words. New entries are inserted near alphabetical position without reordering existing entries or comments.

Additions go to the applicable specification-language dictionary: `en.dic` for US English, `en-GB.dic` for British English, `de.dic` for German, `fr.dic` for French, `nb.dic` for Bokmål, or `lb.dic` for Luxembourgish, even for a region with a different or multiple locales. A direct dictionary file is always its own destination. The specification language may differ from a region's selected locales, leaving a word unresolved; the recheck reports it.

Luxembourgish (`lb` or `lb-LU`) uses an on-demand Hunspell-style adapter. The Gherkin parser has no Luxembourgish keyword dialect, but Luxembourgish can be selected for a region or as the specification language using a tag or configuration. The adapter does not implement every Hunspell affix option, so some valid words may need custom dictionary entries.

The dictionaries have separate licenses; see [third-party dictionary notices](THIRD_PARTY_NOTICES.md) for licenses, source locations and distribution notes.

## Formatting

Run `cuke check --only format features/` to check formatting, or add `--fix` to write changes. Select formatting alongside other checks with `checks: [spell, format]`. Tag lines are preserved by default; set `format.tags` to `one-per-line` or `single-line` to choose another layout. Inline explanations stay attached to their tags.

```yaml
checks: [spell, format]
format:
  tags: preserve
  lineLength: 120
  indentation: 2
  useTabs: false
```

Prose is wrapped to `lineLength`, and tags wrap at that width when kept together. `indentation` controls spaces per level, or the display width of a tab when `useTabs` is true. Whitespace in docstrings, quoted text, and table padding is preserved. Fixing repeated spaces in step text can change which step definition matches.
