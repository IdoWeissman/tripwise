import { describe, expect, it } from 'vitest';
import {
  bookingPrice,
  directions,
  bookingWhen,
  countdown,
  dayHeading,
  dayShift,
  duration,
  fileExt,
  groupByDay,
  localDayTime,
} from './bookings';

describe('booking formatting', () => {
  it('formats wall-clock strings without time-zone math', () => {
    expect(localDayTime('2027-05-14T06:10')).toBe('Fri, May 14 · 06:10');
    expect(localDayTime('2027-05-14')).toBe('Fri, May 14');
    expect(dayShift('2027-05-19T17:40', '2027-05-20T00:25')).toBe(' +1');
  });
  it('formats durations and countdowns', () => {
    expect(duration('2027-05-14T03:10:00Z', '2027-05-14T09:05:00Z')).toBe('5 h 55 min');
    const now = Date.parse('2027-05-14T01:35:00Z');
    expect(countdown('2027-05-14T03:10:00Z', now)).toBe('in 1 h 35 min');
    expect(countdown('2027-05-20T03:10:00Z', now)).toBe('in 6 days');
  });
  it('labels files', () => {
    expect(fileExt('TAP e-ticket.pdf', 'application/pdf')).toBe('PDF');
    expect(fileExt('message', 'message/rfc822')).toBe('EML');
  });
});

describe('booking cards', () => {
  const flight = {
    type: 'FLIGHT' as const,
    travellers: 4,
    segments: [{ departLocal: '2027-05-19T17:40', arriveLocal: '2027-05-20T00:25' }],
  };
  it('describes when a booking happens', () => {
    expect(bookingWhen(flight)).toBe('17:40 – 00:25 +1 · 4 passengers');
    expect(
      bookingWhen({
        type: 'STAY',
        startLocal: '2027-05-14T14:00',
        endLocal: '2027-05-19T11:00',
        segments: [],
      }),
    ).toBe('Check-in Fri, May 14 · 14:00 → check-out Wed, May 19 · 11:00');
    expect(bookingWhen({ type: 'TRANSPORT', segments: [] })).toBe('Date and time missing');
  });
  it('groups by start day with undated bookings last', () => {
    const groups = groupByDay([
      { type: 'OTHER' as const, segments: [] },
      flight,
      { type: 'EVENT' as const, startLocal: '2027-05-16T20:00', segments: [] },
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2027-05-16', '2027-05-19', null]);
    expect(dayHeading('2027-05-16', '2027-05-14', '2027-05-19')).toBe('Sun, May 16 · Day 3');
    expect(dayHeading('2027-05-21', '2027-05-14', '2027-05-19')).toBe('Fri, May 21');
  });
  it('formats prices', () => {
    expect(bookingPrice('1248', 'EUR')).toBe('€1,248.00');
    expect(bookingPrice(null, 'EUR')).toBeNull();
  });
});

describe('directions', () => {
  it('goes to the departure airport for flights and the venue otherwise', () => {
    expect(
      directions({ type: 'FLIGHT' }, { fromCode: 'TLV', fromName: 'Ben Gurion Intl Arpt' }),
    ).toEqual({
      url: 'https://www.google.com/maps/dir/?api=1&destination=Ben%20Gurion%20Intl%20Arpt%20TLV',
      label: 'Directions to TLV',
    });
    expect(directions({ type: 'FLIGHT' }, { fromCode: 'FCO' })!.url).toContain('FCO%20airport');
    expect(
      directions({ type: 'TOUR', location: 'Caffe Example', address: 'Piazza Example 5, Roma' })!
        .url,
    ).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Caffe%20Example%2C%20Piazza%20Example%205%2C%20Roma',
    );
    expect(directions({ type: 'EVENT' })).toBeNull();
  });
});
