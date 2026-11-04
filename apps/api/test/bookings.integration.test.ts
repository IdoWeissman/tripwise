/**
 * Bookings end to end: uploads → drafts → bookings → agenda / Up next / reminders / calendar.
 * Needs a migrated + seeded database and S3 (MinIO from docker-compose). Run with:
 *   pnpm db:seed && pnpm --filter @tripwise/api test:integration
 */
import 'dotenv/config';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.js';
import { loadEnv, type Env } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';
import { createStorage } from '../src/storage.js';
import { hotelEmail } from './fixtures/emails.js';
import { makePdf } from './fixtures/makePdf.js';

const run = process.env.INTEGRATION === '1';

describe.runIf(run)('Bookings API', () => {
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

  const signIn = async (email: string) => {
    const agent = request.agent(server.app);
    await gql(agent, 'mutation($i: SignInInput!) { signIn(input: $i) { user { id } } }', {
      i: { email, password: 'tripwise-demo' },
    });
    return agent;
  };

  beforeAll(async () => {
    env = loadEnv({ ...process.env, NODE_ENV: 'test' });
    db = createDb(env.DATABASE_URL);
    const storage = createStorage(env);
    await storage.ensureReady();
    server = await createApp(env, db, storage);
    owner = await signIn('demo@tripwise.app');
    tripId = (await gql(owner, '{ trips { id name } }')).data.trips.find(
      (t: { name: string }) => t.name === 'Lisbon with the crew',
    ).id;
  });

  afterAll(async () => {
    await server.stop();
    await db.$disconnect();
  });

  it('shows the seeded flight as Up next with local times', async () => {
    const res = await gql(
      owner,
      `query($id: ID!) { trip(id: $id) {
        timeZone
        bookingStats { total needsDetails }
        upNext { startsAt booking { title confirmationCode } segment { number departLocal arriveLocal departTz } }
      } }`,
      { id: tripId },
    );
    const t = res.data.trip;
    expect(t.timeZone).toBe('Europe/Lisbon');
    expect(t.bookingStats).toEqual({ total: 7, needsDetails: 1 });
    expect(t.upNext.booking.confirmationCode).toBe('K7Q2ZP');
    expect(t.upNext.segment).toEqual({
      number: 'TP 1394',
      departLocal: '2027-05-14T06:10',
      arriveLocal: '2027-05-14T10:05',
      departTz: 'Asia/Jerusalem',
    });
  });

  it('builds the day agenda, stay strip and reminders', async () => {
    const days = (
      await gql(
        owner,
        'query($id: ID!) { trip(id: $id) { days { id position bookings { title } stay { night nights isCheckIn isCheckOut booking { title } } } } }',
        { id: tripId },
      )
    ).data.trip.days;
    expect(days[0].stay).toEqual({
      night: 1,
      nights: 5,
      isCheckIn: true,
      isCheckOut: false,
      booking: { title: 'Casa do Largo, Alfama' },
    });
    expect(days[5].stay).toMatchObject({ night: 0, isCheckOut: true });
    expect(days[2].bookings.map((b: { title: string }) => b.title)).toEqual([
      'Pena Palace',
      'Fado night',
    ]);

    const agenda = (
      await gql(
        owner,
        'query($id: ID!, $d: ID!) { trip(id: $id) { agenda(dayId: $d) { kind time title } } }',
        { id: tripId, d: days[0].id },
      )
    ).data.trip.agenda;
    expect(agenda.map((a: { kind: string; time: string }) => `${a.time} ${a.kind}`)).toEqual([
      '06:10 BOOKING',
      '14:00 CHECK_IN',
      '14:00 ACTIVITY',
      '19:30 BOOKING',
      '19:30 ACTIVITY',
    ]);

    const reminders = (
      await gql(owner, 'query($id: ID!) { trip(id: $id) { reminders(limit: 3) { kind title } } }', {
        id: tripId,
      })
    ).data.trip.reminders;
    expect(reminders.map((r: { kind: string }) => r.kind)).toEqual([
      'CHECK_IN_OPENS',
      'LEAVE_FOR_AIRPORT',
      'CHECK_IN_OPENS',
    ]);
    expect(reminders[1].title).toBe('Leave for the airport by 03:40');
  });

  it('uploads an email, turns the draft into a booking and links the file', async () => {
    const res = await owner
      .post(`/api/trips/${tripId}/attachments`)
      .attach('file', hotelEmail(), 'stay.eml');
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('EMAIL');
    const [draft] = res.body.drafts;
    expect(draft).toMatchObject({
      type: 'STAY',
      confirmationCode: 'HMX4-22A9',
      attachmentId: res.body.attachment.id,
    });

    const { fromSource: _f, source, attachmentId, sourceName: _s, ...input } = draft;
    const created = await gql(
      owner,
      `mutation($t: ID!, $i: BookingInput!, $s: BookingSource, $a: [ID!]) {
        createBooking(tripId: $t, input: $i, source: $s, attachmentIds: $a) {
          id status source startLocal endLocal timeZone attachments { fileName url }
        }
      }`,
      { t: tripId, i: { ...input, title: 'Second stay' }, s: source, a: [attachmentId] },
    );
    expect(created.errors).toBeUndefined();
    const b = created.data.createBooking;
    expect(b).toMatchObject({
      status: 'CONFIRMED',
      source: 'EMAIL',
      startLocal: '2027-05-14T14:00',
      endLocal: '2027-05-19T11:00',
      timeZone: '+01:00',
    });
    expect(b.attachments[0].fileName).toBe('stay.eml');

    // The signed URL downloads the original file.
    const file = await fetch(b.attachments[0].url);
    expect(file.status).toBe(200);
    expect(await file.text()).toContain('Casa do Largo');

    await gql(owner, 'mutation($id: ID!) { deleteBooking(id: $id) }', { id: b.id });
  });

  it('reads a PDF, keeps photos without parsing, and rejects other files', async () => {
    const pdf = await owner
      .post(`/api/trips/${tripId}/attachments`)
      .attach(
        'file',
        makePdf([
          'Pena Palace timed entry',
          'Date: 16 May 2027 09:30',
          'Booking reference: PNP77120',
        ]),
        'tickets.pdf',
      );
    expect(pdf.status).toBe(201);
    expect(pdf.body.drafts[0]).toMatchObject({
      type: 'ATTRACTION',
      confirmationCode: 'PNP77120',
      startLocal: '2027-05-16T09:30',
    });

    const photo = await owner
      .post(`/api/trips/${tripId}/attachments`)
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'IMG_2041.jpg');
    expect(photo.status).toBe(201);
    expect(photo.body).toMatchObject({ kind: 'IMAGE', drafts: [] });

    const exe = await owner
      .post(`/api/trips/${tripId}/attachments`)
      .attach('file', Buffer.from('MZ\u0090\u0000binary'), 'evil.pdf');
    expect(exe.status).toBe(415);

    const daniel = await signIn('daniel@tripwise.app'); // viewer
    const denied = await daniel
      .post(`/api/trips/${tripId}/attachments`)
      .attach('file', makePdf(['x']), 'x.pdf');
    expect(denied.status).toBe(403);

    for (const id of [pdf.body.attachment.id, photo.body.attachment.id]) {
      expect(
        (await gql(owner, 'mutation($id: ID!) { deleteAttachment(id: $id) }', { id })).data
          .deleteAttachment,
      ).toBe(true);
    }
  });

  it('validates manual bookings and edits', async () => {
    const bad = await gql(
      owner,
      'mutation($t: ID!, $i: BookingInput!) { createBooking(tripId: $t, input: $i) { id } }',
      {
        t: tripId,
        i: { type: 'EVENT', title: 'x', bookingUrl: 'javascript:alert(1)' },
      },
    );
    expect(bad.errors?.[0]?.message).toContain('web address');

    const made = await gql(
      owner,
      'mutation($t: ID!, $i: BookingInput!) { createBooking(tripId: $t, input: $i) { id status missingFields } }',
      {
        t: tripId,
        i: { type: 'TRANSPORT', title: 'Airport taxi' },
      },
    );
    expect(made.data.createBooking).toMatchObject({
      status: 'NEEDS_DETAILS',
      missingFields: ['departure time'],
    });

    const edited = await gql(
      owner,
      'mutation($id: ID!, $i: BookingInput!) { updateBooking(id: $id, input: $i) { status startLocal timeZone } }',
      {
        id: made.data.createBooking.id,
        i: { type: 'TRANSPORT', title: 'Airport taxi', startLocal: '2027-05-19T14:30' },
      },
    );
    expect(edited.data.updateBooking).toEqual({
      status: 'CONFIRMED',
      startLocal: '2027-05-19T14:30',
      timeZone: 'Europe/Lisbon',
    });
    await gql(owner, 'mutation($id: ID!) { deleteBooking(id: $id) }', {
      id: made.data.createBooking.id,
    });
  });

  it('parses pasted text and serves a calendar feed', async () => {
    const drafts = (
      await gql(
        owner,
        'mutation($t: ID!, $x: String!) { parseBookingText(tripId: $t, text: $x) { type title confirmationCode startLocal source } }',
        {
          t: tripId,
          x: 'Subject: Booking confirmation for Fado night\nTickets x4 · 16 May 2027 at 20:00 · Order #FD-20491',
        },
      )
    ).data.parseBookingText;
    expect(drafts[0]).toMatchObject({
      title: 'Fado night',
      confirmationCode: 'FD-20491',
      startLocal: '2027-05-16T20:00',
      source: 'TEXT',
    });

    const url = (
      await gql(owner, 'query($id: ID!) { trip(id: $id) { calendarUrl } }', { id: tripId })
    ).data.trip.calendarUrl as string;
    const path = new URL(url).pathname;
    const ics = await request(server.app).get(`${path}?include=bookings,activities`);
    expect(ics.status).toBe(200);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('SUMMARY:Flight TP 1394 TLV → LIS');
    expect(ics.text).toContain('Fado night');
    expect((await request(server.app).get('/cal/not-a-token.ics')).status).toBe(404);
  });

  it('saves reminder preferences per person', async () => {
    const res = await gql(
      owner,
      'mutation($t: ID!) { updateReminderPreferences(tripId: $t, input: { startingSoon: true, email: true }) { checkIn startingSoon email } }',
      { t: tripId },
    );
    expect(res.data.updateReminderPreferences).toEqual({
      checkIn: true,
      startingSoon: true,
      email: true,
    });
    await gql(
      owner,
      'mutation($t: ID!) { updateReminderPreferences(tripId: $t, input: { startingSoon: false, email: false }) { email } }',
      { t: tripId },
    );
  });
});
