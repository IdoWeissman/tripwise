import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Integration tests need a database; run them with `pnpm test:integration`.
    exclude: ['test/**/*.integration.test.ts', '**/node_modules/**'],
  },
});
