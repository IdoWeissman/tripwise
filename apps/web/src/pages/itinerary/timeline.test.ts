import { describe, expect, it } from 'vitest';
import { bookingTimeOn, dayTimeline, legOn, orderedActivities } from './timeline';

const leg = (id: string, departLocal: string, arriveLocal: string) => ({
  id,
  number: id,
  fromCode: null,
  toCode: null,
  departLocal,
  arriveLocal,
});

const roundTrip = {
  segments: [
    leg('TP1394', '2027-05-14T06:10', '2027-05-14T10:05'),
    leg('TP1395', '2027-05-19T17:40', '2027-05-19T22:30'),
  ],
  startLocal: '2027-05-14T06:10',
};

describe('legOn', () => {
  it('picks the leg that departs on the day, not the first one', () => {
    expect(legOn(roundTrip, '2027-05-14')?.id).toBe('TP1394');
    expect(legOn(roundTrip, '2027-05-19')?.id).toBe('TP1395');
    expect(bookingTimeOn(roundTrip, '2027-05-19')).toBe('17:40');
  });

  it('falls back to a leg arriving that day, then the first leg', () => {
    const overnight = { segments: [leg('LH1', '2027-05-14T23:30', '2027-05-15T05:10')] };
    expect(legOn(overnight, '2027-05-15')?.id).toBe('LH1');
    expect(legOn({ segments: [] }, '2027-05-15')).toBeUndefined();
  });
});

describe('dayTimeline', () => {
  const times: Record<string, string | null> = { tram: '10:00', dinner: '19:30', walk: null };
  const timeOf = (id: string) => times[id];
  const sail = { segments: [], startLocal: '2027-05-15T18:30' };
  const noTime = { segments: [], startLocal: null };

  it('interleaves bookings and plans by time, untimed plans then untimed bookings last', () => {
    const order = dayTimeline(['walk', 'dinner', 'tram'], timeOf, [noTime, sail], '2027-05-15');
    expect(order.map((e) => (e.kind === 'booking' ? (e.time ?? 'booking?') : e.id))).toEqual([
      'tram',
      '18:30',
      'dinner',
      'walk',
      'booking?',
    ]);
  });

  it('puts the booking first at the same minute and keeps saved order for untimed plans', () => {
    const t = { a: '18:30', b: null, c: null } as Record<string, string | null>;
    const order = dayTimeline(['c', 'a', 'b'], (id) => t[id], [sail], '2027-05-15');
    expect(order.map((e) => (e.kind === 'booking' ? 'sail' : e.id))).toEqual([
      'sail',
      'a',
      'c',
      'b',
    ]);
    expect(orderedActivities(['c', 'a', 'b'], (id) => t[id])).toEqual(['a', 'c', 'b']);
  });
});
