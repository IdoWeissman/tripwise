import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Built web app to serve from this server (single-origin deploys), e.g. ../web/dist. */
  WEB_DIST: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // On Render the public URL is provided automatically; use it unless WEB_ORIGIN is set.
  const parsed = EnvSchema.safeParse({
    ...source,
    WEB_ORIGIN: source.WEB_ORIGIN ?? source.RENDER_EXTERNAL_URL,
  });
  if (!parsed.success) {
    console.error('Invalid environment configuration:', z.treeifyError(parsed.error));
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}
