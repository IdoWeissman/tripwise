/**
 * End-to-end API flows against a real PostgreSQL database.
 * Run with:  pnpm db:seed && pnpm --filter @tripwise/api test:integration
 */
import 'dotenv/config';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.js';
import { loadEnv, type Env } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';

const run = process.env.INTEGRATION === '1';

describe.runIf(run)('API integration', () => {
  let env: Env;
  let db: Db;
  let server: App;
  let owner: ReturnType<typeof request.agent>;
  let tripId = '';

  const gql = async (
    agent: ReturnType<typeof request.agent>,
    query: string,
    variables: Record<string, unknown> = {},
  ) => {
    const res = await agent.post('/graphql').send({ query, variables });
    return res.body as {
      data?: any;
      errors?: { message: string; extensions?: { code?: string } }[];
    };
  };

  const signIn = async (email: string, password: string) => {
    const agent = request.agent(server.app);
    const res = await gql(
      agent,
      'mutation($i: SignInInput!) { signIn(input: $i) { user { id } } }',
      {
        i: { email, password },
      },
    );
    expect(res.errors).toBeUndefined();
    return agent;
  };

  beforeAll(async () => {
    // Read config here, not at collection time, so a skipped run never needs a database URL.
    env = loadEnv({ ...process.env, NODE_ENV: 'test' });
    db = createDb(env.DATABASE_URL);
    server = await createApp(env, db);
    await new Promise<void>((r) => server.httpServer.listen(0, r));
    owner = await signIn('demo@tripwise.app', 'tripwise-demo');
    const res = await gql(owner, '{ trips { id name } }');
    tripId = res.data.trips.find((t: { name: string }) => t.name === 'Lisbon with the crew').id;
  });

  afterAll(async () => {
    await server.stop();
    await db.$disconnect();
  });

  it('computes balances that sum to zero and settle completely', async () => {
    const res = await gql(
      owner,
      `query($id: ID!) { trip(id: $id) {
        expenseSummary { total viewerPaid viewerBalance expenseCount }
        balances { user { name } amount }
        settlements { from { name } to { name } amount }
      } }`,
      { id: tripId },
    );
    const trip = res.data.trip;
    const cents = (s: string) => Math.round(Number(s) * 100);
    expect(trip.expenseSummary.expenseCount).toBe(11);
    expect(trip.balances.reduce((a: number, b: { amount: string }) => a + cents(b.amount), 0)).toBe(
      0,
    );
    expect(trip.settlements.length).toBeLessThanOrEqual(3);
  });

  it('schedules a proposal when it reaches the vote threshold', async () => {
    const q = `query($id: ID!) { trip(id: $id) { proposals { id title voteCount viewerHasVoted } } }`;
    const sail = (await gql(owner, q, { id: tripId })).data.trip.proposals.find(
      (p: { title: string }) => p.title === 'Sunset sail on the Tagus',
    );
    expect(sail.voteCount).toBe(1);

    const vote =
      'mutation($a: ID!) { toggleVote(activityId: $a) { voteCount viewerHasVoted status } }';
    const mine = (await gql(owner, vote, { a: sail.id })).data.toggleVote;
    expect(mine).toMatchObject({ voteCount: 2, viewerHasVoted: true, status: 'PROPOSED' });

    const noa = await signIn('noa@tripwise.app', 'tripwise-demo');
    const third = (await gql(noa, vote, { a: sail.id })).data.toggleVote;
    expect(third).toMatchObject({ voteCount: 3, status: 'SCHEDULED' });
  });

  it('moves activities between days and keeps positions contiguous', async () => {
    const q = `query($id: ID!) { trip(id: $id) { days { id position activities { id title position } } } }`;
    let days = (await gql(owner, q, { id: tripId })).data.trip.days;
    const fado = days[2].activities.find((a: { title: string }) => a.title === 'Fado night');

    const res = await gql(
      owner,
      'mutation($i: MoveActivityInput!) { moveActivity(input: $i) { id position } }',
      { i: { activityId: fado.id, dayId: days[0].id, position: 0 } },
    );
    expect(res.errors).toBeUndefined();

    days = (await gql(owner, q, { id: tripId })).data.trip.days;
    expect(days[0].activities[0].title).toBe('Fado night');
    for (const d of days) {
      expect(d.activities.map((a: { position: number }) => a.position)).toEqual(
        d.activities.map((_: unknown, i: number) => i),
      );
    }
  });

  it('adds and deletes expenses with validated splits', async () => {
    const members = (
      await gql(owner, 'query($id: ID!) { trip(id: $id) { members { user { id } } } }', {
        id: tripId,
      })
    ).data.trip.members.map((m: { user: { id: string } }) => m.user.id);
    const add = `mutation($i: AddExpenseInput!) { addExpense(input: $i) { id amount viewerShare splits { amount } } }`;

    const bad = await gql(owner, add, {
      i: {
        tripId,
        description: 'Bad',
        amount: '100.00',
        paidById: members[0],
        splitMethod: 'PERCENT',
        splits: [
          { userId: members[0], value: '60' },
          { userId: members[1], value: '30' },
        ],
      },
    });
    expect(bad.errors?.[0]?.message).toContain('100%');

    const ok = await gql(owner, add, {
      i: {
        tripId,
        description: 'Boat snacks',
        amount: '10.00',
        paidById: members[0],
        splitMethod: 'EQUAL',
        splits: members.slice(0, 3).map((userId: string) => ({ userId })),
      },
    });
    expect(ok.data.addExpense.splits.map((s: { amount: string }) => s.amount)).toEqual([
      '3.34',
      '3.33',
      '3.33',
    ]);

    const del = await gql(owner, 'mutation($id: ID!) { deleteExpense(id: $id) }', {
      id: ok.data.addExpense.id,
    });
    expect(del.data.deleteExpense).toBe(true);
  });

  it('invites a new user via link, enforces roles and removes them', async () => {
    const token = (
      await gql(owner, 'mutation($t: ID!) { createInviteLink(tripId: $t, role: EDITOR) }', {
        t: tripId,
      })
    ).data.createInviteLink;

    const guest = request.agent(server.app);
    const email = `guest-${Date.now()}@example.com`;
    const signUp = await gql(
      guest,
      'mutation($i: SignUpInput!) { signUp(input: $i) { user { id } } }',
      {
        i: { email, name: 'Lior', password: 'password123' },
      },
    );
    const guestId = signUp.data.signUp.user.id;

    const preview = await gql(
      guest,
      'query($t: String!) { invitePreview(token: $t) { tripName role alreadyMember } }',
      { t: token },
    );
    expect(preview.data.invitePreview).toEqual({
      tripName: 'Lisbon with the crew',
      role: 'EDITOR',
      alreadyMember: false,
    });

    const joined = await gql(guest, 'mutation($t: String!) { joinTrip(token: $t) { id myRole } }', {
      t: token,
    });
    expect(joined.data.joinTrip).toEqual({ id: tripId, myRole: 'EDITOR' });

    // invite tokens must never work as sessions
    const forged = await request(server.app)
      .post('/graphql')
      .set('Cookie', `tw_session=${token}`)
      .send({ query: '{ me { id } }' });
    expect(forged.body.data.me).toBeNull();

    await gql(
      owner,
      'mutation($t: ID!, $u: ID!) { updateMemberRole(tripId: $t, userId: $u, role: VIEWER) { role } }',
      { t: tripId, u: guestId },
    );
    const denied = await gql(
      guest,
      'mutation($i: AddExpenseInput!) { addExpense(input: $i) { id } }',
      {
        i: {
          tripId,
          description: 'x',
          amount: '1.00',
          paidById: guestId,
          splitMethod: 'EQUAL',
          splits: [{ userId: guestId }],
        },
      },
    );
    expect(denied.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');

    const removed = await gql(
      owner,
      'mutation($t: ID!, $u: ID!) { removeMember(tripId: $t, userId: $u) }',
      { t: tripId, u: guestId },
    );
    expect(removed.data.removeMember).toBe(true);
  });

  it('pushes live events over WebSocket subscriptions', async () => {
    // Sign in with a plain request to grab the raw Set-Cookie header for the WS handshake.
    const login = await request(server.app).post('/graphql').send({
      query:
        'mutation { signIn(input: { email: "demo@tripwise.app", password: "tripwise-demo" }) { user { id } } }',
    });
    const sessionCookie = String(login.headers['set-cookie']?.[0] ?? '').split(';')[0];

    const { port } = server.httpServer.address() as AddressInfo;
    const client = createClient({
      url: `ws://localhost:${port}/graphql`,
      webSocketImpl: class extends WebSocket {
        constructor(url: string, protocols?: string | string[]) {
          super(url, protocols, { headers: { cookie: sessionCookie } });
        }
      },
    });

    const received = new Promise<{ kind: string }>((resolve, reject) => {
      client.subscribe<{ tripEvents: { kind: string } }>(
        {
          query: 'subscription($t: ID!) { tripEvents(tripId: $t) { kind } }',
          variables: { t: tripId },
        },
        {
          next: (msg) => msg.data && resolve(msg.data.tripEvents),
          error: reject,
          complete: () => {},
        },
      );
    });
    await new Promise((r) => setTimeout(r, 200));

    await gql(owner, 'mutation($i: ProposeActivityInput!) { proposeActivity(input: $i) { id } }', {
      i: { tripId, title: 'Live test idea' },
    });
    await expect(received).resolves.toEqual({ kind: 'ACTIVITY_PROPOSED' });
    await client.dispose();
  });
});
