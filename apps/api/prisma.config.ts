import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Neon writes its variables to the repo-root .env.local (`neon deploy` / `neon env pull`);
// apps/api/.env holds local settings. dotenv never overrides, so the first file wins.
config({ path: ['../../.env.local', '.env'], quiet: true });

/**
 * Migrations need a direct (non-pooled) connection: Prisma Migrate takes a session-level
 * advisory lock, which times out (P1002) through Neon's PgBouncer pooler. Prefer
 * DATABASE_URL_UNPOOLED; otherwise derive the direct URL from a Neon pooled URL by dropping
 * "-pooler" from the host. The app itself keeps using the pooled DATABASE_URL.
 */
export function migrationUrl(env: NodeJS.ProcessEnv): string {
  const direct = env.DATABASE_URL_UNPOOLED?.trim();
  if (direct) return direct;
  const url = env.DATABASE_URL?.trim();
  // The fallback lets `prisma generate` run in CI without a database.
  if (!url) return 'postgresql://tripwise:tripwise@localhost:5432/tripwise';
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.replace(/-pooler(?=\.)/, '');
    return parsed.toString();
  } catch {
    return url;
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: { url: migrationUrl(process.env) },
});
