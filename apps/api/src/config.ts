import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Built web app to serve from this server (single-origin deploys), e.g. ../web/dist. */
  WEB_DIST: z.string().optional(),
  /** Base URL of this API as seen from outside (calendar feed links). */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),

  // S3-compatible storage (MinIO in docker-compose for development)
  S3_ENDPOINT: z.string().url().optional(),
  /** Endpoint browsers use for signed download URLs, if different (e.g. MinIO behind a proxy). */
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('documents'),
  S3_ACCESS_KEY_ID: z.string().default('tripwise'),
  S3_SECRET_ACCESS_KEY: z.string().default('tripwise-secret'),
  /** Use an in-memory store instead of S3 (tests only). */
  STORAGE_DRIVER: z.enum(['s3', 'memory']).default('s3'),

  // Email reminders (Mailpit in docker-compose for development). Disabled when unset.
  SMTP_URL: z.string().url().optional(),
  MAIL_FROM: z.string().default('Tripwise <reminders@tripwise.local>'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // On Render the public URL is provided automatically; use it unless set explicitly.
  // Neon Object Storage provides AWS-standard variables (`neon deploy` / `neon env pull`);
  // explicit S3_* settings (e.g. MinIO in docker-compose) take precedence.
  const parsed = EnvSchema.safeParse({
    ...source,
    WEB_ORIGIN: source.WEB_ORIGIN ?? source.RENDER_EXTERNAL_URL,
    PUBLIC_API_URL: source.PUBLIC_API_URL ?? source.RENDER_EXTERNAL_URL,
    S3_ENDPOINT: source.S3_ENDPOINT ?? source.AWS_ENDPOINT_URL_S3,
    S3_REGION: source.S3_REGION ?? source.AWS_REGION,
    S3_ACCESS_KEY_ID: source.S3_ACCESS_KEY_ID ?? source.AWS_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: source.S3_SECRET_ACCESS_KEY ?? source.AWS_SECRET_ACCESS_KEY,
  });
  if (!parsed.success) {
    console.error('Invalid environment configuration:', z.treeifyError(parsed.error));
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}
