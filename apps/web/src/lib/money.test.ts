import { describe, expect, it } from 'vitest';
import { centsToDecimal, equalShares, parseCents } from './money';

describe('client money helpers', () => {
  it('parses and formats', () => {
    expect(parseCents('184')).toBe(18400);
    expect(parseCents('1.5')).toBe(150);
    expect(parseCents('1.234')).toBeNull();
    expect(centsToDecimal(4210)).toBe('42.10');
  });
  it('splits equally like the API', () => {
    expect(equalShares(10000, 3)).toEqual([3334, 3333, 3333]);
  });
});
