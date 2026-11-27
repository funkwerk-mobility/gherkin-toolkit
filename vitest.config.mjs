import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // CLI tests start separate processes and load dictionaries, which can be slow on CI.
    testTimeout: 15_000,
  },
});
