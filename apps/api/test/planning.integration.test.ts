/**
 * The day planner end to end, with Google Places and Routes replaced by fakes that speak their
 * wire formats. Run with:  pnpm db:seed && pnpm --filter @tripwise/api test:integration
 */
import 'dotenv/config';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';
import { clearPlanInfoCache } from '../src/planning/service.js';
import { clearTravelCache } from '../src/planning/travel.js';
import { MemoryStorage } from '../src/storage.js';

const run = process.env.INTEGRATION === '1';

/** Three places on a north–south line: 0.01° = 10 minutes' walk in the fake Routes. */
const PLACES = {
  alpha: { id: 'ChIJtestPlanAlpha001', lat: 38.7, type: 'tourist_attraction' },
  beta: { id: 'ChIJtestPlanBeta0001', lat: 38.72, type: 'tourist_attraction' },
  gamma: { id: 'ChIJtestPlanGamma001', lat: 38.71, type: 'museum' },
} as const;
const LNG = -9.14;

describe.runIf(run)('Day planner', () => {
  let db: Db;
  let server: App;
  let bare: App;
  let tripId = '';
  let dayId = '';
  const ids: Record<string, string> = {};
  const calls: { url: string; mask: string | null; mode?: string }[] = [];

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const mask = headers['X-Goog-FieldMask'] ?? null;
    if (url.startsWith('https://routes.googleapis.com/')) {
      const body = JSON.parse(String(init!.body)) as {
        origins: { waypoint: { location: { latLng: { latitude: number } } } }[];
        travelMode: string;
      };
      calls.push({ url, mask, mode: body.travelMode });
      const lat = body.origins.map((o) => o.waypoint.location.latLng.latitude);
      return Response.json(
        lat.flatMap((a, o) =>
          lat.map((b, d) => ({
            originIndex: o,
            destinationIndex: d,
            duration: `${Math.round(Math.abs(a - b) * 1000) * 60}s`,
            distanceMeters: Math.round(Math.abs(a - b) * 111_000),
            condition: 'ROUTE_EXISTS',
          })),
        ),
      );
    }
    if (!url.startsWith('https://places.googleapis.com/')) throw new Error(`Unexpected ${url}`);
    calls.push({ url, mask });
    const place = Object.values(PLACES).find((p) => url.includes(p.id));
    if (url.includes(':searchText')) {
      const { textQuery } = JSON.parse(String(init!.body)) as { textQuery: string };
      const p = PLACES[textQuery.toLowerCase() as keyof typeof PLACES];
      return Response.json({
        places: p
          ? [
              {
                id: p.id,
                displayName: { text: textQuery },
                location: { latitude: p.lat, longitude: LNG },
              },
            ]
          : [],
      });
    }
    if (!place) return new Response('not found', { status: 404 });
    if (mask === 'id,location')
      return Response.json({ id: place.id, location: { latitude: place.lat, longitude: LNG } });
    if (mask === 'id,primaryType,regularOpeningHours.periods') {
      // The museum is closed on Mondays and open 10–18 otherwise; the rest never close.
      const periods =
        place.type === 'museum'
          ? [0, 2, 3, 4, 5, 6].map((day) => ({
              open: { day, hour: 10, minute: 0 },
              close: { day, hour: 18, minute: 0 },
            }))
          : [{ open: { day: 0, hour: 0, minute: 0 } }];
      return Response.json({
        id: place.id,
        primaryType: place.type,
        regularOpeningHours: { periods },
      });
    }
    return Response.json({ id: place.id, displayName: { text: 'x' } });
  };

  const gql = async (agent: ReturnType<typeof request.agent>, query: string, variables = {}) =>
    (await agent.post('/graphql').send({ query, variables })).body as {
      data?: any;
      errors?: any[];
    };
  const signIn = async (app: App, email: string) => {
    const agent = request.agent(app.app);
    await gql(agent, 'mutation($i: SignInInput!) { signIn(input: $i) { user { id } } }', {
      i: { email, password: 'tripwise-demo' },
    });
    return agent;
  };

  const PLAN = `query($t: ID!) { trip(id: $t) { pace getAround days { id plan {
    stops { activity { title } start end durationMinutes durationEstimated travel { minutes mode estimated } }
    issues { kind message activityId blocking } travelMinutes startTime endTime travelEstimated } } } }`;

  beforeAll(async () => {
    const base = { ...process.env, NODE_ENV: 'test' };
    db = createDb(loadEnv(base).DATABASE_URL);
    server = await createApp(
      loadEnv({ ...base, GOOGLE_PLACES_API_KEY: 'test' }),
      db,
      new MemoryStorage(),
      {
        fetch: fakeFetch,
        mailer: null,
      },
    );
    bare = await createApp(
      loadEnv({ ...base, GOOGLE_PLACES_API_KEY: '' }),
      db,
      new MemoryStorage(),
      {
        mailer: null,
      },
    );
    clearPlanInfoCache();
    clearTravelCache();

    const owner = await signIn(server, 'demo@tripwise.app');
    const trip = await gql(
      owner,
      'mutation($i: CreateTripInput!) { createTrip(input: $i) { id days { id date } } }',
      {
        i: {
          name: 'Planner test trip',
          destination: 'Lisbon',
          startDate: '2027-03-01', // a Monday
          endDate: '2027-03-02',
          timeZone: 'Europe/Lisbon',
        },
      },
    );
    tripId = trip.data.createTrip.id;
    dayId = trip.data.createTrip.days[0].id;
    for (const name of ['alpha', 'beta', 'gamma']) {
      const res = await gql(
        owner,
        'mutation($i: ProposeActivityInput!) { proposeActivity(input: $i) { id } }',
        {
          i: {
            tripId,
            title: name,
            dayId,
            scheduleNow: true,
            googlePlaceId: PLACES[name as 'alpha'].id,
          },
        },
      );
      expect(res.errors).toBeUndefined();
      ids[name] = res.data.proposeActivity.id;
    }
  });

  afterAll(async () => {
    if (tripId) await db.trip.delete({ where: { id: tripId } });
    await db.place.deleteMany({
      where: { googlePlaceId: { in: Object.values(PLACES).map((p) => p.id) } },
    });
    await server.stop();
    await bare.stop();
    await db.$disconnect();
  });

  it('lays out the day with travel times and flags a museum closed on Mondays', async () => {
    const owner = await signIn(server, 'demo@tripwise.app');
    const res = await gql(owner, PLAN, { t: tripId });
    expect(res.errors).toBeUndefined();
    expect(res.data.trip).toMatchObject({ pace: 'BALANCED', getAround: 'WALK_TRANSIT' });
    const plan = res.data.trip.days.find((d: { id: string }) => d.id === dayId).plan;
    expect(plan.stops).toMatchObject([
      {
        activity: { title: 'alpha' },
        start: '09:30',
        end: '10:30',
        durationEstimated: true,
        travel: null,
      },
      {
        activity: { title: 'beta' },
        start: '10:50',
        travel: { minutes: 20, mode: 'WALK', estimated: false },
      },
      { activity: { title: 'gamma' }, durationMinutes: 120, travel: { minutes: 10 } },
    ]);
    expect(plan.travelMinutes).toBe(30);
    expect(plan.issues).toEqual([
      {
        kind: 'CLOSED',
        message: 'Closed on Mondays (planned 12:00–14:00)',
        activityId: ids.gamma,
        blocking: true,
      },
    ]);
    // Hours are fetched with their own small field mask; a day without places costs nothing.
    expect(
      calls.filter((c) => c.mask === 'id,primaryType,regularOpeningHours.periods'),
    ).toHaveLength(3);
    expect(calls.filter((c) => c.mode)).toEqual([expect.objectContaining({ mode: 'WALK' })]);
  });

  it('arranges the day by route, and only when it is better', async () => {
    const owner = await signIn(server, 'demo@tripwise.app');
    const preview = await gql(
      owner,
      'query($t: ID!) { trip(id: $t) { days { id arrangement { better savedMinutes reason plan { stops { activity { title } start } } } } } }',
      { t: tripId },
    );
    const arrangement = preview.data.trip.days.find(
      (d: { id: string }) => d.id === dayId,
    ).arrangement;
    expect(arrangement).toMatchObject({
      better: true,
      savedMinutes: 10,
      reason: 'Saves 10 min of travel',
    });

    const applied = await gql(owner, 'mutation($d: ID!) { arrangeDay(dayId: $d) { id } }', {
      d: dayId,
    });
    expect(applied.errors).toBeUndefined();
    const rows = await db.activity.findMany({ where: { dayId }, orderBy: { position: 'asc' } });
    expect(rows.map((r) => [r.title, r.startTime])).toEqual([
      ['alpha', '09:30'],
      ['gamma', '10:40'],
      ['beta', '12:50'],
    ]);
    // Running it again changes nothing.
    const again = await gql(
      owner,
      'query($t: ID!) { trip(id: $t) { days { id arrangement { better reason } } } }',
      { t: tripId },
    );
    expect(again.data.trip.days.find((d: { id: string }) => d.id === dayId).arrangement).toEqual({
      better: false,
      reason: 'This day is already in a good order.',
    });
  });

  it('sets timing and the trip pace, for editors only, with validation', async () => {
    const owner = await signIn(server, 'demo@tripwise.app');
    const bad = await gql(
      owner,
      'mutation($a: ID!) { setActivityTiming(activityId: $a, startTime: "25:00", durationMinutes: 30) { id } }',
      { a: ids.beta },
    );
    expect(bad.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    const ok = await gql(
      owner,
      'mutation($a: ID!) { setActivityTiming(activityId: $a, startTime: "16:00", durationMinutes: 45) { startTime durationMinutes } }',
      { a: ids.beta },
    );
    expect(ok.data.setActivityTiming).toEqual({ startTime: '16:00', durationMinutes: 45 });

    const pace = await gql(
      owner,
      'mutation($t: ID!) { updateTripPlanning(tripId: $t, pace: RELAXED, getAround: DRIVE) { pace getAround } }',
      { t: tripId },
    );
    expect(pace.data.updateTripPlanning).toEqual({ pace: 'RELAXED', getAround: 'DRIVE' });

    const outsider = await signIn(server, 'daniel@tripwise.app');
    for (const q of [
      'mutation($t: ID!) { updateTripPlanning(tripId: $t, pace: PACKED, getAround: DRIVE) { pace } }',
    ]) {
      const res = await gql(outsider, q, { t: tripId });
      expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    }
    const arrange = await gql(outsider, 'mutation($d: ID!) { arrangeDay(dayId: $d) { id } }', {
      d: dayId,
    });
    expect(arrange.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });

  it('works without Google keys: estimated travel, no opening-hours checks', async () => {
    const owner = await signIn(bare, 'demo@tripwise.app');
    const res = await gql(owner, PLAN, { t: tripId });
    expect(res.errors).toBeUndefined();
    const plan = res.data.trip.days.find((d: { id: string }) => d.id === dayId).plan;
    expect(plan.travelEstimated).toBe(true);
    expect(plan.stops[1].travel).toMatchObject({ mode: 'DRIVE', estimated: true });
    expect(plan.issues.filter((i: { kind: string }) => i.kind === 'CLOSED')).toEqual([]);
  });
});
