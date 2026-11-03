import { defineConfig } from 'vitest/config';

// Requires a running, migrated and seeded database (see README).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    env: { INTEGRATION: '1' },
    fileParallelism: false,
  },
});
