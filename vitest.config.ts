import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    include: ['server/src/**/*.test.ts', 'web/src/**/*.test.ts', 'packages/shared/src/**/*.test.ts'],
  },
});
