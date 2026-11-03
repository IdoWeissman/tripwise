/**
 * Seeds a demo account so portfolio visitors can explore without signing up.
 *   email: demo@tripwise.app   password: tripwise-demo
 */
import 'dotenv/config';
import { hashPassword } from '../src/auth/passwords.js';
import { createDb } from '../src/db.js';

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

  await db.trip.deleteMany({ where: { name: 'Lisbon with the crew' } });

  const start = new Date(Date.UTC(2027, 4, 14));
  const trip = await db.trip.create({
    data: {
      name: 'Lisbon with the crew',
      destination: 'Lisbon, Portugal',
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

  await db.activity.createMany({
    data: [
      {
        tripId: trip.id,
        dayId: day(0),
        createdById: ido.id,
        title: 'Check in · Alfama apartment',
        location: 'Rua dos Remédios',
        startTime: '14:00',
        status: 'SCHEDULED',
        position: 0,
      },
      {
        tripId: trip.id,
        dayId: day(0),
        createdById: maya.id,
        title: 'Dinner at Taberna da Rua',
        location: 'Alfama',
        startTime: '19:30',
        costPerPerson: '35.00',
        status: 'SCHEDULED',
        position: 1,
      },
      {
        tripId: trip.id,
        dayId: day(1),
        createdById: noa.id,
        title: 'Tram 28 + Castelo de São Jorge',
        location: 'Castelo',
        startTime: '10:00',
        costPerPerson: '15.00',
        status: 'SCHEDULED',
        position: 0,
      },
      {
        tripId: trip.id,
        dayId: day(2),
        createdById: noa.id,
        title: 'Sintra day trip',
        location: 'Sintra',
        startTime: '09:00',
        costPerPerson: '22.00',
        status: 'SCHEDULED',
        position: 0,
      },
      {
        tripId: trip.id,
        dayId: day(1),
        createdById: maya.id,
        title: 'Sunset sail on the Tagus',
        description: 'Two-hour catamaran from Doca de Alcântara.',
        location: 'Doca de Alcântara',
        startTime: '18:30',
        costPerPerson: '45.00',
      },
      {
        tripId: trip.id,
        createdById: daniel.id,
        title: 'Surf lesson in Ericeira',
        description: 'Beginner group lesson, boards included.',
        costPerPerson: '35.00',
      },
    ],
  });

  const dinner = await db.expense.create({
    data: {
      tripId: trip.id,
      paidById: daniel.id,
      description: 'Dinner at Taberna da Rua',
      category: 'Food',
      amount: '184.00',
    },
  });
  await db.expenseSplit.createMany({
    data: [ido, maya, noa, daniel].map((u) => ({
      expenseId: dinner.id,
      userId: u.id,
      amount: '46.00',
    })),
  });

  console.log('Seeded demo data. Sign in with demo@tripwise.app / tripwise-demo');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
