import { describe, expect, it } from 'vitest';
import { parseFile, parseText, sniff } from '../src/bookings/parse/index.js';
import {
  findConfirmationCode,
  findDates,
  findPrice,
  guessType,
  titleFromLines,
} from '../src/bookings/parse/text.js';
import { flightEmail, hotelEmail, restaurantEmail } from './fixtures/emails.js';
import { makePdf } from './fixtures/makePdf.js';

describe('file sniffing', () => {
  it('detects real types from bytes', () => {
    expect(sniff(makePdf(['hi']))?.kind).toBe('PDF');
    expect(sniff(flightEmail())?.kind).toBe('EMAIL');
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.kind).toBe(
      'IMAGE',
    );
    expect(sniff(Buffer.from('MZ\u0090\u0000 not allowed'))).toBeNull();
  });
});

describe('schema.org emails', () => {
  it('merges a round-trip flight for several passengers into one booking', async () => {
    const [d, ...rest] = await parseFile(flightEmail(), 'EMAIL', 'tap.eml');
    expect(rest).toHaveLength(0);
    expect(d).toMatchObject({
      type: 'FLIGHT',
      title: 'Tel Aviv ⇄ Lisbon',
      provider: 'TAP Air Portugal',
      confirmationCode: 'K7Q2ZP',
      bookingUrl: 'https://www.flytap.com/manage?pnr=K7Q2ZP',
      price: '1248.00',
      currency: 'EUR',
      travellers: 2,
      startLocal: '2027-05-14T06:10',
      timeZone: '+03:00',
    });
    expect(d!.segments).toHaveLength(2);
    expect(d!.segments[1]).toMatchObject({
      number: 'TP 1395',
      fromCode: 'LIS',
      toCode: 'TLV',
      departLocal: '2027-05-19T17:40',
      departTz: '+01:00',
      arriveLocal: '2027-05-20T00:25',
      arriveTz: '+03:00',
    });
    expect(d!.fromSource).toEqual(
      expect.arrayContaining(['confirmationCode', 'segments', 'price']),
    );
  });

  it('reads hotel and restaurant reservations', async () => {
    const [stay] = await parseFile(hotelEmail(), 'EMAIL', 'stay.eml');
    expect(stay).toMatchObject({
      type: 'STAY',
      title: 'Casa do Largo, Alfama',
      startLocal: '2027-05-14T14:00',
      endLocal: '2027-05-19T11:00',
      address: 'Rua dos Remédios 42, Lisbon, PT',
      travellers: 4,
      price: '636.80',
    });
    const [table] = await parseFile(restaurantEmail(), 'EMAIL', 'table.eml');
    expect(table).toMatchObject({
      type: 'DINING',
      title: 'Taberna da Rua',
      travellers: 4,
      confirmationCode: 'TR-8812',
    });
  });
});

describe('plain text and PDFs', () => {
  it('finds codes, dates, prices and type hints', () => {
    expect(findConfirmationCode('Your booking reference: PNP77120 — enjoy')).toBe('PNP77120');
    expect(findConfirmationCode('Booking number: CONFIRMED')).toBeNull();
    expect(findDates('Sun 16 May 2027 and 2027-05-19 and 18/05/2027')).toEqual([
      '2027-05-16',
      '2027-05-19',
      '2027-05-18',
    ]);
    expect(findPrice('Subtotal €60.00 · Total: €80,00')).toEqual({
      price: '80.00',
      currency: 'EUR',
    });
    expect(findPrice('Amount paid 1.248,00 EUR')).toEqual({ price: '1248.00', currency: 'EUR' });
    expect(guessType('Timed entry ticket · Pena Palace · museum admission')).toBe('ATTRACTION');
  });

  it('reads a PDF ticket', async () => {
    const pdf = makePdf([
      'Parques de Sintra - Pena Palace',
      'Timed entry ticket for 4 adults',
      'Date: 16 May 2027  Entry: 09:30',
      'Booking reference: PNP77120',
      'Total: EUR 80.00',
    ]);
    const [d] = await parseFile(pdf, 'PDF', 'Pena Palace tickets.pdf');
    expect(d).toMatchObject({
      type: 'ATTRACTION',
      confirmationCode: 'PNP77120',
      startLocal: '2027-05-16T09:30',
      price: '80.00',
      currency: 'EUR',
      title: 'Parques de Sintra - Pena Palace',
    });
  });

  it('parses pasted text and ignores non-bookings', () => {
    const [d] = parseText(
      'Subject: Your booking confirmation for Fado night\n\nTickets x4. Date: 16 May 2027 at 20:00. Order #FD-20491. Total €120.00',
    );
    expect(d).toMatchObject({
      title: 'Fado night',
      confirmationCode: 'FD-20491',
      startLocal: '2027-05-16T20:00',
      price: '120.00',
    });
    expect(parseText('hello, see you tomorrow!')).toEqual([]);
  });

  it('returns nothing for images (no OCR)', async () => {
    expect(await parseFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'IMAGE', 'IMG_2041.jpg')).toEqual(
      [],
    );
  });
});

describe('titles for files without a subject', () => {
  it('uses the first line that names the booking', () => {
    expect(
      titleFromLines(
        'Lisboa Card - Booking confirmation\nBooking reference: LBC-55120\nOceanario de Lisboa - Timed entry\nDate: 17 May 2027 at 10:00',
      ),
    ).toBe('Oceanario de Lisboa');
    expect(titleFromLines('Booking reference: X1\n17/05/2027 10:00')).toBeNull();
    expect(
      titleFromLines(
        'Your reservation at Cervejaria Ramiro is confirmed.\nTable for 4 on 18 May 2027 at 21:00',
      ),
    ).toBe('Cervejaria Ramiro');
  });
});
