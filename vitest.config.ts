import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // GL plumbing and DOM glue are exercised by the Playwright suite, not by unit tests.
      exclude: ['src/gpu/**', 'src/ui/**', 'src/main.ts', 'src/testHook.ts', 'src/ecg/EcgTrace.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
