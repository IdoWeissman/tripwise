import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { createDb } from '../src/db.js';

// These tests never touch the database: Prisma connects lazily.
const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/unused',
  JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  WEB_ORIGIN: 'http://localhost:5173',
});

let server: App;

beforeAll(async () => {
  server = await createApp(env, createDb(env.DATABASE_URL));
});
afterAll(() => server.stop());

describe('api', () => {
  it('responds on /health', async () => {
    const res = await request(server.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns null for `me` when signed out', async () => {
    const res = await request(server.app).post('/graphql').send({ query: '{ me { id } }' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ me: null });
  });

  it('rejects trips query when signed out', async () => {
    const res = await request(server.app).post('/graphql').send({ query: '{ trips { id } }' });
    expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
  });
});
