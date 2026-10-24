import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // These files use node:test. scripts/test.mjs runs them with their own runner.
    // The cross-lane *.spec.mjs regression remains a Vitest test.
    exclude: [...configDefaults.exclude, '**/*.test.mjs'],
  },
});
