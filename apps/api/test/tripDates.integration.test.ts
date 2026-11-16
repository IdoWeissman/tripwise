/**
 * Bookings outside the trip's dates, and changing the dates. Run with:
 *   pnpm db:seed && pnpm --filter @tripwise/api test:integration
 */
import 'dotenv/config';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';
import { MemoryStorage } from '../src/storage.js';

const run = process.env.INTEGRATION === '1';

describe.runIf(run)('Trip dates', () => {
  let db: Db;
  let server: App;
  let tripId = '';

  const gql = async (agent: ReturnType<typeof request.agent>, query: string, variables = {}) =>
    (await agent.post('/graphql').send({ query, variables })).body as {
      data?: any;
      errors?: any[];
    };
  const signIn = async (email: string) => {
    const agent = request.agent(server.app);
    await gql(agent, 'mutation($i: SignInInput!) { signIn(input: $i) { user { id } } }', {
      i: { email, password: 'tripwise-demo' },
    });
    return agent;
  };
  const DAYS = `query($t: ID!) { trip(id: $t) { startDate endDate
    outsideBookings { title } datesToFit { startDate endDate }
    unplannedActivities { title }
    days { date position bookings { title } activities { title } } } }`;

  beforeAll(async () => {
    const base = { ...process.env, NODE_ENV: 'test', GOOGLE_PLACES_API_KEY: '' };
    const env = loadEnv(base);
    db = createDb(env.DATABASE_URL);
    server = await createApp(env, db, new MemoryStorage(), { mailer: null });
    const owner = await signIn('demo@tripwise.app');
    const trip = await gql(
      owner,
      'mutation($i: CreateTripInput!) { createTrip(input: $i) { id days { id date } } }',
      {
        i: {
          name: 'Dates test trip',
          destination: 'Rome',
          startDate: '2027-11-21',
          endDate: '2027-11-24',
          timeZone: 'Europe/Rome',
        },
      },
    );
    tripId = trip.data.createTrip.id;
    // The outbound flight leaves the evening before the trip starts.
    const flight = await gql(
      owner,
      'mutation($t: ID!, $i: BookingInput!) { createBooking(tripId: $t, input: $i) { id } }',
      {
        t: tripId,
        i: {
          type: 'FLIGHT',
          title: 'Tel Aviv ⇄ Rome',
          segments: [
            {
              number: 'XQ 381',
              fromCode: 'TLV',
              toCode: 'FCO',
              departLocal: '2027-11-20T22:40',
              arriveLocal: '2027-11-21T01:55',
              departTz: 'Asia/Jerusalem',
              arriveTz: 'Europe/Rome',
            },
            {
              number: 'XQ 382',
              fromCode: 'FCO',
              toCode: 'TLV',
              departLocal: '2027-11-24T18:00',
              arriveLocal: '2027-11-24T22:10',
              departTz: 'Europe/Rome',
              arriveTz: 'Asia/Jerusalem',
            },
          ],
        },
      },
    );
    expect(flight.errors).toBeUndefined();
    const day4 = trip.data.createTrip.days[3].id;
    await gql(owner, 'mutation($i: ProposeActivityInput!) { proposeActivity(input: $i) { id } }', {
      i: { tripId, title: 'Last dinner', dayId: day4, scheduleNow: true },
    });
  });

  afterAll(async () => {
    if (tripId) await db.trip.delete({ where: { id: tripId } });
    await server.stop();
    await db.$disconnect();
  });

  it('reports a booking that falls outside the trip, and the dates that fit it', async () => {
    const owner = await signIn('demo@tripwise.app');
    const res = await gql(owner, DAYS, { t: tripId });
    expect(res.errors).toBeUndefined();
    const t = res.data.trip;
    // The bug: the first leg (Nov 20) had no day, so it never showed.
    expect(t.days.map((d: { date: string }) => d.date.slice(0, 10))).not.toContain('2027-11-20');
    expect(t.outsideBookings).toEqual([{ title: 'Tel Aviv ⇄ Rome' }]);
    expect(t.datesToFit).toEqual({ startDate: '2027-11-20', endDate: '2027-11-24' });
  });

  it('extends the trip so the booking gets its day, keeping existing plans', async () => {
    const owner = await signIn('demo@tripwise.app');
    const res = await gql(
      owner,
      'mutation($t: ID!) { updateTripDates(tripId: $t, startDate: "2027-11-20", endDate: "2027-11-24") { unplannedCount trip { id } } }',
      { t: tripId },
    );
    expect(res.errors).toBeUndefined();
    expect(res.data.updateTripDates.unplannedCount).toBe(0);
    const t = (await gql(owner, DAYS, { t: tripId })).data.trip;
    expect(t.startDate).toBe('2027-11-20');
    expect(t.outsideBookings).toEqual([]);
    expect(t.datesToFit).toBeNull();
    expect(t.days.map((d: any) => [d.date.slice(0, 10), d.position])).toEqual([
      ['2027-11-20', 0],
      ['2027-11-21', 1],
      ['2027-11-22', 2],
      ['2027-11-23', 3],
      ['2027-11-24', 4],
    ]);
    expect(t.days[0].bookings).toEqual([{ title: 'Tel Aviv ⇄ Rome' }]);
    expect(t.days[4].activities).toEqual([{ title: 'Last dinner' }]);
  });

  it('shortening moves plans on removed days to Unplanned, never deletes them', async () => {
    const owner = await signIn('demo@tripwise.app');
    const res = await gql(
      owner,
      'mutation($t: ID!) { updateTripDates(tripId: $t, startDate: "2027-11-20", endDate: "2027-11-22") { unplannedCount } }',
      { t: tripId },
    );
    expect(res.data.updateTripDates.unplannedCount).toBe(1);
    const t = (await gql(owner, DAYS, { t: tripId })).data.trip;
    expect(t.days).toHaveLength(3);
    expect(t.unplannedActivities).toEqual([{ title: 'Last dinner' }]);
    expect(t.outsideBookings).toEqual([{ title: 'Tel Aviv ⇄ Rome' }]); // the return leg, Nov 24
  });

  it('validates dates and needs an editor', async () => {
    const owner = await signIn('demo@tripwise.app');
    const backwards = await gql(
      owner,
      'mutation($t: ID!) { updateTripDates(tripId: $t, startDate: "2027-11-24", endDate: "2027-11-20") { unplannedCount } }',
      { t: tripId },
    );
    expect(backwards.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    const outsider = await signIn('daniel@tripwise.app');
    const res = await gql(
      outsider,
      'mutation($t: ID!) { updateTripDates(tripId: $t, startDate: "2027-11-20", endDate: "2027-11-24") { unplannedCount } }',
      { t: tripId },
    );
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });
});
