import { randomUUID } from 'node:crypto';
import type { Db } from '../../src/db.js';
import { localToInstant } from '../../src/lib/time.js';

const TZ = 'Europe/Lisbon';
const at = (local: string) => localToInstant(local, TZ);

/** Builds an invented trip for the retrieval eval and returns its id. Remove with deleteFixture. */
export async function createFixture(db: Db): Promise<string> {
  const user = await db.user.findFirstOrThrow({ where: { email: 'demo@tripwise.app' } });
  const trip = await db.trip.create({
    data: {
      name: 'Retrieval eval trip',
      destination: 'Lisbon, Portugal',
      startDate: new Date('2031-05-14'),
      endDate: new Date('2031-05-19'),
      timeZone: TZ,
      members: { create: { userId: user.id, role: 'OWNER' } },
      days: {
        create: Array.from({ length: 6 }, (_, i) => ({
          date: new Date(Date.UTC(2031, 4, 14 + i)),
          position: i,
        })),
      },
    },
    include: { days: { orderBy: { position: 'asc' } } },
  });
  const day = (n: number) => trip.days[n]!.id;
  const booking = (data: Record<string, unknown>) =>
    db.booking.create({ data: { tripId: trip.id, createdById: user.id, ...data } as never });

  const flight = await booking({
    type: 'FLIGHT',
    title: 'Tel Aviv ⇄ Lisbon',
    provider: 'TAP Air Portugal',
    confirmationCode: 'QZX9KD',
    travellers: 4,
    startsAt: at('2031-05-14T06:10'),
    timeZone: 'Asia/Jerusalem',
    segments: {
      create: [
        {
          position: 0,
          carrier: 'TP',
          number: '1357',
          fromCode: 'TLV',
          fromName: 'Tel Aviv',
          toCode: 'LIS',
          toName: 'Lisbon',
          departsAt: localToInstant('2031-05-14T06:10', 'Asia/Jerusalem'),
          departTz: 'Asia/Jerusalem',
          arriveTz: TZ,
        },
        {
          position: 1,
          carrier: 'TP',
          number: '1358',
          fromCode: 'LIS',
          fromName: 'Lisbon',
          toCode: 'TLV',
          toName: 'Tel Aviv',
          departsAt: at('2031-05-19T17:40'),
          departTz: TZ,
          arriveTz: 'Asia/Jerusalem',
        },
      ],
    },
  });
  const stay = await booking({
    type: 'STAY',
    title: 'Casa Inventada, Alfama',
    provider: 'Apartment · 5 nights',
    startsAt: at('2031-05-14T15:00'),
    endsAt: at('2031-05-19T11:00'),
    address: 'Rua Inventada 7, Lisboa',
  });
  const fado = await booking({
    type: 'EVENT',
    title: 'Fado night',
    provider: 'Casa do Fado Inventado',
    startsAt: at('2031-05-16T20:00'),
    location: 'Bairro Alto',
  });
  await booking({
    type: 'ATTRACTION',
    title: 'Pena Palace',
    provider: 'Timed entry',
    startsAt: at('2031-05-16T09:30'),
    location: 'Sintra',
  });
  await booking({
    type: 'DINING',
    title: 'Taberna Inventada',
    provider: 'Table for 4',
    startsAt: at('2031-05-14T19:30'),
    location: 'Alfama',
  });

  const activity = (title: string, data: Record<string, unknown>) =>
    db.activity.create({
      data: { tripId: trip.id, createdById: user.id, title, ...data } as never,
    });
  await activity('Sintra day trip', {
    status: 'SCHEDULED',
    dayId: day(2),
    startTime: '09:00',
    location: 'Sintra',
  });
  await activity('Sunset sail on the Tagus', {
    status: 'SCHEDULED',
    dayId: day(1),
    startTime: '18:30',
    description: 'Two-hour catamaran from the docks.',
  });
  await activity('Tram 28 + Castelo de São Jorge', {
    status: 'SCHEDULED',
    dayId: day(1),
    startTime: '10:00',
    location: 'Castelo',
  });
  await activity('Dinner at Taberna Inventada', {
    status: 'SCHEDULED',
    dayId: day(0),
    startTime: '19:30',
    location: 'Alfama',
  });
  await activity('Surf lesson in Ericeira', {
    description: 'Beginner group lesson, boards and wetsuits included.',
  });
  await activity('Bike ride to Cascais', { description: 'Coastal bike path, train back.' });

  const expense = (description: string, amount: string, category: string) =>
    db.expense.create({
      data: { tripId: trip.id, paidById: user.id, description, amount, category },
    });
  await expense('Airport taxi', '64.00', 'Transport');
  await expense('Groceries', '48.50', 'Food');
  await expense('Pastelaria + market run', '43.70', 'Food');
  await expense('Museum passes', '120.00', 'Activities');

  const doc = (fileName: string, bookingId: string, extractedText: string) =>
    db.attachment.create({
      data: {
        tripId: trip.id,
        bookingId,
        uploadedById: user.id,
        fileName,
        mimeType: 'text/plain',
        sizeBytes: extractedText.length,
        storageKey: `eval/${randomUUID()}`,
        extractedText,
      },
    });
  await doc(
    'casa-inventada.eml',
    stay.id,
    `Your stay at Casa Inventada is confirmed\n\nArrival from 15:00. Self check-in: the keys are in a key box next to the blue door, code 4821. Departure by 11:00 — leave the keys in the box.\nWi-Fi: CasaInventada / password azulejo2031.\nQuiet hours 22:00–08:00. No parties.`,
  );
  await doc(
    'tap-booking.pdf',
    flight.id,
    `Booking confirmation QZX9KD\nPassengers: 4 adults\nFare: Classic. Baggage allowance: 1 checked bag of 23 kg per passenger and 1 cabin bag of 8 kg.\nOnline check-in opens 36 hours before departure.`,
  );
  await doc(
    'fado-tickets.eml',
    fado.id,
    `4 tickets — Fado night at Casa do Fado Inventado\nDoors open 19:30, show at 20:00. Smart casual attire, please. Dinner is optional and served before the show.`,
  );
  return trip.id;
}

export async function deleteFixture(db: Db, tripId: string) {
  await db.trip.delete({ where: { id: tripId } });
}
