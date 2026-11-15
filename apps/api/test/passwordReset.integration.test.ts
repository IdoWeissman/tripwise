/**
 * Password reset through the public GraphQL API, with a fake mailer (GLOSSARY: Password reset,
 * Reset link, Demo account; ADR 0001: sign out everywhere when the password changes).
 */
import 'dotenv/config';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.js';
import { loadEnv, type Env } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';
import type { MailMessage } from '../src/mail/mailer.js';

const run = process.env.INTEGRATION === '1';

describe.runIf(run)('Password reset', () => {
  let env: Env;
  let db: Db;
  let server: App;
  const outbox: MailMessage[] = [];

  type Agent = ReturnType<typeof request.agent>;
  const gql = async (agent: Agent, query: string, variables: Record<string, unknown> = {}) =>
    (await agent.post('/graphql').send({ query, variables })).body as {
      data?: any;
      errors?: { message: string; extensions?: { code?: string } }[];
    };

  const REQUEST = 'mutation($e: String!) { requestPasswordReset(email: $e) }';
  const PREVIEW = 'query($t: String!) { passwordResetPreview(token: $t) { email } }';
  const RESET =
    'mutation($t: String!, $p: String!) { resetPassword(token: $t, password: $p) { user { id } } }';
  const ME = '{ me { id } }';
  const signUp = async (agent: Agent, email: string, password: string) =>
    gql(agent, 'mutation($i: SignUpInput!) { signUp(input: $i) { user { id } } }', {
      i: { email, name: 'Shir', password },
    });
  const signIn = async (agent: Agent, email: string, password: string) =>
    gql(agent, 'mutation($i: SignInInput!) { signIn(input: $i) { user { id } } }', {
      i: { email, password },
    });
  /** The token from the link in the latest email to this address. */
  const linkFor = (email: string) => {
    const mail = outbox.filter((m) => m.to === email).at(-1)!;
    return mail.text.match(/\/reset-password\/([\w.-]+)/)![1]!;
  };

  beforeAll(async () => {
    env = loadEnv({ ...process.env, NODE_ENV: 'test' });
    db = createDb(env.DATABASE_URL);
    server = await createApp(env, db, undefined, {
      mailer: {
        send: async (m) => {
          outbox.push(m);
        },
      },
    });
    await new Promise<void>((r) => server.httpServer.listen(0, r));
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { startsWith: 'reset-' } } });
    await server.stop();
    await db.$disconnect();
  });

  it('says so when no account uses the email', async () => {
    const res = await gql(request.agent(server.app), REQUEST, { e: 'nobody-here@example.com' });
    expect(res.errors?.[0]).toMatchObject({
      message: 'No account found for that email.',
      extensions: { code: 'ACCOUNT_NOT_FOUND' },
    });
  });

  it('resets with the emailed link, signs out every other session, and works only once', async () => {
    const email = `reset-${Date.now()}@example.com`;
    const laptop = request.agent(server.app);
    await signUp(laptop, email, 'old-password-1');
    const phone = request.agent(server.app);
    await signIn(phone, email, 'old-password-1');

    expect((await gql(request.agent(server.app), REQUEST, { e: email })).data).toEqual({
      requestPasswordReset: true,
    });
    const resetMail = outbox.filter((m) => m.to === email).at(-1)!;
    expect(resetMail.subject).toBe('Reset your Tripwise password');
    const token = linkFor(email);

    const stranger = request.agent(server.app);
    expect((await gql(stranger, PREVIEW, { t: token })).data.passwordResetPreview).toEqual({
      email,
    });

    // The person resetting is signed in straight away…
    const reset = await gql(stranger, RESET, { t: token, p: 'new-password-1' });
    expect(reset.errors).toBeUndefined();
    expect((await gql(stranger, ME)).data.me.id).toBe(reset.data.resetPassword.user.id);
    // …and every session from before the reset is signed out.
    expect((await gql(laptop, ME)).data.me).toBeNull();
    expect((await gql(phone, ME)).data.me).toBeNull();

    // The account hears about the change.
    expect(outbox.filter((m) => m.to === email).at(-1)!.subject).toBe(
      'Your Tripwise password was changed',
    );

    // The link is spent.
    expect((await gql(stranger, PREVIEW, { t: token })).data.passwordResetPreview).toBeNull();
    const again = await gql(request.agent(server.app), RESET, { t: token, p: 'another-pass-1' });
    expect(again.errors?.[0]?.extensions?.code).toBe('INVALID_RESET_LINK');

    // Only the new password signs in.
    expect((await signIn(request.agent(server.app), email, 'old-password-1')).errors).toBeDefined();
    expect(
      (await signIn(request.agent(server.app), email, 'new-password-1')).errors,
    ).toBeUndefined();
  });

  it('refuses a too-short new password and keeps the link usable', async () => {
    const email = `reset-short-${Date.now()}@example.com`;
    await signUp(request.agent(server.app), email, 'old-password-1');
    await gql(request.agent(server.app), REQUEST, { e: email });
    const token = linkFor(email);
    const res = await gql(request.agent(server.app), RESET, { t: token, p: 'short' });
    expect(res.errors?.[0]?.message).toBe('Password must be at least 8 characters');
    expect(
      (await gql(request.agent(server.app), PREVIEW, { t: token })).data.passwordResetPreview,
    ).not.toBeNull();
  });

  it('sends at most 3 reset emails per address per hour', async () => {
    const email = `reset-limit-${Date.now()}@example.com`;
    await signUp(request.agent(server.app), email, 'old-password-1');
    for (let i = 0; i < 3; i++) {
      expect((await gql(request.agent(server.app), REQUEST, { e: email })).errors).toBeUndefined();
    }
    const fourth = await gql(request.agent(server.app), REQUEST, { e: email });
    expect(fourth.errors?.[0]?.extensions?.code).toBe('RATE_LIMITED');
    expect(outbox.filter((m) => m.to === email)).toHaveLength(3);
  });

  it('names the duplicate on sign-up, so the screen can offer a reset', async () => {
    const email = `reset-dupe-${Date.now()}@example.com`;
    await signUp(request.agent(server.app), email, 'old-password-1');
    const again = await signUp(request.agent(server.app), email, 'other-password-1');
    expect(again.errors?.[0]).toMatchObject({
      message: 'An account with this email already exists.',
      extensions: { code: 'ACCOUNT_EXISTS' },
    });
  });

  it('carries where the person was heading through the email, in-app paths only', async () => {
    const email = `reset-next-${Date.now()}@example.com`;
    await signUp(request.agent(server.app), email, 'old-password-1');
    const ask = 'mutation($e: String!, $n: String) { requestPasswordReset(email: $e, next: $n) }';
    await gql(request.agent(server.app), ask, { e: email, n: '/join/abc123' });
    const mail = outbox.filter((m) => m.to === email).at(-1)!;
    expect(new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get('next')).toBe(
      '/join/abc123',
    );
    await gql(request.agent(server.app), ask, { e: email, n: '//evil.example' });
    const second = outbox.filter((m) => m.to === email).at(-1)!;
    expect(new URL(second.text.match(/https?:\/\/\S+/)![0]).searchParams.has('next')).toBe(false);
  });

  it('lets only one of two simultaneous resets with the same link through', async () => {
    const email = `reset-race-${Date.now()}@example.com`;
    await signUp(request.agent(server.app), email, 'old-password-1');
    await gql(request.agent(server.app), REQUEST, { e: email });
    const token = linkFor(email);
    const [a, b] = await Promise.all([
      gql(request.agent(server.app), RESET, { t: token, p: 'first-password-1' }),
      gql(request.agent(server.app), RESET, { t: token, p: 'second-password-1' }),
    ]);
    expect([a, b].filter((r) => !r.errors)).toHaveLength(1);
    expect([a, b].find((r) => r.errors)?.errors?.[0]?.extensions?.code).toBe('INVALID_RESET_LINK');
  });

  it('answers for the demo account like any other, but never sends or resets it', async () => {
    const before = outbox.length;
    const res = await gql(request.agent(server.app), REQUEST, { e: 'demo@tripwise.app' });
    expect(res.data).toEqual({ requestPasswordReset: true });
    expect(outbox.length).toBe(before);
  });
});
