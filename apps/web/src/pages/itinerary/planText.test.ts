import { describe, expect, it } from 'vitest';
import { canArrange } from './planText';

const stop = (opts: { place?: boolean; booked?: boolean }) => ({
  activity: {
    place: opts.place ? { id: 'p' } : null,
    booking: opts.booked ? { id: 'b' } : null,
  },
});

describe('Arrange this day', () => {
  it('needs two stops it can move: with a place, and not standing for a booking', () => {
    expect(canArrange([stop({ place: true }), stop({ place: true })])).toBe(true);
    // the dead end the server answers with "nothing to re-order"
    expect(canArrange([stop({ place: true }), stop({})])).toBe(false);
    expect(canArrange([stop({ place: true }), stop({ place: true, booked: true })])).toBe(false);
    expect(canArrange([])).toBe(false);
  });
});
