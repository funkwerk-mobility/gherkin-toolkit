# Executable Cuke showcases

These Cucumber scenarios demonstrate Cuke against feature files. Each scenario creates a temporary workspace, runs the compiled CLI and checks the result. The feature files inside the docstrings are inputs to Cuke; their mistakes are intentional.

From the repository root, install dependencies and run:

```sh
npm install
npm run build
npm run test:features
```

`npm test` also builds Cuke and runs both the Vitest suite and these Cucumber scenarios. CI separately checks the scenarios with Cuke using `node dist/cli.js check --config features/doc/cuke.yml features/`. The spelling scenario excludes its docstrings and step data table from spelling because they contain deliberate mistakes and expected diagnostic words; those inputs are checked by the scenario itself.

[Spelling](../spelling.feature) demonstrates US English specification text, German quoted content, tables and a docstring, a custom dictionary and a forbidden word. It expects two unknown words and one forbidden word.

[Formatting](../formatting.feature) demonstrates indentation, spacing, blank lines and table alignment. It asserts the complete formatted feature and checks that it passes a subsequent formatting check.

## Attribution

The feature files embedded in these scenarios are adapted from examples in the [Cucumber Gherkin reference](https://github.com/cucumber/website/blob/main/docs/gherkin/reference.md). That documentation is licensed under MIT; its copyright notice and license are reproduced in [CUCUMBER-LICENSE](cucumber-license.txt).
