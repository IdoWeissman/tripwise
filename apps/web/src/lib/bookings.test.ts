import { describe, expect, it } from 'vitest';
import {
  bookingPrice,
  directions,
  agendaStates,
  bookingRows,
  bookingWhen,
  countdown,
  dayHeading,
  dayShift,
  duration,
  fileExt,
  groupByDay,
  groupRowsByDay,
  untilTime,
  localDayTime,
  reminderWhen,
  splitReminders,
  inDays,
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
    expect(countdown('2027-05-14T01:00:00Z', now)).toBe('passed');
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
  it('splits multi-leg bookings into one row per leg, each on its own day', () => {
    const roundTrip = {
      id: 'f1',
      type: 'FLIGHT' as const,
      segments: [
        { departLocal: '2027-05-14T06:10', arriveLocal: '2027-05-14T10:05' },
        { departLocal: '2027-05-19T17:40', arriveLocal: '2027-05-20T00:25' },
      ],
    };
    const show = { id: 's1', type: 'EVENT' as const, startLocal: '2027-05-16T20:00', segments: [] };
    const undated = { id: 'o1', type: 'OTHER' as const, segments: [] };
    const rows = bookingRows([undated, roundTrip, show]);
    expect(rows.map((r) => [r.key, r.legNo, r.legCount, r.end])).toEqual([
      ['f1:0', 1, 2, '2027-05-14T10:05'],
      ['s1', 0, 0, '2027-05-16T20:00'],
      ['f1:1', 2, 2, '2027-05-20T00:25'],
      ['o1', 0, 0, null],
    ]);
    expect(groupRowsByDay(rows).map((g) => [g.date, g.items.length])).toEqual([
      ['2027-05-14', 1],
      ['2027-05-16', 1],
      ['2027-05-19', 1],
      [null, 1],
    ]);
  });
  it('reads a day as done / now / next', () => {
    const times = ['09:00', '09:30', null, '13:00', '20:00'];
    // 10:00: Pena Palace (09:30) is in progress, not done; lunch is next.
    expect(agendaStates(times, '10:00')).toEqual(['done', 'now', 'untimed', 'next', 'ahead']);
    // 21:00: the last item stays in progress for a while, then counts as done.
    expect(agendaStates(times, '21:00').at(-1)).toBe('now');
    expect(agendaStates(times, '23:30').at(-1)).toBe('done');
    expect(agendaStates(times, '08:00')).toEqual(['next', 'ahead', 'untimed', 'ahead', 'ahead']);
    expect(agendaStates(times, 'past')).toEqual(['done', 'done', 'untimed', 'done', 'done']);
    expect(untilTime('10:00', '13:00')).toBe('in 3 h');
    expect(untilTime('12:20', '13:00')).toBe('in 40 min');
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

describe('reminders on Today', () => {
  // Tue, May 18 2027, 14:10 in Lisbon (UTC+1 in May).
  const now = Date.parse('2027-05-18T13:10:00Z');
  const tz = 'Europe/Lisbon';
  const leave = {
    kind: 'LEAVE_FOR_AIRPORT',
    fireAt: '2027-05-20T13:10:00Z',
    targetAt: '2027-05-20T14:10:00Z',
  };
  const checkIn = {
    kind: 'CHECK_IN_OPENS',
    fireAt: '2027-05-19T15:40:00Z',
    targetAt: '2027-05-20T16:40:00Z',
  };

  it('names the day instead of a long countdown, and the time only when the title lacks it', () => {
    expect(reminderWhen(leave, tz, now)).toBe('Thu, May 20');
    expect(reminderWhen(checkIn, tz, now)).toBe('Tomorrow · 16:40');
    expect(reminderWhen({ ...checkIn, fireAt: '2027-05-18T16:00:00Z' }, tz, now)).toBe(
      'in 2 h 50 min',
    );
    expect(reminderWhen({ ...checkIn, fireAt: '2027-05-18T12:00:00Z' }, tz, now)).toBe('Open now');
    expect(reminderWhen({ ...leave, targetAt: '2027-05-18T22:30:00Z' }, tz, now)).toBe(
      'in 9 h 20 min',
    );
    expect(reminderWhen({ ...leave, targetAt: '2027-05-19T03:00:00Z' }, tz, now)).toBe('Tomorrow');
  });

  it("splits reminders: the board's booking keeps its own, the rest go to the strip and panel", () => {
    const checkOut = {
      kind: 'CHECK_OUT',
      fireAt: '2027-05-20T07:00:00Z',
      targetAt: '2027-05-20T10:00:00Z',
      booking: { id: 's1' },
    };
    const rs = [
      { ...checkIn, booking: { id: 'f1' } },
      checkOut,
      { ...leave, booking: { id: 'f1' } },
    ];
    const split = splitReminders(rs, 'f1');
    // the board already shows Leave by, so only check-in folds into it
    expect(split.board?.kind).toBe('CHECK_IN_OPENS');
    expect(split.others).toEqual([checkOut]);
    // nothing on the board: every reminder is the panel's
    expect(splitReminders(rs, null)).toEqual({ board: undefined, others: rs });
    expect(splitReminders([{ ...leave, booking: { id: 'f1' } }], 'f1')).toEqual({
      board: undefined,
      others: [],
    });
  });

  it('counts whole days to the trip', () => {
    expect(inDays('2027-05-18', '2027-05-18')).toBe('today');
    expect(inDays('2027-05-18', '2027-05-19')).toBe('tomorrow');
    expect(inDays('2027-05-18', '2027-05-30')).toBe('in 12 days');
  });
});
