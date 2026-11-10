/**
 * The MCP endpoint end to end: a real MCP client (the official SDK) talks to /mcp over HTTP
 * with personal access tokens, against the seeded database.
 * Run with:  pnpm db:seed && pnpm --filter @tripwise/api test:integration
 */
import 'dotenv/config';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';

const run = process.env.INTEGRATION === '1';

describe.runIf(run)('MCP server', () => {
  let db: Db;
  let server: App;
  let url: URL;
  let tripId = '';
  let ownerToken = '';
  let ownerTokenId = '';
  let viewerToken = '';
  const created = {
    activities: [] as string[],
    expenses: [] as string[],
    bookings: [] as string[],
  };
  const clients: Client[] = [];

  const gql = async (
    agent: ReturnType<typeof request.agent>,
    query: string,
    variables: Record<string, unknown> = {},
  ) =>
    (await agent.post('/graphql').send({ query, variables })).body as {
      data?: any;
      errors?: any[];
    };

  /** Signs in like the web app and creates a token from the browser session. */
  async function tokenFor(email: string) {
    const agent = request.agent(server.app);
    await gql(agent, 'mutation($i: SignInInput!) { signIn(input: $i) { user { id } } }', {
      i: { email, password: 'tripwise-demo' },
    });
    const res = await gql(
      agent,
      'mutation { createApiToken(name: "Vitest") { token apiToken { id prefix } } }',
    );
    expect(res.errors).toBeUndefined();
    return { agent, ...res.data.createApiToken };
  }

  async function connect(token: string) {
    const client = new Client({ name: 'vitest', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(url, {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    clients.push(client);
    return client;
  }

  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    const text = res.content[0]!.text;
    return { isError: !!res.isError, text, data: res.isError ? null : JSON.parse(text) };
  };

  beforeAll(async () => {
    const env = loadEnv({ ...process.env, NODE_ENV: 'test' });
    db = createDb(env.DATABASE_URL);
    server = await createApp(env, db);
    await new Promise<void>((r) => server.httpServer.listen(0, r));
    url = new URL(`http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}/mcp`);

    const owner = await tokenFor('demo@tripwise.app');
    ownerToken = owner.token;
    ownerTokenId = owner.apiToken.id;
    viewerToken = (await tokenFor('daniel@tripwise.app')).token;
    const trips = await gql(owner.agent, '{ trips { id name } }');
    tripId = trips.data.trips.find((t: { name: string }) => t.name === 'Lisbon with the crew').id;
  });

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    // Leave the seed exactly as it was for the other integration tests.
    await db.vote.deleteMany({ where: { activityId: { in: created.activities } } });
    await db.activity.deleteMany({ where: { id: { in: created.activities } } });
    await db.expense.deleteMany({ where: { id: { in: created.expenses } } });
    await db.booking.deleteMany({ where: { id: { in: created.bookings } } });
    await db.apiToken.deleteMany({ where: { name: 'Vitest' } });
    await server.stop();
    await db.$disconnect();
  });

  it('creates tokens shown once, stored only as a hash', async () => {
    expect(ownerToken).toMatch(/^tw_pat_[A-Za-z0-9]{32}$/);
    const row = await db.apiToken.findUniqueOrThrow({ where: { id: ownerTokenId } });
    expect(row.tokenHash).not.toContain(ownerToken.slice(7));
    expect(row.prefix).toBe(ownerToken.slice(0, 11));
  });

  it('rejects requests without a valid token', async () => {
    const res = await request(server.app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toMatch(/^Bearer /);

    const bad = await request(server.app)
      .post('/mcp')
      .set('Authorization', `Bearer tw_pat_${'x'.repeat(32)}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(bad.status).toBe(401);

    expect((await request(server.app).get('/mcp')).status).toBe(405);
  });

  it('lists the read tools and safe writes, with no delete tools', async () => {
    const client = await connect(ownerToken);
    expect(client.getServerVersion()?.name).toBe('tripwise');
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'add_booking',
      'add_expense',
      'get_booking',
      'get_expenses',
      'get_itinerary',
      'get_trip',
      'import_booking_text',
      'list_bookings',
      'list_proposals',
      'list_trips',
      'propose_activity',
      'vote',
    ]);
    expect(names.some((n) => /delete|remove/.test(n))).toBe(false);
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly).toHaveLength(7);
    expect(tools.every((t) => t.annotations?.destructiveHint !== true)).toBe(true);
  });

  it('reads trips, itinerary, bookings and balances as the token user', async () => {
    const client = await connect(ownerToken);
    const trips = (await call(client, 'list_trips')).data.trips;
    const lisbon = trips.find((t: { id: string }) => t.id === tripId);
    expect(lisbon.myRole).toBe('OWNER');
    // Member emails never leave the API through MCP.
    expect(JSON.stringify(trips)).not.toContain('@tripwise.app');

    const trip = (await call(client, 'get_trip', { tripId })).data;
    expect(trip.members).toHaveLength(4);

    const firstDay = trip.days[0].date.slice(0, 10);
    const itinerary = (await call(client, 'get_itinerary', { tripId, date: firstDay })).data;
    expect(itinerary.days).toHaveLength(1);
    expect(itinerary.days[0].items.length).toBeGreaterThan(0);

    const flights = (await call(client, 'list_bookings', { tripId, type: 'FLIGHT' })).data;
    expect(flights.length).toBeGreaterThan(0);
    const booking = (await call(client, 'get_booking', { tripId, bookingId: flights[0].id })).data;
    expect(booking.segments.length).toBeGreaterThan(0);

    const money = (await call(client, 'get_expenses', { tripId })).data;
    const cents = money.balances.reduce(
      (sum: number, b: { amount: string }) => sum + Math.round(Number(b.amount) * 100),
      0,
    );
    expect(cents).toBe(0);
  });

  it('proposes, votes idempotently and adds an equal-split expense', async () => {
    const client = await connect(ownerToken);
    const proposed = await call(client, 'propose_activity', {
      tripId,
      title: 'MCP test: sunset at the viewpoint',
      costPerPerson: '0',
    });
    expect(proposed.isError).toBe(false);
    const activityId = proposed.data.proposed.id;
    created.activities.push(activityId);

    const first = (await call(client, 'vote', { tripId, activityId })).data;
    const again = (await call(client, 'vote', { tripId, activityId })).data;
    expect(first.changed).toBe(true);
    expect(again.changed).toBe(false);

    const expense = await call(client, 'add_expense', {
      tripId,
      description: 'MCP test: coffee',
      amount: '12.00',
      splitBetween: ['me', 'Maya', 'Noa'],
    });
    expect(expense.isError).toBe(false);
    created.expenses.push(expense.data.added.id);
    expect(expense.data.added.paidBy.name).toBe('Ido');
    expect(expense.data.added.splits.map((s: { amount: string }) => s.amount)).toEqual([
      '4.00',
      '4.00',
      '4.00',
    ]);

    const unknown = await call(client, 'add_expense', {
      tripId,
      description: 'x',
      amount: '1',
      paidBy: 'Nobody',
    });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toContain('Members:');
  });

  it('previews an imported confirmation without saving, then saves it', async () => {
    const client = await connect(ownerToken);
    const text = `Your table is booked!
Restaurant: Casa Inventada
Date: 2026-12-05 at 20:30
Guests: 4
Confirmation number: TESTMCP42`;
    const before = await db.booking.count({ where: { tripId } });
    const preview = (await call(client, 'import_booking_text', { tripId, text })).data;
    expect(preview.saved).toBe(false);
    expect(preview.found.length).toBeGreaterThan(0);
    expect(await db.booking.count({ where: { tripId } })).toBe(before);

    const saved = (await call(client, 'import_booking_text', { tripId, text, save: true })).data;
    expect(saved.saved).toBe(true);
    created.bookings.push(...saved.bookings.map((b: { id: string }) => b.id));
    expect(await db.booking.count({ where: { tripId } })).toBe(before + saved.bookings.length);
  });

  it("enforces trip roles: a viewer's assistant can read but not write", async () => {
    const client = await connect(viewerToken);
    expect((await call(client, 'get_trip', { tripId })).data.myRole).toBe('VIEWER');
    const res = await call(client, 'add_expense', { tripId, description: 'x', amount: '5' });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/role/i);
  });

  it('tokens cannot manage tokens, and revoking cuts access immediately', async () => {
    // A token can't reach token mutations through GraphQL either.
    const viaToken = await request(server.app)
      .post('/graphql')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ query: '{ myApiTokens { id } }' });
    expect(viaToken.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');

    const { agent, token, apiToken } = await tokenFor('demo@tripwise.app');
    const client = await connect(token);
    expect((await call(client, 'list_trips')).isError).toBe(false);

    const revoked = await gql(agent, 'mutation($id: ID!) { revokeApiToken(id: $id) }', {
      id: apiToken.id,
    });
    expect(revoked.data.revokeApiToken).toBe(true);
    await expect(client.callTool({ name: 'list_trips', arguments: {} })).rejects.toThrow();
  });
});
