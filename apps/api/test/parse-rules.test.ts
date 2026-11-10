import { describe, expect, it } from 'vitest';
import {
  findEndLabelled,
  findManageUrl,
  findShowTime,
  findStreetLine,
  placeFromSubject,
  routeFromLines,
} from '../src/bookings/parse/text.js';

describe('importer rules for unseen formats', () => {
  it('names the thing in a boilerplate subject', () => {
    expect(placeFromSubject('Your booking is confirmed at Hotel Aurora')).toBe('Hotel Aurora');
    expect(placeFromSubject('Your tickets for Jazz Night')).toBe('Jazz Night');
    expect(placeFromSubject('Your car rental is confirmed')).toBe('Car rental');
    expect(placeFromSubject('Your booking is confirmed')).toBeNull();
    expect(placeFromSubject('Flight to Rome')).toBeNull();
  });

  it('reads a route written on its own line', () => {
    expect(routeFromLines('Acme - E-ticket\nPorto Campanhã - Lisboa Oriente\nCoach 3')).toBe(
      'Porto Campanhã → Lisboa Oriente',
    );
    expect(routeFromLines('Seats 7A - 7B\nTotal: 10 - 20')).toBeNull();
  });

  it('reads the end from an arrival / drop-off label', () => {
    expect(findEndLabelled('Departure 18/11/2026 09:15   Arrival 18/11/2026 10:51')).toBe(
      '2026-11-18T10:51',
    );
    expect(findEndLabelled('Drop-off: Lyon, Thu 19 Nov 2026 18:00')).toBe('2026-11-19T18:00');
    expect(findEndLabelled('Return 17:30', '2026-11-19')).toBe('2026-11-19T17:30');
    expect(findEndLabelled('Pick-up: Tue 17 Nov 2026 12:00')).toBeNull();
  });

  it('prefers the show time over the doors time', () => {
    expect(findShowTime('Doors 19:30 · Show 20:30')).toBe('20:30');
    expect(findShowTime('Doors 19:30')).toBeNull();
  });

  it('finds an unlabelled street address and the venue above it', () => {
    expect(findStreetLine('Hall Example\nRue Example 12, 75001 Paris\nSat 21 Nov 2026')).toEqual({
      address: 'Rue Example 12, 75001 Paris',
      above: 'Hall Example',
    });
    expect(findStreetLine('Check-in: Wed 18 Nov 2026, 15:00')).toBeNull();
  });

  it('finds a link captioned "View your tickets"', () => {
    expect(findManageUrl('View your tickets: https://t.example/o/AB123.')).toBe(
      'https://t.example/o/AB123',
    );
    expect(findManageUrl('Visit https://t.example/')).toBeNull();
  });
});

describe('importer rules: false positives', () => {
  it('does not turn descriptive subjects into titles', () => {
    expect(placeFromSubject('Your reservation at Hotel X is confirmed')).toBe('Hotel X');
    expect(placeFromSubject('Your reservation for 2 guests')).toBeNull();
    expect(placeFromSubject('Your order for #12345')).toBeNull();
    expect(placeFromSubject('Your booking ref ABC123 is confirmed')).toBeNull();
  });

  it('does not read fare lines as routes or room lines as addresses', () => {
    expect(routeFromLines('Economy - Flexible')).toBeNull();
    expect(routeFromLines('Passenger - Adult')).toBeNull();
    expect(findStreetLine('Thank you\nTerminal 2, Gate B')).toBeNull();
    expect(findStreetLine('Room 12, Floor 3')).toBeNull();
    expect(findStreetLine('Thank you\nVia Example 5, 00100 Roma')?.above).toBeNull();
  });

  it('ignores policy and instruction text for the end time', () => {
    expect(findEndLabelled('Return policy: free cancellation until 10:00')).toBeNull();
    expect(findEndLabelled('Please arrive 15 minutes early, by 09:30')).toBeNull();
  });
});
