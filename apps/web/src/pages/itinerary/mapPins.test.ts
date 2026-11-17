import { describe, expect, it } from 'vitest';
import { spread } from './mapPins';

describe('map pins', () => {
  it('fans out pins at the same spot, and leaves pins far apart where they are', () => {
    const out = spread([
      { key: 'stay', lat: 38.7139, lng: -9.1334 },
      { key: 'breakfast', lat: 38.71391, lng: -9.13341 },
      { key: 'sintra', lat: 38.7976, lng: -9.3904 },
    ]);
    expect(out.get('stay')).toEqual({ lat: 38.7139, lng: -9.1334 });
    expect(out.get('sintra')).toEqual({ lat: 38.7976, lng: -9.3904 });
    const moved = out.get('breakfast')!;
    expect(moved).not.toEqual({ lat: 38.71391, lng: -9.13341 });
    // still right there: within ~100 m of the anchor
    expect(Math.abs(moved.lat - 38.7139)).toBeLessThan(0.001);
    expect(Math.abs(moved.lng - -9.1334)).toBeLessThan(0.001);
  });
});
