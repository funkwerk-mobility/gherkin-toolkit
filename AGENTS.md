# Agent guidance

- Preserve the user-facing CLI and configuration semantics in [the reference](doc/reference.md); update it when behavior changes.
- Test behavior through the CLI using the Vitest workspace helpers. Run lint, typecheck and tests using the scripts in `package.json`.
- Spelling languages are registered in `src/policies.ts`; dictionary packages load on demand. Review `THIRD_PARTY_NOTICES.md` when changing dictionary dependencies.
- Formatting must preserve parsed Gherkin meaning; see the safety check in `src/format.ts`.
