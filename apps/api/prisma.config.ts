import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Neon writes its variables to the repo-root .env.local (`neon deploy` / `neon env pull`);
// apps/api/.env holds local settings. dotenv never overrides, so the first file wins.
config({ path: ['../../.env.local', '.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection — Prisma Migrate fails through PgBouncer.
    // The app itself uses the pooled DATABASE_URL. The fallback lets `prisma generate` run in CI.
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      'postgresql://tripwise:tripwise@localhost:5432/tripwise',
  },
});
