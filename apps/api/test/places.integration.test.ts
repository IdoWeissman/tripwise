/**
 * Real places end to end against the seeded database, with Google Places replaced by a fake that
 * speaks its wire format. Run with:  pnpm db:seed && pnpm --filter @tripwise/api test:integration
 */
import 'dotenv/config';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';
import { MemoryStorage } from '../src/storage.js';

const run = process.env.INTEGRATION === '1';
const MARKET = 'ChIJtestMarket000001';
const HOTEL = 'ChIJtestHotel0000001';

describe.runIf(run)('Places', () => {
  let db: Db;
  let server: App;
  let bare: App;
  let tripId = '';
  const calls: { url: string; mask: string | null }[] = [];
  const created: string[] = [];

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith('https://places.googleapis.com/')) throw new Error(`Unexpected ${url}`);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, mask: headers['X-Goog-FieldMask'] ?? null });
    if (url.includes(':searchText')) {
      const { textQuery } = JSON.parse(String(init!.body)) as { textQuery: string };
      const hotel = /hotel|casa/i.test(textQuery);
      return Response.json({
        places: [
          hotel
            ? {
                id: HOTEL,
                displayName: { text: 'Test Hotel' },
                location: { latitude: 38.71, longitude: -9.13 },
              }
            : {
                id: MARKET,
                displayName: { text: 'Test Market' },
                shortFormattedAddress: 'Av. Teste 1',
                location: { latitude: 38.707, longitude: -9.146 },
                primaryTypeDisplayName: { text: 'Market' },
              },
        ],
      });
    }
    if (url.includes('/media'))
      return Response.json({ photoUri: 'https://lh3.googleusercontent.com/p/test' });
    if (headers['X-Goog-FieldMask'] === 'id,location')
      return Response.json({ id: MARKET, location: { latitude: 38.707, longitude: -9.146 } });
    return Response.json({
      id: MARKET,
      displayName: { text: 'Test Market' },
      formattedAddress: 'Av. Teste 1, Lisboa',
      rating: 4.5,
      userRatingCount: 900,
      priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
      regularOpeningHours: { weekdayDescriptions: ['Monday: 10:00 AM – 11:00 PM'] },
      googleMapsUri: 'https://maps.google.com/?cid=test',
      photos: [
        { name: `places/${MARKET}/photos/P1`, authorAttributions: [{ displayName: 'Ana' }] },
      ],
    });
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

  beforeAll(async () => {
    const base = { ...process.env, NODE_ENV: 'test' };
    const env = loadEnv({
      ...base,
      GOOGLE_PLACES_API_KEY: 'test',
      GOOGLE_MAPS_BROWSER_KEY: 'browser-key',
    });
    db = createDb(env.DATABASE_URL);
    server = await createApp(env, db, new MemoryStorage(), { fetch: fakeFetch, mailer: null });
    bare = await createApp(
      loadEnv({ ...base, GOOGLE_PLACES_API_KEY: '', GOOGLE_MAPS_BROWSER_KEY: '' }),
      db,
      new MemoryStorage(),
      { mailer: null },
    );
    tripId = (await db.trip.findFirstOrThrow({ where: { name: 'Lisbon with the crew' } })).id;
  });

  afterAll(async () => {
    await db.activity.deleteMany({ where: { id: { in: created } } });
    await db.booking.updateMany({
      where: { tripId },
      data: { placeId: null, placeLookupAt: null },
    });
    await db.place.deleteMany({ where: { googlePlaceId: { in: [MARKET, HOTEL] } } });
    await server.stop();
    await bare.stop();
    await db.$disconnect();
  });

  it('searches near the destination and reports what is configured', async () => {
    const owner = await signIn(server, 'demo@tripwise.app');
    const res = await gql(
      owner,
      `query($t: ID!) { maps { placesEnabled mapEnabled browserKey mapId }
        placeSuggestions(tripId: $t, query: "time out market") { googlePlaceId name address kind lat lng } }`,
      { t: tripId },
    );
    expect(res.data.maps).toEqual({
      placesEnabled: true,
      mapEnabled: true,
      browserKey: 'browser-key',
      mapId: 'DEMO_MAP_ID',
    });
    expect(res.data.placeSuggestions[0]).toMatchObject({
      googlePlaceId: MARKET,
      name: 'Test Market',
    });
    const search = calls.find((c) => c.url.includes(':searchText'))!;
    expect(search.mask).not.toMatch(/rating|OpeningHours/);
  });

  it('attaches a place with coordinates from Google, and shows live details', async () => {
    const owner = await signIn(server, 'demo@tripwise.app');
    const res = await gql(
      owner,
      `mutation($i: ProposeActivityInput!) { proposeActivity(input: $i) {
        id place { googlePlaceId lat lng details { name rating priceLevel openingHours mapsUrl photoUrl photoAuthors { name } } } } }`,
      { i: { tripId, title: 'Test Market', googlePlaceId: MARKET } },
    );
    expect(res.errors).toBeUndefined();
    created.push(res.data.proposeActivity.id);
    expect(res.data.proposeActivity.place).toMatchObject({
      googlePlaceId: MARKET,
      lat: 38.707,
      details: {
        name: 'Test Market',
        rating: 4.5,
        priceLevel: 1,
        photoUrl: 'https://lh3.googleusercontent.com/p/test',
        photoAuthors: [{ name: 'Ana' }],
      },
    });
    // Only the id and coordinates are stored.
    const row = await db.place.findUniqueOrThrow({ where: { googlePlaceId: MARKET } });
    expect(Object.keys(row).sort()).toEqual(['coordsAt', 'googlePlaceId', 'id', 'lat', 'lng']);
  });

  it('opens only places the trip uses', async () => {
    const owner = await signIn(server, 'demo@tripwise.app');
    const placeId = (await db.place.findUniqueOrThrow({ where: { googlePlaceId: MARKET } })).id;
    const q = 'query($t: ID!, $p: ID!) { place(tripId: $t, id: $p) { id details { name } } }';
    const ok = await gql(owner, q, { t: tripId, p: placeId });
    expect(ok.data.place.details.name).toBe('Test Market');
    const other = await db.trip.findFirst({
      where: { id: { not: tripId }, members: { some: { user: { email: 'demo@tripwise.app' } } } },
    });
    if (other) {
      const no = await gql(owner, q, { t: other.id, p: placeId });
      expect(no.data.place).toBeNull();
    }
  });

  it('matches a stay to a place once', async () => {
    const owner = await signIn(server, 'demo@tripwise.app');
    const q = `query($t: ID!) { trip(id: $t) { bookings { type place { googlePlaceId } } } }`;
    const first = await gql(owner, q, { t: tripId });
    const stay = first.data.trip.bookings.find((b: { type: string }) => b.type === 'STAY');
    expect(stay.place).toEqual({ googlePlaceId: HOTEL });
    const searches = calls.filter((c) => c.url.includes(':searchText')).length;
    await gql(owner, q, { t: tripId });
    expect(calls.filter((c) => c.url.includes(':searchText')).length).toBe(searches);
  });

  it('lets editors change places, not viewers', async () => {
    const viewer = await signIn(server, 'daniel@tripwise.app');
    const denied = await gql(
      viewer,
      'mutation($a: ID!, $g: String) { setActivityPlace(activityId: $a, googlePlaceId: $g) { id } }',
      { a: created[0], g: null },
    );
    expect(denied.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    const owner = await signIn(server, 'demo@tripwise.app');
    const removed = await gql(
      owner,
      'mutation($a: ID!, $g: String) { setActivityPlace(activityId: $a, googlePlaceId: $g) { place { id } } }',
      { a: created[0], g: null },
    );
    expect(removed.data.setActivityPlace.place).toBeNull();
  });

  it('keeps working without Google keys', async () => {
    const owner = await signIn(bare, 'demo@tripwise.app');
    const res = await gql(
      owner,
      `query($t: ID!) { maps { placesEnabled mapEnabled browserKey } placeSuggestions(tripId: $t, query: "market") { name } }`,
      { t: tripId },
    );
    expect(res.data).toEqual({
      maps: { placesEnabled: false, mapEnabled: false, browserKey: null },
      placeSuggestions: [],
    });
    const attach = await gql(
      owner,
      `mutation($i: ProposeActivityInput!) { proposeActivity(input: $i) { id } }`,
      { i: { tripId, title: 'x', googlePlaceId: MARKET } },
    );
    expect(attach.errors?.[0]?.message).toMatch(/isn’t set up/);
  });
});
