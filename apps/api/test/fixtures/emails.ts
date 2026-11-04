const flightLeg = (
  who: string,
  num: string,
  from: string,
  to: string,
  dep: string,
  arr: string,
) => ({
  '@context': 'http://schema.org',
  '@type': 'FlightReservation',
  reservationNumber: 'K7Q2ZP',
  reservationStatus: 'http://schema.org/Confirmed',
  underName: { '@type': 'Person', name: who },
  modifyReservationUrl: 'https://www.flytap.com/manage?pnr=K7Q2ZP',
  totalPrice: '1248.00',
  priceCurrency: 'EUR',
  reservationFor: {
    '@type': 'Flight',
    flightNumber: num,
    airline: { '@type': 'Airline', name: 'TAP Air Portugal', iataCode: 'TP' },
    departureAirport: {
      '@type': 'Airport',
      name: 'Tel Aviv',
      iataCode: from === 'TLV' ? 'TLV' : 'LIS',
    },
    arrivalAirport: { '@type': 'Airport', name: 'Lisbon', iataCode: to },
    departureTime: dep,
    arrivalTime: arr,
  },
});

export const flightEmail = (): Buffer => {
  const ld = [
    flightLeg(
      'Ido W',
      '1394',
      'TLV',
      'LIS',
      '2027-05-14T06:10:00+03:00',
      '2027-05-14T10:05:00+01:00',
    ),
    flightLeg(
      'Maya K',
      '1394',
      'TLV',
      'LIS',
      '2027-05-14T06:10:00+03:00',
      '2027-05-14T10:05:00+01:00',
    ),
    flightLeg(
      'Ido W',
      '1395',
      'LIS',
      'TLV',
      '2027-05-19T17:40:00+01:00',
      '2027-05-20T00:25:00+03:00',
    ),
    flightLeg(
      'Maya K',
      '1395',
      'LIS',
      'TLV',
      '2027-05-19T17:40:00+01:00',
      '2027-05-20T00:25:00+03:00',
    ),
  ];
  ld[2]!.reservationFor.departureAirport = { '@type': 'Airport', name: 'Lisbon', iataCode: 'LIS' };
  ld[2]!.reservationFor.arrivalAirport = { '@type': 'Airport', name: 'Tel Aviv', iataCode: 'TLV' };
  ld[3]!.reservationFor.departureAirport = { '@type': 'Airport', name: 'Lisbon', iataCode: 'LIS' };
  ld[3]!.reservationFor.arrivalAirport = { '@type': 'Airport', name: 'Tel Aviv', iataCode: 'TLV' };
  return Buffer.from(
    [
      'From: TAP Air Portugal <noreply@flytap.com>',
      'To: ido@example.com',
      'Subject: Your booking confirmation K7Q2ZP',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head>`,
      '<body><p>Thanks for flying with us. Booking reference K7Q2ZP.</p></body></html>',
    ].join('\r\n'),
  );
};

export const hotelEmail = (): Buffer =>
  Buffer.from(
    [
      'From: Stays <bookings@example-stays.com>',
      'Subject: Your stay at Casa do Largo is confirmed',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      `<script type="application/ld+json">${JSON.stringify({
        '@context': 'http://schema.org',
        '@type': 'LodgingReservation',
        reservationNumber: 'HMX4-22A9',
        url: 'https://example-stays.com/trips/HMX4-22A9',
        checkinTime: '2027-05-14T14:00:00+01:00',
        checkoutTime: '2027-05-19T11:00:00+01:00',
        price: '636.80',
        priceCurrency: 'EUR',
        numAdults: 4,
        reservationFor: {
          '@type': 'LodgingBusiness',
          name: 'Casa do Largo, Alfama',
          address: {
            '@type': 'PostalAddress',
            streetAddress: 'Rua dos Remédios 42',
            addressLocality: 'Lisbon',
            addressCountry: 'PT',
          },
        },
      })}</script><p>See you soon!</p>`,
    ].join('\r\n'),
  );

export const restaurantEmail = (): Buffer =>
  Buffer.from(
    [
      'From: Taberna <hello@taberna.example>',
      'Subject: Table confirmed',
      'Content-Type: text/html; charset=utf-8',
      '',
      `<script type="application/ld+json">${JSON.stringify({
        '@context': 'http://schema.org',
        '@type': 'FoodEstablishmentReservation',
        reservationNumber: 'TR-8812',
        startTime: '2027-05-14T19:30:00+01:00',
        partySize: 4,
        reservationFor: {
          '@type': 'FoodEstablishment',
          name: 'Taberna da Rua',
          address: 'Rua da Rosa 18, Lisbon',
        },
      })}</script>`,
    ].join('\r\n'),
  );

const vcs = (
  n: number,
  from: string,
  to: string,
  num: string,
  startZ: string,
  endZ: string,
  dep: [string, string],
  arr: [string, string],
) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${n}-1000@example-air.test`,
    `DTSTART:${startZ}`,
    `DTEND:${endZ}`,
    `SUMMARY:Your flight from ${from} to ${to}`,
    `DESCRIPTION:Booking reference: QX7MLB  \\n \\n Operated by: Example Air  \\n Flight number: ${num} \\n Total travel time: 3h 50m \\n\\n Departure - Date: ${dep[0]} \\n Time: ${dep[1]} \\n From: Ben Gurion Intl Arpt (${from}) \\n\\n Arrival \\n Date: ${arr[0]} \\n Time: ${arr[1]} \\n At: Fiumicino (${to})`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

/**
 * A forwarded airline confirmation without structured data: plain text + one .vcs per leg,
 * a per-person fare before the real total, and a legal footer with a huge amount.
 * Modelled on a real ITA Airways email (all details invented).
 */
export const forwardedAirlineEmail = (): Buffer => {
  const text = [
    '-----Original Message-----',
    'From: Example Air Booking <booking@example-air.test>',
    'Subject: Thank you for booking with us | From Tel Aviv to Rome on 17 November 2026',
    '',
    'Dear Ms Cohen,',
    'Departure IATA Code TLV',
    'Arrival IATA Code FCO',
    'Departure City Tel Aviv',
    'Arrival City Rome',
    'Final price',
    'USD  324.97',
    '(incl. taxes, fees and surcharges)',
    'Manage your booking: https://www.example-air.test/myflights/mmb?ref=QX7MLB',
    'Passenger',
    'Ms Dana Cohen',
    'Price details',
    'Fare',
    'USD 130.00',
    'Ticket number: 1234567890123',
    'Example Air S.p.A. Share Capital EUR 792.682.926,83 fully paid-up',
  ].join('\r\n');
  const b = 'BOUNDARY42';
  return Buffer.from(
    [
      'From: Dana <dana@example.test>',
      'Subject: FW: Thank you for booking with us | From Tel Aviv to Rome on 17 November 2026',
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${b}"`,
      '',
      `--${b}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      text,
      `--${b}`,
      'Content-Type: text/X-vCalendar; name="1_TLV-FCO.ics"',
      'Content-Disposition: attachment; filename="1_TLV-FCO.ics"',
      '',
      vcs(
        1,
        'TLV',
        'FCO',
        'AZ 815',
        '20261117T063000Z',
        '20261117T102000Z',
        ['17 Nov 2026', '08:30'],
        ['17 Nov 2026', '11:20'],
      ),
      `--${b}`,
      'Content-Type: text/X-vCalendar; name="2_FCO-TLV.ics"',
      'Content-Disposition: attachment; filename="2_FCO-TLV.ics"',
      '',
      vcs(
        2,
        'FCO',
        'TLV',
        'AZ 810',
        '20261119T215000Z',
        '20261120T011000Z',
        ['19 Nov 2026', '22:50'],
        ['20 Nov 2026', '03:10'],
      ),
      `--${b}--`,
      '',
    ].join('\r\n'),
  );
};
