# Gherkin Toolkit

Gherkin Toolkit is an early-stage command-line tool for checking Gherkin feature files. It requires Node.js 22 or newer.

```sh
npm install
npm run build
node dist/cli.js check features/ path/to/example.feature
```

Directories are searched recursively for `.feature` files. Pass individual paths to check a selection; shell glob expansion is supported. Valid files produce no output. Syntax errors are printed with file, line and column and cause a nonzero exit status. Running `check` without paths succeeds silently.

For development, run `npm run typecheck` and `npm test`.
