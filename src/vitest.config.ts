import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/tests/e2e/**'], // exclude e2e tests in regular runs
    include: ['src/**/*.test.ts'],
  },
});
