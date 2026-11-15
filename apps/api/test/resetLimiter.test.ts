import { describe, expect, it } from 'vitest';
import { createResetLimiter } from '../src/auth/resetLimiter.js';

const MIN = 60_000;

describe('reset email limit', () => {
  it('allows 3 sent reset emails per address per hour, until the oldest is an hour old', () => {
    const limiter = createResetLimiter();
    const t0 = Date.parse('2027-05-16T09:00:00Z');
    for (const m of [0, 10, 20]) {
      expect(limiter.allows('shir@example.com', t0 + m * MIN)).toBe(true);
      limiter.recordSent('shir@example.com', t0 + m * MIN);
    }
    expect(limiter.allows('shir@example.com', t0 + 30 * MIN)).toBe(false);
    // the first one leaves the window at t0 + 60 min
    expect(limiter.allows('shir@example.com', t0 + 59 * MIN)).toBe(false);
    expect(limiter.allows('shir@example.com', t0 + 61 * MIN)).toBe(true);
  });

  it('only counts emails that were actually sent', () => {
    const limiter = createResetLimiter();
    const t0 = Date.parse('2027-05-16T09:00:00Z');
    // asking (e.g. while email is down) uses up nothing
    for (let i = 0; i < 5; i++) expect(limiter.allows('shir@example.com', t0)).toBe(true);
  });

  it('counts each address on its own, ignoring case', () => {
    const limiter = createResetLimiter();
    const t0 = Date.parse('2027-05-16T09:00:00Z');
    for (let i = 0; i < 3; i++) limiter.recordSent('Shir@Example.com', t0);
    expect(limiter.allows('shir@example.com', t0)).toBe(false);
    expect(limiter.allows('noa@example.com', t0)).toBe(true);
  });
});
