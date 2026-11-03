import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Fallback lets `prisma generate` run (e.g. in CI) without a database.
    url: process.env.DATABASE_URL ?? 'postgresql://tripwise:tripwise@localhost:5432/tripwise',
  },
});
