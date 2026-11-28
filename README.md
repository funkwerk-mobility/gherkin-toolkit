# Multitool for clean Gherkin

Cuke helps teams keep Gherkin feature files readable and consistent. It checks spelling in multiple languages and formats features, with configurable rules for quoted content, tables and docstrings.

## Get started

Cuke is an early-stage project and requires Node.js 22.18 or newer. From a checkout of this repository, install and build it, then link the `cuke` command:

```sh
npm install
npm run build
npm link
```

Run `npm link` again if you change Node.js installations. Then, from your project directory, check feature files or format them in place:

```sh
cuke check features/
cuke format features/ path/to/example.feature
```

Directories are searched recursively; you can also supply files or shell-expanded globs. With no paths, `check` succeeds silently. Parsing always runs; spelling is enabled by default. A successful check produces no output. Add `--verbose` to see progress or `--json` for machine-readable diagnostics.

Try the [spelling and formatting showcases](features/doc/README.md) for examples with intentional findings.

## Configure your checks

Run `cuke configure` to create and select a YAML configuration. Select spelling and formatting checks and choose the settings that suit your project. The chosen configuration is remembered; use `--config path/to/cuke.yml` to select another one for a command. For a formatting-only check, run `cuke check --only format features/`. `cuke format` is shorthand for `cuke check --only format --fix`.

Without a selected Cuke configuration, formatting reads `printWidth`, `tabWidth` and `useTabs` from `.prettierrc.yml` in the working directory, if present; it preserves tag line breaks.

## Spelling and dictionaries

Provide a directory of custom `.dic` word lists with `--dictionary spellchecker/` or in the configuration. Language-named dictionaries are kept separate; other dictionaries, such as `places.dic`, apply everywhere. Prefix a word with `!` to forbid it.

Review spelling findings and correct mistakes first. Then `cuke check --only spell --fix --dictionary spellchecker/ features/` adds remaining unknown words to the custom dictionaries; it does not change spelling in feature files. Review the resulting dictionary changes.

See the [locale definitions](src/policies.ts) for supported languages and the [reference](doc/reference.md) for language policies, tags, dictionaries and other options. Cuke prefers CSpell dictionaries and can adapt compatible Hunspell dictionaries. Dictionary licenses are described in [third-party notices](THIRD_PARTY_NOTICES.md).

*This project was developed by humans with the assistance of AI tools, including OpenAI Codex.*
