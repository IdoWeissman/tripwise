import { describe, expect, it } from 'vitest';
import { matchBooking, normalize } from '../src/bookings/match.js';
import type { BookingModel } from '../src/graphql/models.js';
import { localToInstant } from '../src/lib/time.js';

const TZ = 'Europe/Lisbon';
const DAY = '2027-05-14';

function booking(over: Partial<BookingModel> & { start?: string }): BookingModel {
  const { start, ...rest } = over;
  return {
    id: rest.title ?? 'b',
    tripId: 't',
    createdById: 'u',
    type: 'OTHER',
    status: 'CONFIRMED',
    source: 'MANUAL',
    title: 'Booking',
    provider: null,
    confirmationCode: null,
    bookingUrl: null,
    startsAt: start ? localToInstant(start, TZ) : null,
    endsAt: null,
    timeZone: null,
    location: null,
    address: null,
    price: null,
    currency: null,
    travellers: null,
    notes: null,
    details: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    segments: [],
    ...rest,
  } as BookingModel;
}

const stay = booking({
  type: 'STAY',
  title: 'Casa do Largo, Alfama',
  start: `${DAY}T14:00`,
  address: 'Rua dos Remédios 42, Lisbon',
});
const dinner = booking({
  type: 'DINING',
  title: 'Taberna da Rua',
  start: `${DAY}T19:30`,
  location: 'Alfama',
});
const all = [stay, dinner];

describe('matchBooking', () => {
  it('matches a plan that names the booking at the same time', () => {
    const a = { title: 'Dinner at Taberna da Rua', location: 'Alfama', startTime: '19:30' };
    expect(matchBooking(a, DAY, all, TZ)?.id).toBe(dinner.id);
  });

  it('matches a check-in plan to the stay that starts that day', () => {
    const a = { title: 'Check in · Alfama apartment', location: null, startTime: '14:00' };
    expect(matchBooking(a, DAY, all, TZ)?.id).toBe(stay.id);
  });

  it('matches by place when the time is exact', () => {
    const a = { title: 'Drop the bags', location: 'Rua dos Remédios', startTime: '14:00' };
    expect(matchBooking(a, DAY, all, TZ)?.id).toBe(stay.id);
  });

  it('does not match a different time, a different day, or only a shared neighbourhood', () => {
    expect(
      matchBooking({ title: 'Taberna da Rua', location: null, startTime: '13:00' }, DAY, all, TZ),
    ).toBeNull();
    expect(
      matchBooking(
        { title: 'Taberna da Rua', location: null, startTime: '19:30' },
        '2027-05-15',
        all,
        TZ,
      ),
    ).toBeNull();
    expect(
      matchBooking({ title: 'Walk around', location: 'Alfama', startTime: null }, DAY, all, TZ),
    ).toBeNull();
  });

  it('ignores cancelled bookings', () => {
    const cancelled = booking({ title: 'Fado night', start: `${DAY}T20:00`, status: 'CANCELLED' });
    expect(
      matchBooking(
        { title: 'Fado night', location: null, startTime: '20:00' },
        DAY,
        [cancelled],
        TZ,
      ),
    ).toBeNull();
  });

  it('normalizes accents and punctuation', () => {
    expect(normalize('Pastéis de Belém + Jerónimos!')).toBe('pasteis de belem jeronimos');
  });
});
