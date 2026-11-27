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

Enable spelling with `checks: [syntax, spell]` in YAML, or run it on its own:

```sh
cuke check --only spell --dictionary spellchecker/ features/
```

For now, spelling checks English Gherkin prose and steps using the bundled US English CSpell dictionary. Other Gherkin languages are reported as unsupported until language policies are implemented. Tables, Examples values and docstrings are also outside this initial spelling slice. Syntax is checked before spelling even when only spelling is selected.

The optional product dictionary directory contains `en-US.dic`, a UTF-8 list with one word per line; blank lines and lines starting with `#` are ignored. The `--dictionary` option can also point directly to a word-list file. Other language files in the directory are not mixed into the English word list. A YAML `dictionary` path is relative to the file declaring it and is overridden by `--dictionary`, which is relative to the working directory. For example:

```yaml
checks: [syntax, spell]
dictionary: ./spellchecker
```

Only syntax checking is enabled by default. Forbidden-word policies and language-specific selection are planned separately.
