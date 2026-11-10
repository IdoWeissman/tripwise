import { describe, expect, it, vi } from 'vitest';
import { draftsFromAi, extractWithAi } from '../src/bookings/parse/ai.js';
import { draftsFromCalendar, parseCalendar } from '../src/bookings/parse/calendar.js';
import { parseFile, reconcile } from '../src/bookings/parse/index.js';
import {
  findDates,
  findDurationMinutes,
  findPrice,
  findProvider,
  findTimeSpan,
  findTravellers,
  isNoiseSubject,
  labelValue,
  stripForwardHeaders,
} from '../src/bookings/parse/text.js';
import { flightTitle } from '../src/bookings/parse/title.js';
import {
  forwardedAirlineEmail,
  forwardedHebrewHotelEmail,
  forwardedHebrewTourEmail,
} from './fixtures/emails.js';

describe('forwarded airline email with calendar attachments', () => {
  it('reads every field without AI', async () => {
    const [d, ...rest] = await parseFile(forwardedAirlineEmail(), 'EMAIL', 'FW booking.eml');
    expect(rest).toEqual([]);
    expect(d).toMatchObject({
      type: 'FLIGHT',
      title: 'Tel Aviv ⇄ Rome',
      provider: 'Example Air',
      confirmationCode: 'QX7MLB',
      bookingUrl: 'https://www.example-air.test/myflights/mmb?ref=QX7MLB',
      price: '324.97',
      currency: 'USD',
      travellers: 1,
    });
    expect(d!.segments).toEqual([
      expect.objectContaining({
        number: 'AZ 815',
        fromCode: 'TLV',
        fromName: 'Ben Gurion Intl Arpt',
        toCode: 'FCO',
        departLocal: '2026-11-17T08:30',
        departTz: '+02:00',
        arriveLocal: '2026-11-17T11:20',
        arriveTz: '+01:00',
      }),
      expect.objectContaining({
        number: 'AZ 810',
        departLocal: '2026-11-19T22:50',
        arriveLocal: '2026-11-20T03:10',
        arriveTz: '+02:00',
      }),
    ]);
    expect(d!.fromSource).not.toContain('fromSource');
  });
});

describe('forwarded Hebrew hotel confirmation', () => {
  it('reads the stay, not the forwarding headers', async () => {
    const [d, ...rest] = await parseFile(forwardedHebrewHotelEmail(), 'EMAIL', 'FW booking.eml');
    expect(rest).toEqual([]);
    expect(d).toMatchObject({
      type: 'STAY',
      title: 'Hotel Aurora',
      provider: 'Superior Double Room · 2 nights',
      confirmationCode: '4821-7730',
      startLocal: '2026-11-17T14:00',
      endLocal: '2026-11-19T11:00',
      address: 'Via Example 12, Rome',
      price: '1396.00',
      currency: 'ILS',
      travellers: 2,
      notes: 'Booked via Sky Travel',
    });
  });

  it('understands Hebrew dates, labels on their own line and forward chains', () => {
    expect(findDates('נוב׳ 17, 2026 · 12 בנוב׳ 2026 · 3 בדצמבר 2026')).toEqual([
      '2026-11-17',
      '2026-11-12',
      '2026-12-03',
    ]);
    expect(labelValue('מספר הזמנה:\n\n4821-1111\n', /מספר הזמנה/)).toBe('4821-1111');
    expect(
      stripForwardHeaders(
        'From: Ann <ann@gmail.com>\nSent: Monday, 7 September 2026 14:43\nCheck-in 15:00',
      ),
    ).toBe('Check-in 15:00');
    // A ticket's own "Date:" line is not a forwarding header.
    expect(stripForwardHeaders('Date: 16 May 2027  Entry: 09:30')).toContain('09:30');
    expect(
      findProvider(
        'From: Ann <ann@gmail.com>\nFrom: Rome Hotels Reservations <noreply@romehotels.test>',
        {
          name: 'Ann',
          address: 'ann@yahoo.com',
        },
      ),
    ).toBe('Rome Hotels');
    expect(findProvider('no headers', { name: 'Ann', address: 'ann@yahoo.com' })).toBeNull();
    expect(
      findProvider('no headers', { name: 'Booking.com', address: 'noreply@booking.com' }),
    ).toBe('Booking.com');
  });
});

describe('forwarded Hebrew tour ticket', () => {
  it('reads the product, time span, meeting point and order number', async () => {
    const [d] = await parseFile(forwardedHebrewTourEmail(), 'EMAIL', 'ticket.eml');
    expect(d).toMatchObject({
      type: 'TOUR',
      title: 'Trastevere street food walk',
      provider: 'Food Walks',
      confirmationCode: 'FW-7770001',
      startLocal: '2026-11-18T10:00',
      endLocal: '2026-11-18T13:30',
      location: 'Caffe Example',
      address: 'Piazza Example 5, 00153 Roma, איטליה',
      travellers: 4,
      price: '60.00',
      currency: 'EUR',
    });
  });

  it('knows when a subject is only a date and a code', () => {
    expect(isNoiseSubject("הזמנה: יום ד׳ 18.נוב׳ '26 @ 10:00 (FW-T5550001)")).toBe(true);
    expect(isNoiseSubject('Booking confirmed: Wed 18 Nov 2026 at 10:00')).toBe(true);
    expect(isNoiseSubject('Your tickets for La Traviata')).toBe(false);
    expect(findDurationMinutes('Duration: 2 hours')).toBe(120);
    expect(findTimeSpan('Wed 18 Nov, 21:00–00:30')).toEqual({ start: '21:00', end: '00:30' });
  });
});

describe('AI usage reporting', () => {
  it('reports tokens and latency for each call (used by the evals)', async () => {
    const seen: { inputTokens: number; outputTokens: number; model: string }[] = [];
    const fake = (async () =>
      new Response(
        JSON.stringify({
          content: [{ type: 'tool_use', name: 'record_bookings', input: { bookings: [] } }],
          usage: { input_tokens: 1200, output_tokens: 90 },
        }),
      )) as unknown as typeof fetch;
    await extractWithAi(
      { apiKey: 'k', model: 'test-model', fetch: fake, onUsage: (u) => seen.push(u) },
      { text: 'x' },
    );
    expect(seen).toEqual([
      expect.objectContaining({ model: 'test-model', inputTokens: 1200, outputTokens: 90 }),
    ]);
  });
});

describe('calendar files', () => {
  it('keeps zoned times and turns other events into their own bookings', () => {
    const events = parseCalendar(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;TZID=Europe/Rome:20261118T203000',
        'DTEND;TZID=Europe/Rome:20261118T230000',
        'SUMMARY:La Traviata – Teatro dell\\, Opera',
        'LOCATION:Piazza Beniamino Gigli 7\\, Rome',
        'DESCRIPTION:Order FD-77120\\n2 tickets',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    );
    expect(draftsFromCalendar(events)).toEqual([
      expect.objectContaining({
        title: 'La Traviata – Teatro dell, Opera',
        startLocal: '2026-11-18T20:30',
        endLocal: '2026-11-18T23:00',
        timeZone: 'Europe/Rome',
        location: 'Piazza Beniamino Gigli 7, Rome',
        confirmationCode: 'FD-77120',
      }),
    ]);
  });

  it('titles trips by their destination, not their connections', () => {
    const leg = (from: string, to: string, dep: string, arr: string) => ({
      fromCode: from,
      toCode: to,
      departLocal: dep,
      arriveLocal: arr,
      departTz: 'UTC',
      arriveTz: 'UTC',
    });
    const legs = [
      leg('TLV', 'ZRH', '2026-11-17T06:00', '2026-11-17T09:00'),
      leg('ZRH', 'FCO', '2026-11-17T10:30', '2026-11-17T12:00'),
      leg('FCO', 'ZRH', '2026-11-22T08:00', '2026-11-22T09:30'),
      leg('ZRH', 'TLV', '2026-11-22T11:00', '2026-11-22T16:00'),
    ];
    expect(flightTitle(legs, { TLV: 'Tel Aviv', FCO: 'Rome' })).toBe('Tel Aviv ⇄ Rome');
    expect(flightTitle(legs.slice(0, 2))).toBe('TLV → FCO');
  });
});

describe('text details', () => {
  it('prefers labelled totals and ignores legal footers', () => {
    expect(
      findPrice('Fare\nUSD 130.00\nFinal price\nUSD  324.97\nShare Capital EUR 792.682.926,83'),
    ).toEqual({
      price: '324.97',
      currency: 'USD',
    });
  });
  it("doesn't borrow the previous line's label for an amount with its own text", () => {
    expect(
      findPrice(
        'Original price: €150.00\nTotal paid: €120.00\nCancellation insurance covers up to €500.00',
      ),
    ).toEqual({ price: '120.00', currency: 'EUR' });
  });
  it('counts travellers without reading across lines', () => {
    expect(findTravellers('USD 130.00\n\nTicket number: 1')).toBeNull();
    expect(findTravellers('Tickets x4')).toBe(4);
    expect(findTravellers('Passengers\nMr Avi Levi\nMs Noa Levi')).toBe(2);
  });
});

describe('AI extraction', () => {
  const aiBooking = {
    type: 'FLIGHT',
    title: 'Tel Aviv ⇄ Rome',
    provider: 'Example Air',
    confirmationCode: null,
    price: '324.97',
    currency: 'usd',
    travellers: 1,
    notes: '1 carry-on (8 kg) and 1 personal item per passenger',
    bookingUrl: 'javascript:alert(1)',
    segments: [
      {
        number: 'AZ 815',
        fromCode: 'TLV',
        toCode: 'FCO',
        departLocal: '2026-11-17T06:30',
        departTz: 'Asia/Jerusalem',
      },
      {
        number: 'AZ810',
        fromCode: 'FCO',
        toCode: 'tlv',
        departLocal: 'Nov 19 22:50',
        departTz: 'Mars/Base',
      },
    ],
  };

  it('validates every field the model returns', () => {
    const [d] = draftsFromAi({ bookings: [aiBooking, { type: 'STAY' }] });
    expect(d).toMatchObject({ currency: 'USD', bookingUrl: null, notes: aiBooking.notes });
    expect(d!.segments).toHaveLength(1); // the leg with an unreadable time is dropped
    expect(draftsFromAi({ nope: true })).toEqual([]);
  });

  it('lets exact calendar times win and fills gaps from the rules', async () => {
    const [rules] = await parseFile(forwardedAirlineEmail(), 'EMAIL', 'x.eml');
    const ai = draftsFromAi({ bookings: [{ ...aiBooking, segments: [aiBooking.segments[0]] }] });
    const [d] = reconcile(ai, [rules!], rules!.segments);
    expect(d!.segments[0]).toMatchObject({
      departLocal: '2026-11-17T08:30',
      departTz: 'Asia/Jerusalem',
      fromName: 'Ben Gurion Intl Arpt',
    });
    expect(d).toMatchObject({
      confirmationCode: 'QX7MLB',
      bookingUrl: 'https://www.example-air.test/myflights/mmb?ref=QX7MLB',
    });
  });

  it('sends the email to Claude with a forced tool call and falls back on errors', async () => {
    const fake = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_bookings' });
      expect(body.messages[0].content.at(-1).text).toContain('Subject: FW: Thank you');
      return new Response(
        JSON.stringify({
          content: [
            { type: 'tool_use', name: 'record_bookings', input: { bookings: [aiBooking] } },
          ],
        }),
      );
    });
    const drafts = await parseFile(forwardedAirlineEmail(), 'EMAIL', 'x.eml', {
      ai: { apiKey: 'test', model: 'test-model', fetch: fake as unknown as typeof fetch },
    });
    expect(fake).toHaveBeenCalledOnce();
    expect(drafts[0]).toMatchObject({
      title: 'Tel Aviv ⇄ Rome',
      notes: aiBooking.notes,
      confirmationCode: 'QX7MLB',
    });

    const failing = vi.fn(async () => new Response('overloaded', { status: 529 }));
    const fallback = await parseFile(forwardedAirlineEmail(), 'EMAIL', 'x.eml', {
      ai: { apiKey: 'test', model: 'test-model', fetch: failing as unknown as typeof fetch },
    });
    expect(fallback[0]).toMatchObject({ price: '324.97', segments: expect.any(Array) });
    expect(
      await extractWithAi(
        {
          apiKey: 'k',
          model: 'm',
          fetch: (async () => {
            throw new Error('offline');
          }) as typeof fetch,
        },
        { text: 'x' },
      ),
    ).toBeNull();
  });
});
