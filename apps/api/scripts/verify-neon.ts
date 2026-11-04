/**
 * End-to-end check of the Neon services the app uses, with the same env
 * loading and client code as the server. Run from the repo root:
 *
 *   pnpm --filter @tripwise/api verify:neon
 *
 * Exits non-zero if Postgres or object storage fails.
 */
import '../src/env.js';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config.js';
import { createDb } from '../src/db.js';
import { createStorage } from '../src/storage.js';

const env = loadEnv();
let failed = false;

async function step(name: string, fn: () => Promise<string>) {
  try {
    console.log(`✔ ${name}: ${await fn()}`);
  } catch (err) {
    failed = true;
    console.error(`✘ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const host = (url: string) => new URL(url).host;

await step('Postgres', async () => {
  const db = createDb(env.DATABASE_URL);
  try {
    const [row] = await db.$queryRaw<{ version: string }[]>`select version()`;
    const users = await db.user.count();
    return `${host(env.DATABASE_URL)} · ${row?.version.split(' ').slice(0, 2).join(' ')} · ${users} users`;
  } finally {
    await db.$disconnect();
  }
});

await step('Object storage', async () => {
  const storage = createStorage(env);
  const key = `verify/${randomUUID()}.txt`;
  const body = Buffer.from(`tripwise verify ${new Date().toISOString()}`);
  await storage.ensureReady();
  await storage.put(key, body, 'text/plain');
  const url = await storage.signedUrl(key, 'verify.txt', 'text/plain', 60);
  const got = Buffer.from(await (await fetch(url)).arrayBuffer());
  if (!got.equals(body)) throw new Error('downloaded bytes differ from upload');
  await storage.delete(key);
  const after = await fetch(url);
  if (after.ok) throw new Error('object still downloadable after delete');
  return `${env.S3_ENDPOINT ? host(env.S3_ENDPOINT) : 'default endpoint'} · bucket "${env.S3_BUCKET}" · upload, signed download, delete OK`;
});

process.exit(failed ? 1 : 0);
