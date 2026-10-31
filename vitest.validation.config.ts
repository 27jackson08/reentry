import { defineConfig } from 'vitest/config';

/** Slow validation run that regenerates docs/validation.md. */
export default defineConfig({
  test: { include: ['tests/validation/**/*.test.ts'], testTimeout: 600_000 },
});
