# Gherkin Toolkit

Gherkin Toolkit is an early-stage command-line tool for checking Gherkin feature files. It requires Node.js 22 or newer.

```sh
npm install
npm run build
node dist/cli.js check features/ path/to/example.feature
```

Directories are searched recursively for `.feature` files. Pass individual paths to check a selection; shell glob expansion is supported. Valid files produce no output. Syntax errors are printed with file, line and column and cause a nonzero exit status. Running `check` without paths succeeds silently.

For development, run `npm run typecheck` and `npm test`.

## Configuration

Pass a YAML file explicitly with `--config`:

```yaml
extends: ../shared/cuke.yml
checks:
  - syntax
```

`extends` is optional and resolved relative to the file that declares it. A `checks` list replaces the inherited list; an empty list disables all checks. Without a configuration, syntax checking is enabled. The only check currently available is `syntax`.

Use `cuke check --config product/cuke.yml --only syntax features/` to override the configured list for one run. Command-line paths are relative to the working directory. `--only` accepts a comma-separated list or may be repeated. Invalid configurations, unsupported check names and missing option values cause an error. No configuration file is selected automatically.
