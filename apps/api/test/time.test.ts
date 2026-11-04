import { describe, expect, it } from 'vitest';
import {
  instantToLocal,
  isValidZone,
  localDate,
  localToInstant,
  zoneOffsetMinutes,
} from '../src/lib/time.js';

describe('time zones', () => {
  it('converts Lisbon wall-clock time to UTC and back (summer time)', () => {
    const i = localToInstant('2027-05-14T10:05', 'Europe/Lisbon');
    expect(i.toISOString()).toBe('2027-05-14T09:05:00.000Z');
    expect(instantToLocal(i, 'Europe/Lisbon')).toBe('2027-05-14T10:05');
  });

  it('handles fixed offsets from emails', () => {
    const i = localToInstant('2027-05-14T06:10', '+03:00');
    expect(i.toISOString()).toBe('2027-05-14T03:10:00.000Z');
    expect(zoneOffsetMinutes(i, '-05:30')).toBe(-330);
  });

  it('places late flights on the right local day', () => {
    // 00:25 in Tel Aviv on the 20th is still the 19th in UTC
    const i = localToInstant('2027-05-20T00:25', 'Asia/Jerusalem');
    expect(localDate(i, 'Asia/Jerusalem')).toBe('2027-05-20');
    expect(localDate(i, 'UTC')).toBe('2027-05-19');
  });

  it('survives DST transitions', () => {
    // Lisbon springs forward on 2027-03-28 at 01:00
    expect(localToInstant('2027-03-28T12:00', 'Europe/Lisbon').toISOString()).toBe(
      '2027-03-28T11:00:00.000Z',
    );
    expect(localToInstant('2027-03-27T12:00', 'Europe/Lisbon').toISOString()).toBe(
      '2027-03-27T12:00:00.000Z',
    );
  });

  it('validates zones', () => {
    expect(isValidZone('Europe/Lisbon')).toBe(true);
    expect(isValidZone('+01:00')).toBe(true);
    expect(isValidZone('Mars/Olympus')).toBe(false);
  });
});
