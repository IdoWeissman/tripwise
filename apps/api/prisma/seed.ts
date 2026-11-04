/**
 * Seeds a demo account so portfolio visitors can explore without signing up.
 *   email: demo@tripwise.app   password: tripwise-demo
 */
import 'dotenv/config';
import { hashPassword } from '../src/auth/passwords.js';
import { createDb } from '../src/db.js';
import { toBookingData, type BookingInputLike } from '../src/bookings/service.js';
import { computeShares, fromCents, toCents } from '../src/lib/money.js';

const db = createDb(process.env.DATABASE_URL!);
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const passwordHash = await hashPassword('tripwise-demo');
  const people = [
    { email: 'demo@tripwise.app', name: 'Ido' },
    { email: 'maya@tripwise.app', name: 'Maya' },
    { email: 'noa@tripwise.app', name: 'Noa' },
    { email: 'daniel@tripwise.app', name: 'Daniel' },
  ];
  const [ido, maya, noa, daniel] = await Promise.all(
    people.map((p) =>
      db.user.upsert({ where: { email: p.email }, update: {}, create: { ...p, passwordHash } }),
    ),
  );
  if (!ido || !maya || !noa || !daniel) throw new Error('Seed users missing');

  // Reset only the demo account's own sample trip (never other visitors' trips).
  await db.trip.deleteMany({
    where: { name: 'Lisbon with the crew', members: { some: { userId: ido.id, role: 'OWNER' } } },
  });

  const start = new Date(Date.UTC(2027, 4, 14));
  const trip = await db.trip.create({
    data: {
      name: 'Lisbon with the crew',
      destination: 'Lisbon, Portugal',
      timeZone: 'Europe/Lisbon',
      startDate: start,
      endDate: new Date(start.getTime() + 5 * DAY),
      members: {
        create: [
          { userId: ido.id, role: 'OWNER' },
          { userId: maya.id, role: 'EDITOR' },
          { userId: noa.id, role: 'EDITOR' },
          { userId: daniel.id, role: 'VIEWER' },
        ],
      },
      days: {
        create: Array.from({ length: 6 }, (_, i) => ({
          position: i,
          date: new Date(start.getTime() + i * DAY),
        })),
      },
    },
    include: { days: { orderBy: { position: 'asc' } } },
  });
  const day = (i: number) => trip.days[i]!.id;

  type Seed = {
    day?: number;
    by: { id: string };
    title: string;
    location?: string;
    time?: string;
    cost?: string;
    description?: string;
    proposed?: boolean;
  };
  const activities: Seed[] = [
    {
      day: 0,
      by: ido,
      title: 'Check in · Alfama apartment',
      location: 'Rua dos Remédios',
      time: '14:00',
    },
    {
      day: 0,
      by: maya,
      title: 'Dinner at Taberna da Rua',
      location: 'Alfama',
      time: '19:30',
      cost: '35.00',
    },
    {
      day: 1,
      by: noa,
      title: 'Tram 28 + Castelo de São Jorge',
      location: 'Castelo',
      time: '10:00',
      cost: '15.00',
    },
    { day: 2, by: noa, title: 'Sintra day trip', location: 'Sintra', time: '09:00', cost: '22.00' },
    {
      day: 2,
      by: daniel,
      title: 'Lunch in Sintra village',
      location: 'Sintra',
      time: '13:00',
      cost: '20.00',
    },
    { day: 2, by: ido, title: 'Fado night', location: 'Bairro Alto', time: '20:00', cost: '30.00' },
    {
      day: 3,
      by: daniel,
      title: 'Pastéis de Belém + Jerónimos',
      location: 'Belém',
      time: '11:00',
      cost: '12.00',
    },
    {
      day: 1,
      by: maya,
      title: 'Sunset sail on the Tagus',
      location: 'Doca de Alcântara',
      time: '18:30',
      cost: '45.00',
      proposed: true,
      description: 'Two-hour catamaran from Doca de Alcântara. Drinks included, leaves at 18:30.',
    },
    {
      by: daniel,
      title: 'Surf lesson in Ericeira',
      cost: '35.00',
      proposed: true,
      description: 'Beginner group lesson, boards and wetsuits included. 50 min drive from Lisbon.',
    },
    {
      day: 3,
      by: noa,
      title: 'LX Factory brunch + market',
      location: 'Alcântara',
      cost: '18.00',
      proposed: true,
      description: 'Sunday market, bookshops and brunch at a converted factory under the bridge.',
    },
    {
      day: 4,
      by: ido,
      title: 'Bike ride to Cascais',
      location: 'Belém → Cascais',
      cost: '12.00',
      proposed: true,
      description: 'Coastal bike path from Belém, train back. Easy pace, about 3 hours.',
    },
  ];
  const positions = new Map<number, number>();
  const created: { id: string; title: string }[] = [];
  for (const a of activities) {
    const pos = a.day === undefined ? 0 : (positions.get(a.day) ?? 0);
    if (a.day !== undefined && !a.proposed) positions.set(a.day, pos + 1);
    created.push(
      await db.activity.create({
        data: {
          tripId: trip.id,
          dayId: a.day === undefined ? null : day(a.day),
          createdById: a.by.id,
          title: a.title,
          description: a.description ?? null,
          location: a.location ?? null,
          startTime: a.time ?? null,
          costPerPerson: a.cost ?? null,
          status: a.proposed ? 'PROPOSED' : 'SCHEDULED',
          position: a.proposed ? 0 : pos,
        },
      }),
    );
  }
  const byTitle = (t: string) => created.find((c) => c.title === t)!.id;
  await db.vote.createMany({
    data: [
      { activityId: byTitle('Sunset sail on the Tagus'), userId: maya.id },
      { activityId: byTitle('Surf lesson in Ericeira'), userId: daniel.id },
    ],
  });

  const everyone = [ido, maya, noa, daniel].map((u) => ({ userId: u.id }));
  const expenses: [string, string, { id: string }, string, number][] = [
    ['Apartment balance', 'Stay', maya, '318.40', 0],
    ['Groceries', 'Food', ido, '48.50', 0],
    ['Dinner at Taberna da Rua', 'Food', daniel, '184.00', 0],
    ['Tram & castle tickets', 'Activities', noa, '60.00', 1],
    ['Wine & snacks', 'Food', daniel, '71.80', 1],
    ['Fado night tickets', 'Activities', maya, '120.00', 2],
    ['Car rental, 2 days', 'Transport', ido, '161.60', 2],
    ['Sintra train', 'Transport', ido, '88.00', 2],
    ['Airport taxi', 'Transport', ido, '64.00', 0],
    ['Museum passes', 'Activities', noa, '120.00', 3],
    ['Pastelaria + market run', 'Food', noa, '43.70', 3],
  ];
  for (const [description, category, payer, amount, dayIndex] of expenses) {
    const shares = computeShares(toCents(amount), 'EQUAL', everyone);
    await db.expense.create({
      data: {
        tripId: trip.id,
        paidById: payer.id,
        description,
        category,
        amount,
        spentAt: new Date(start.getTime() + dayIndex * DAY + 12 * 60 * 60 * 1000),
        splits: {
          create: shares.map((sh) => ({ userId: sh.userId, amount: fromCents(sh.cents) })),
        },
      },
    });
  }

  // Bookings (times are wall-clock in each place's zone)
  const LIS = 'Europe/Lisbon';
  const book = (
    input: BookingInputLike,
    by: { id: string },
    source: 'MANUAL' | 'EMAIL' | 'PDF' = 'EMAIL',
  ) => {
    const { data, segments } = toBookingData(input, LIS);
    return db.booking.create({
      data: {
        ...data,
        tripId: trip.id,
        createdById: by.id,
        source,
        segments: { create: segments },
      },
    });
  };
  await book(
    {
      type: 'FLIGHT',
      title: 'Tel Aviv ⇄ Lisbon',
      provider: 'TAP Air Portugal',
      confirmationCode: 'K7Q2ZP',
      bookingUrl: 'https://www.flytap.com/en-pt/manage-booking',
      price: '1248.00',
      currency: 'EUR',
      travellers: 4,
      segments: [
        {
          carrier: 'TAP Air Portugal',
          number: 'TP 1394',
          fromCode: 'TLV',
          fromName: 'Tel Aviv',
          toCode: 'LIS',
          toName: 'Lisbon',
          departLocal: '2027-05-14T06:10',
          departTz: 'Asia/Jerusalem',
          arriveLocal: '2027-05-14T10:05',
          arriveTz: LIS,
        },
        {
          carrier: 'TAP Air Portugal',
          number: 'TP 1395',
          fromCode: 'LIS',
          fromName: 'Lisbon',
          toCode: 'TLV',
          toName: 'Tel Aviv',
          departLocal: '2027-05-19T17:40',
          departTz: LIS,
          arriveLocal: '2027-05-20T00:25',
          arriveTz: 'Asia/Jerusalem',
        },
      ],
    },
    ido,
    'PDF',
  );
  await book(
    {
      type: 'STAY',
      title: 'Casa do Largo, Alfama',
      provider: 'Apartment · 5 nights',
      confirmationCode: 'HMX4-22A9',
      startLocal: '2027-05-14T14:00',
      endLocal: '2027-05-19T11:00',
      address: 'Rua dos Remédios 42, Lisbon',
      price: '636.80',
      currency: 'EUR',
      travellers: 4,
      notes: 'Self check-in. Key box code 4471.',
    },
    maya,
  );
  await book(
    {
      type: 'DINING',
      title: 'Taberna da Rua',
      provider: 'Restaurant · table for 4',
      confirmationCode: 'TR-8812',
      startLocal: '2027-05-14T19:30',
      location: 'Alfama',
      travellers: 4,
    },
    maya,
    'MANUAL',
  );
  await book(
    {
      type: 'TOUR',
      title: 'Sunset sail on the Tagus',
      provider: 'Catamaran tour',
      confirmationCode: 'SAIL-3391',
      startLocal: '2027-05-15T18:30',
      endLocal: '2027-05-15T20:30',
      location: 'Doca de Alcântara',
      price: '180.00',
      currency: 'EUR',
      travellers: 4,
    },
    maya,
  );
  await book(
    {
      type: 'TRANSPORT',
      title: 'Sintra train',
      provider: 'Rossio → Sintra · 4 tickets',
      price: '22.00',
      currency: 'EUR',
      travellers: 4,
    },
    noa,
    'MANUAL',
  );
  await book(
    {
      type: 'ATTRACTION',
      title: 'Pena Palace',
      provider: 'Timed entry · 4 adults',
      confirmationCode: 'PNP-77120',
      startLocal: '2027-05-16T09:30',
      location: 'Sintra',
      price: '80.00',
      currency: 'EUR',
      travellers: 4,
    },
    noa,
    'PDF',
  );
  await book(
    {
      type: 'EVENT',
      title: 'Fado night',
      provider: 'Casa da Saudade · 4 tickets',
      confirmationCode: 'FD-20491',
      startLocal: '2027-05-16T20:00',
      endLocal: '2027-05-16T22:30',
      location: 'Bairro Alto',
      price: '120.00',
      currency: 'EUR',
      travellers: 4,
    },
    ido,
  );

  console.log('Seeded demo data. Sign in with demo@tripwise.app / tripwise-demo');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
