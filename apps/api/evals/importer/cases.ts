/**
 * Booking-importer evaluation set. Every input is INVENTED (no real people, codes or links) and
 * every `expect` is the correct answer a person would want — not whatever the importer returns
 * today. `seen` cases are formats the importer was built against; `unseen` ones are new formats
 * that show how well it generalises.
 *
 * Field conventions (see score.ts):
 *  - start / end: wall-clock local time "YYYY-MM-DDTHH:mm" — first leg's departure / last leg's
 *    arrival for flights and trains, otherwise startLocal / endLocal.
 *  - legs: flight/train numbers in order ("TP 1394").
 *  - a string[] means "any of these is right" (titles can be phrased several ways).
 */
import { makePdf } from '../../test/fixtures/makePdf.js';
import {
  flightEmail,
  forwardedAirlineEmail,
  forwardedHebrewHotelEmail,
  forwardedHebrewTourEmail,
  hotelEmail,
  restaurantEmail,
} from '../../test/fixtures/emails.js';

export interface Expected {
  type?: string;
  title?: string | string[];
  provider?: string | string[];
  code?: string;
  start?: string;
  end?: string;
  legs?: string[];
  travellers?: number;
  price?: string;
  currency?: string;
  location?: string | string[];
  address?: string;
  bookingUrl?: string;
}

export interface EvalCase {
  id: string;
  group: 'seen' | 'unseen';
  about: string;
  input:
    | { kind: 'EMAIL' | 'PDF'; fileName: string; file: () => Buffer }
    | { kind: 'TEXT'; text: string };
  /** One entry per booking the file contains; [] means "not a booking". */
  expect: Expected[];
}

/** A plain-text email (no structured data), optionally forwarded. */
function textEmail(opts: { from: string; subject: string; lines: string[] }): Buffer {
  return Buffer.from(
    [
      `From: ${opts.from}`,
      `Subject: ${opts.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      ...opts.lines,
    ].join('\r\n'),
  );
}

export const CASES: EvalCase[] = [
  // ---------------------------------------------------------------- seen formats
  {
    id: 'flight-jsonld',
    group: 'seen',
    about: 'Airline email with schema.org JSON-LD, round trip, 2 passengers',
    input: { kind: 'EMAIL', fileName: 'tap.eml', file: flightEmail },
    expect: [
      {
        type: 'FLIGHT',
        title: 'Tel Aviv ⇄ Lisbon',
        provider: 'TAP Air Portugal',
        code: 'K7Q2ZP',
        start: '2027-05-14T06:10',
        end: '2027-05-20T00:25',
        legs: ['TP 1394', 'TP 1395'],
        travellers: 2,
        price: '1248.00',
        currency: 'EUR',
        bookingUrl: 'https://www.flytap.com/manage?pnr=K7Q2ZP',
      },
    ],
  },
  {
    id: 'hotel-jsonld',
    group: 'seen',
    about: 'Hotel email with schema.org JSON-LD',
    input: { kind: 'EMAIL', fileName: 'stay.eml', file: hotelEmail },
    expect: [
      {
        type: 'STAY',
        title: 'Casa do Largo, Alfama',
        code: 'HMX4-22A9',
        start: '2027-05-14T14:00',
        end: '2027-05-19T11:00',
        travellers: 4,
        price: '636.80',
        currency: 'EUR',
        address: 'Rua dos Remédios 42, Lisbon, PT',
      },
    ],
  },
  {
    id: 'restaurant-jsonld',
    group: 'seen',
    about: 'Restaurant email with schema.org JSON-LD',
    input: { kind: 'EMAIL', fileName: 'table.eml', file: restaurantEmail },
    expect: [
      {
        type: 'DINING',
        title: 'Taberna da Rua',
        code: 'TR-8812',
        start: '2027-05-14T19:30',
        travellers: 4,
        address: 'Rua da Rosa 18, Lisbon',
      },
    ],
  },
  {
    id: 'flight-forwarded-calendar',
    group: 'seen',
    about: 'Forwarded airline email, plain text + one .ics per leg, fare before the total',
    input: { kind: 'EMAIL', fileName: 'FW booking.eml', file: forwardedAirlineEmail },
    expect: [
      {
        type: 'FLIGHT',
        title: 'Tel Aviv ⇄ Rome',
        provider: 'Example Air',
        code: 'QX7MLB',
        start: '2026-11-17T08:30',
        end: '2026-11-20T03:10',
        legs: ['AZ 815', 'AZ 810'],
        travellers: 1,
        price: '324.97',
        currency: 'USD',
        bookingUrl: 'https://www.example-air.test/myflights/mmb?ref=QX7MLB',
      },
    ],
  },
  {
    id: 'hotel-hebrew-forwarded',
    group: 'seen',
    about: 'Hebrew hotel confirmation from an agency, forwarded twice',
    input: { kind: 'EMAIL', fileName: 'FW hotel.eml', file: forwardedHebrewHotelEmail },
    expect: [
      {
        type: 'STAY',
        title: 'Hotel Aurora',
        provider: 'Superior Double Room · 2 nights',
        code: '4821-7730',
        start: '2026-11-17T14:00',
        end: '2026-11-19T11:00',
        address: 'Via Example 12, Rome',
        travellers: 2,
        price: '1396.00',
        currency: 'ILS',
      },
    ],
  },
  {
    id: 'tour-hebrew-forwarded',
    group: 'seen',
    about: 'Hebrew tour ticket; subject is only a date and a code; meeting point with a Maps link',
    input: { kind: 'EMAIL', fileName: 'ticket.eml', file: forwardedHebrewTourEmail },
    expect: [
      {
        type: 'TOUR',
        title: 'Trastevere street food walk',
        provider: 'Food Walks',
        code: 'FW-7770001',
        start: '2026-11-18T10:00',
        end: '2026-11-18T13:30',
        location: 'Caffe Example',
        address: 'Piazza Example 5, 00153 Roma, איטליה',
        travellers: 4,
        price: '60.00',
        currency: 'EUR',
      },
    ],
  },
  {
    id: 'attraction-pdf',
    group: 'seen',
    about: 'Timed-entry PDF ticket',
    input: {
      kind: 'PDF',
      fileName: 'Pena Palace tickets.pdf',
      file: () =>
        makePdf([
          'Parques de Sintra - Pena Palace',
          'Timed entry ticket for 4 adults',
          'Date: 16 May 2027  Entry: 09:30',
          'Booking reference: PNP77120',
          'Total: EUR 80.00',
        ]),
    },
    expect: [
      {
        type: 'ATTRACTION',
        title: ['Parques de Sintra - Pena Palace', 'Pena Palace'],
        code: 'PNP77120',
        start: '2027-05-16T09:30',
        travellers: 4,
        price: '80.00',
        currency: 'EUR',
      },
    ],
  },
  {
    id: 'event-pasted',
    group: 'seen',
    about: 'Pasted email text with a subject line',
    input: {
      kind: 'TEXT',
      text: 'Subject: Your booking confirmation for Fado night\n\nTickets x4. Date: 16 May 2027 at 20:00. Order #FD-20491. Total €120.00',
    },
    expect: [
      {
        type: 'EVENT',
        title: 'Fado night',
        code: 'FD-20491',
        start: '2027-05-16T20:00',
        travellers: 4,
        price: '120.00',
        currency: 'EUR',
      },
    ],
  },
  {
    id: 'tour-discounted-total',
    group: 'seen',
    about:
      'The amount paid is lower than other amounts in the email (original price, insurance cover)',
    input: {
      kind: 'EMAIL',
      fileName: 'tour.eml',
      file: () =>
        textEmail({
          from: 'Tours Example <hello@tours-example.test>',
          subject: 'Booking confirmed: Colosseum underground tour',
          lines: [
            'Booking reference: TE-90412',
            'Colosseum underground tour',
            'Date: 19 Nov 2026 at 14:00',
            '2 adults',
            'Original price: €150.00',
            'Early-bird discount: -€30.00',
            'Total paid: €120.00',
            'Cancellation insurance covers up to €500.00',
          ],
        }),
    },
    expect: [
      {
        type: 'TOUR',
        title: 'Colosseum underground tour',
        code: 'TE-90412',
        start: '2026-11-19T14:00',
        travellers: 2,
        price: '120.00',
        currency: 'EUR',
      },
    ],
  },
  {
    id: 'not-a-booking',
    group: 'seen',
    about: 'A message that is not a booking must yield nothing',
    input: { kind: 'TEXT', text: 'Hi! See you tomorrow at the beach, bring sunscreen :)' },
    expect: [],
  },

  // ---------------------------------------------------------------- unseen formats
  {
    id: 'train-pdf',
    group: 'unseen',
    about: 'Train e-ticket PDF: station names, coach/seats, two passengers',
    input: {
      kind: 'PDF',
      fileName: 'e-ticket.pdf',
      file: () =>
        makePdf([
          'Rail Example - E-ticket',
          'Booking code: RX7Q9T',
          'Roma Termini - Firenze S. M. Novella',
          'Departure 18/11/2026 09:15   Arrival 18/11/2026 10:51',
          'Train FR 9521   Coach 6   Seats 7A, 7B',
          'Passengers: 2',
          'Total amount: EUR 79.80',
        ]),
    },
    expect: [
      {
        type: 'TRANSPORT',
        title: [
          'Roma Termini → Firenze S. M. Novella',
          'Rome → Florence',
          'Roma Termini - Firenze S. M. Novella',
        ],
        code: 'RX7Q9T',
        start: '2026-11-18T09:15',
        end: '2026-11-18T10:51',
        travellers: 2,
        price: '79.80',
        currency: 'EUR',
      },
    ],
  },
  {
    id: 'concert-email',
    group: 'unseen',
    about: 'Concert tickets: doors vs show time, venue + address, ticket link',
    input: {
      kind: 'EMAIL',
      fileName: 'tickets.eml',
      file: () =>
        textEmail({
          from: 'Ticket Example <tickets@ticket-example.test>',
          subject: 'Your tickets for The Lantern Quartet',
          lines: [
            'Thanks for your order!',
            'Order number: TX-552190',
            '',
            'The Lantern Quartet - Live in Rome',
            'Auditorium Example',
            'Via Example 30, 00196 Roma',
            'Saturday 21 November 2026',
            'Doors 19:30 · Show 20:30',
            '2 tickets · Section B, Row 4, Seats 11-12',
            '',
            'Total paid: €96.00',
            'View your tickets: https://ticket-example.test/orders/TX-552190',
          ],
        }),
    },
    expect: [
      {
        type: 'EVENT',
        title: ['The Lantern Quartet - Live in Rome', 'The Lantern Quartet'],
        provider: 'Ticket Example',
        code: 'TX-552190',
        start: '2026-11-21T20:30',
        travellers: 2,
        price: '96.00',
        currency: 'EUR',
        location: 'Auditorium Example',
        address: 'Via Example 30, 00196 Roma',
        bookingUrl: 'https://ticket-example.test/orders/TX-552190',
      },
    ],
  },
  {
    id: 'car-rental-email',
    group: 'unseen',
    about: 'Car rental: pick-up and drop-off times and places',
    input: {
      kind: 'EMAIL',
      fileName: 'car.eml',
      file: () =>
        textEmail({
          from: 'Drive Example <reservations@drive-example.test>',
          subject: 'Your car rental is confirmed',
          lines: [
            'Confirmation number: CR-7741-ZZ',
            'Car: Fiat 500 or similar',
            'Pick-up: Rome Fiumicino Airport (FCO), Tue 17 Nov 2026 12:00',
            'Drop-off: Rome Fiumicino Airport (FCO), Thu 19 Nov 2026 18:00',
            'Total: €84.50',
          ],
        }),
    },
    expect: [
      {
        type: 'TRANSPORT',
        title: ['Car rental', 'Car rental · Fiat 500 or similar', 'Fiat 500 or similar'],
        provider: 'Drive Example',
        code: 'CR-7741-ZZ',
        start: '2026-11-17T12:00',
        end: '2026-11-19T18:00',
        price: '84.50',
        currency: 'EUR',
      },
    ],
  },
  {
    id: 'hotel-english-text',
    group: 'unseen',
    about: 'English hotel confirmation in plain text, times in brackets, numeric booking number',
    input: {
      kind: 'EMAIL',
      fileName: 'hotel.eml',
      file: () =>
        textEmail({
          from: 'Stays Example <noreply@stays-example.test>',
          subject: 'Your booking is confirmed at Casa Example Rooms',
          lines: [
            'Booking number: 4021889115',
            'Casa Example Rooms',
            'Via Example 8, 50123 Florence, Italy',
            'Check-in: Wed 18 Nov 2026 (from 15:00)',
            'Check-out: Fri 20 Nov 2026 (until 10:00)',
            '2 nights, 1 room, 2 adults',
            'Room: Double Room with Balcony',
            'Total price: € 312',
          ],
        }),
    },
    expect: [
      {
        type: 'STAY',
        title: 'Casa Example Rooms',
        provider: 'Double Room with Balcony · 2 nights',
        code: '4021889115',
        start: '2026-11-18T15:00',
        end: '2026-11-20T10:00',
        address: 'Via Example 8, 50123 Florence, Italy',
        travellers: 2,
        price: '312.00',
        currency: 'EUR',
      },
    ],
  },
  {
    id: 'flight-connection-text',
    group: 'unseen',
    about: 'One-way flight with a connection, written out in text (no calendar, no JSON-LD)',
    input: {
      kind: 'EMAIL',
      fileName: 'flight.eml',
      file: () =>
        textEmail({
          from: 'Fly Example <bookings@fly-example.test>',
          subject: 'Booking confirmation XK4P2M',
          lines: [
            'Booking reference: XK4P2M',
            'Flight 1: LY 381  TLV → ATH  17 Nov 2026 07:00 – 09:10',
            'Flight 2: A3 600  ATH → FCO  17 Nov 2026 10:45 – 11:55',
            'Passenger: Mr Dan Example',
            'Total: USD 412.30',
          ],
        }),
    },
    expect: [
      {
        type: 'FLIGHT',
        title: ['TLV → FCO', 'Tel Aviv → Rome'],
        code: 'XK4P2M',
        start: '2026-11-17T07:00',
        end: '2026-11-17T11:55',
        legs: ['LY 381', 'A3 600'],
        travellers: 1,
        price: '412.30',
        currency: 'USD',
      },
    ],
  },
  {
    id: 'restaurant-pasted-english',
    group: 'unseen',
    about: 'Pasted restaurant confirmation without a subject',
    input: {
      kind: 'TEXT',
      text: 'Your reservation at Trattoria Example is confirmed.\nTable for 3 on 20 Nov 2026 at 20:30\nReservation number: TE-3301\nVia Example 2, Florence',
    },
    expect: [
      {
        type: 'DINING',
        title: 'Trattoria Example',
        code: 'TE-3301',
        start: '2026-11-20T20:30',
        travellers: 3,
      },
    ],
  },
];
