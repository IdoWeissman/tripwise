import { describe, expect, it } from 'vitest';
import {
  arrangeDay,
  closedReason,
  kindOf,
  planDay,
  type DayInput,
  type Leg,
  type Period,
  type StopInput,
} from '../src/planning/plan.js';

/** Points on a line, 10 minutes' walk apart per step; point 0 is the stay. */
const line =
  (positions: number[]) =>
  (a: number, b: number): Leg => ({
    minutes: Math.abs(positions[a]! - positions[b]!) * 10,
    mode: 'WALK',
    meters: null,
    estimated: false,
  });

const stop = (id: string, over: Partial<StopInput> = {}): StopInput => ({
  id,
  title: id,
  startTime: null,
  durationMinutes: 60,
  fixed: false,
  point: null,
  kind: 'SIGHT',
  hours: null,
  ...over,
});

const day = (over: Partial<DayInput>): DayInput => ({
  weekday: 1, // Monday
  pace: 'BALANCED',
  stops: [],
  anchor: null,
  travel: line([0]),
  ...over,
});

/** Open every day from `open` to `close` (hours), except `closedOn` weekdays. */
const daily = (open: number, close: number, closedOn: number[] = []): Period[] =>
  [0, 1, 2, 3, 4, 5, 6]
    .filter((d) => !closedOn.includes(d))
    .map((d) => ({
      open: { day: d, hour: open, minute: 0 },
      close: { day: d, hour: close, minute: 0 },
    }));

describe('opening hours', () => {
  it('explains why a visit does not fit', () => {
    const museum = daily(10, 18, [1]);
    expect(closedReason(museum, 1, 600, 720)).toBe('Closed on Mondays');
    expect(closedReason(museum, 2, 540, 660)).toBe('Opens at 10:00');
    expect(closedReason(museum, 2, 1020, 1110)).toBe('Closes at 18:00');
    expect(closedReason(museum, 2, 1110, 1170)).toBe('Closed after 18:00');
    expect(closedReason(museum, 2, 600, 1080)).toBeNull();
  });

  it('handles places open past midnight and around the clock', () => {
    const bar: Period[] = [
      { open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
    ];
    expect(closedReason(bar, 5, 22 * 60, 23 * 60 + 30)).toBeNull();
    expect(closedReason([{ open: { day: 0, hour: 0, minute: 0 } }], 3, 0, 1439)).toBeNull();
  });
});

describe('planDay', () => {
  it('lays untimed stops out from the morning, travel included, and waits for opening', () => {
    const plan = planDay(
      day({
        anchor: 0,
        travel: line([0, 1, 2]),
        stops: [stop('a', { point: 1 }), stop('b', { point: 2, hours: daily(12, 18) })],
      }),
    );
    // Leave 09:30, 10 min walk → 09:40–10:40; 10 min on, but b opens at 12:00.
    expect(plan.stops.map((s) => [s.start, s.end])).toEqual([
      [580, 640],
      [720, 780],
    ]);
    expect(plan.travelMinutes).toBe(10 + 10 + 20); // there, between, back to the stay
    expect(plan.issues).toEqual([]);
  });

  it('flags a stop planned when the place is closed', () => {
    const plan = planDay(
      day({ stops: [stop('museum', { startTime: '10:00', hours: daily(10, 18, [1]) })] }),
    );
    expect(plan.issues).toMatchObject([
      { kind: 'CLOSED', activityId: 'museum', message: 'Closed on Mondays (planned 10:00–11:00)' },
    ]);
  });

  it('flags connections without enough travel time, and overlaps', () => {
    const plan = planDay(
      day({
        travel: line([0, 0, 3, 3]),
        stops: [
          stop('a', { startTime: '10:00', point: 1 }),
          stop('b', { startTime: '11:10', point: 2 }), // 30 min away, 10 min after a ends
          stop('c', { startTime: '11:30', point: 3 }), // b ends 12:10
        ],
      }),
    );
    expect(plan.issues.map((i) => [i.kind, i.activityId])).toEqual([
      ['TIGHT', 'b'],
      ['OVERLAP', 'c'],
    ]);
    expect(plan.issues[0]!.message).toBe('30 min walk from a, but only 10 min between them');
  });

  it('keeps plans inside the free window around flights and away from booked events', () => {
    const plan = planDay(
      day({
        from: { at: 15 * 60, reason: 'the flight lands at 13:30' },
        until: { at: 20 * 60, reason: 'leave for the airport by 20:00' },
        blocks: [{ title: 'Fado show', from: 18 * 60, until: 20 * 60 }],
        stops: [
          stop('lunch', { startTime: '14:00' }),
          stop('walk', { startTime: '17:30' }),
          stop('late', { startTime: '19:30' }),
        ],
      }),
    );
    expect(plan.issues.map((i) => [i.kind, i.activityId])).toEqual([
      ['OUTSIDE_WINDOW', 'lunch'],
      ['BOOKING_CLASH', 'walk'],
      ['OUTSIDE_WINDOW', 'late'],
      ['BOOKING_CLASH', 'late'],
    ]);
    expect(plan.issues[0]!.message).toBe("Before you're free: the flight lands at 13:30");
  });

  it('warns when a day is too full for the pace, or leaves no time for lunch', () => {
    const stops = ['a', 'b', 'c', 'd'].map((id, i) =>
      stop(id, { startTime: `${String(9 + i * 2).padStart(2, '0')}:00`, durationMinutes: 120 }),
    );
    const relaxed = planDay(day({ pace: 'RELAXED', stops }));
    expect(relaxed.issues.map((i) => i.kind)).toEqual(['PACKED', 'NO_LUNCH']);
    expect(relaxed.issues[0]!.message).toBe('4 stops and 8 h out — a lot for a relaxed pace');
    const packed = planDay(day({ pace: 'PACKED', stops }));
    expect(packed.issues.map((i) => i.kind)).toEqual(['NO_LUNCH']);
    // A restaurant at lunchtime is lunch.
    const fed = planDay(
      day({ pace: 'PACKED', stops: stops.map((s, i) => (i === 1 ? { ...s, kind: 'FOOD' } : s)) }),
    );
    expect(fed.issues).toEqual([]);
  });

  it('flags long trips across town for the pace', () => {
    const plan = planDay(
      day({ anchor: 0, travel: line([0, 5]), stops: [stop('far', { point: 1 })] }),
    );
    expect(plan.issues).toMatchObject([
      { kind: 'LONG_TRAVEL', message: '50 min walk from where you stay' },
    ]);
  });
});

describe('arrangeDay', () => {
  // Stay at 0; stops scattered so the saved order zig-zags.
  const travel = line([0, 3, 1, 4, 2]);
  const zigzag = ['far', 'near', 'farthest', 'mid'].map((id, i) => stop(id, { point: i + 1 }));

  it('orders stops by route from the stay and times them, saving travel', () => {
    const before = planDay(day({ anchor: 0, travel, stops: zigzag }));
    const r = arrangeDay(day({ anchor: 0, travel, stops: zigzag }));
    expect(r.better).toBe(true);
    expect(r.order.map((o) => o.id)).toEqual(['near', 'mid', 'far', 'farthest']);
    expect(r.order[0]!.startTime).toBe('09:40');
    expect(r.plan.travelMinutes).toBeLessThan(before.travelMinutes);
    expect(r.savedMinutes).toBe(before.travelMinutes - r.plan.travelMinutes);
    expect(r.plan.endsAt!).toBeLessThanOrEqual(before.endsAt!);
  });

  it('never makes a day worse, and says so when it is already good', () => {
    const good = ['near', 'mid', 'far'].map((id, i) => stop(id, { point: [2, 4, 1][i]! }));
    const r = arrangeDay(day({ anchor: 0, travel, stops: good }));
    expect(r.better).toBe(false);
    expect(r.reason).toBe('This day is already in a good order.');
  });

  it('keeps booked stops and stops without a place in their slots', () => {
    const stops = [
      zigzag[0]!,
      stop('dinner', { fixed: true, startTime: '19:00', point: 4 }),
      stop('somewhere', { point: null }),
      ...zigzag.slice(1),
    ];
    const r = arrangeDay(day({ anchor: 0, travel, stops }));
    expect(r.order[1]!.id).toBe('dinner');
    expect(r.order[1]!.startTime).toBe('19:00');
    expect(r.order[2]!.id).toBe('somewhere');
  });

  it('moves a visit away from closing time even without saving travel', () => {
    const stops = [
      stop('a', { point: 1, durationMinutes: 120 }),
      stop('b', { point: 1, hours: daily(9, 11) }), // closes at 11: must go first
    ];
    const r = arrangeDay(day({ travel: line([0, 1]), stops }));
    expect(planDay(day({ travel: line([0, 1]), stops })).issues[0]!.kind).toBe('CLOSED');
    expect(r.better).toBe(true);
    expect(r.order.map((o) => o.id)).toEqual(['b', 'a']);
    expect(r.plan.issues).toEqual([]);
  });
});

describe('kindOf', () => {
  it('maps Google types to what the planner reasons about', () => {
    expect(kindOf('italian_restaurant')).toBe('FOOD');
    expect(kindOf('coffee_shop')).toBe('CAFE');
    expect(kindOf('art_gallery')).toBe('MUSEUM');
    expect(kindOf('book_store')).toBe('SHOP');
    expect(kindOf('tourist_attraction')).toBe('SIGHT');
    expect(kindOf('dentist')).toBe('OTHER');
    expect(kindOf(null)).toBeNull();
  });
});

describe('arrangeDay start time', () => {
  it('starts earlier only when that fixes a problem', () => {
    const hours: Period[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      open: { day: d, hour: 9, minute: 30 },
      close: { day: d, hour: 13, minute: 0 },
    }));
    const stops = [
      stop('castle', { point: 1, startTime: '11:30', durationMinutes: 120, hours }),
      stop('market', { point: 2 }),
    ];
    const r = arrangeDay(day({ anchor: 0, travel: line([0, 1, 2]), stops }));
    expect(r.better).toBe(true);
    expect(r.order[0]).toEqual({ id: 'castle', startTime: '09:40' });
    expect(r.plan.issues).toEqual([]);
  });
});
