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

/**
 * A Hebrew hotel confirmation from a travel agency, forwarded twice (the forward headers carry
 * their own dates and times). Modelled on a real email; every detail is invented.
 */
export const forwardedHebrewHotelEmail = (): Buffer => {
  const maps = (q: string) =>
    `<https://www.google.com/maps/search/${encodeURIComponent(q)}?entry=gmail&source=g>`;
  const text = [
    'From: Noa Levi <noa.levi@gmail.com>',
    'Sent: Monday, 7 September 2026 14:43',
    'Subject: Fwd: הזמנתך אושרה - Hotel Aurora',
    '---------- Forwarded message ---------',
    'From: Sky Travel Bookings <noreply@sky-travel.test <mailto:noreply@sky-travel.test> >',
    'Date: Mon, 7 Sept 2026, 14:28',
    '‪Subject: הזמנתך אושרה - Hotel Aurora',
    'שלום Dan, תודה שביצעת הזמנה דרך Sky Travel. ההזמנה שלך אושרה.',
    'Hotel Aurora ★★★★',
    `Via Example 12, Rome ${maps('Via Example 12, Rome')}`,
    'מספר הזמנה:',
    '4821-7730',
    'צ׳ק-אין:',
    ` ${maps('נוב׳ 17, 2026')} נוב׳ 17, 2026`,
    'צ׳ק-אאוט:',
    ` ${maps('נוב׳ 19, 2026')} נוב׳ 19, 2026 (2-לילות)`,
    'שעת צ׳ק-אין:',
    'החל מהשעה 14:00 (זמן מקומי)',
    'שעת צ׳ק-אאוט:',
    'עד השעה 11:00 (זמן מקומי)',
    'מספר חדרים:',
    '1',
    'חדר:',
    'Superior Double Room',
    'סה״כ:',
    '1396 ILS',
    'תשלום במלון:',
    '€15',
    'נוסעים',
    'Dan Levi',
    'Noa Levi',
    'תנאי ביטול',
    'ביטול בחינם לפני 12 בנוב׳ 2026 23:59 (GMT).',
  ].join('\r\n');
  return Buffer.from(
    [
      'From: Noa Levi <noa.levi@yahoo.com>',
      'Subject: =?UTF-8?B?' +
        Buffer.from('FW: הזמנתך אושרה - Hotel Aurora').toString('base64') +
        '?=',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(text).toString('base64').replace(/.{76}/g, '$&\r\n'),
    ].join('\r\n'),
  );
};

/**
 * A Hebrew tour ticket from a booking platform, forwarded: the subject is only a date and a
 * code, the product line carries the ticket code, and the meeting point has a Maps link.
 * Modelled on a real email; every detail is invented.
 */
export const forwardedHebrewTourEmail = (): Buffer => {
  const text = [
    'From: Food Walks <vendor-1234@bokun.test>',
    'Sent: Sunday, 1 November 2026 10:49',
    "Subject: הזמנה: יום ד׳ 18.נוב׳ '26 @ 10:00 (FW-T5550001)",
    'www.foodwalks.test',
    'תודה על הזמנתך!',
    'Trastevere street food walk',
    '4 food walk',
    'מתי',
    'יום רביעי 18 נוב׳ 2026',
    '10:00 - 13:30',
    'משך 3.5 שעות',
    'נקודת מפגש  <https://www.google.com/maps/dir/?api=1&destination=41.88,12.47> ניווט ליעד',
    'Caffe Example',
    'Piazza Example 5, 00153 Roma, איטליה',
    'Trastevere street food walk (FW-T5550001)',
    'food walk (4)',
    '€15.00',
    'סה"כ',
    '\t€60.00',
    'ראו בזאת אישור להזמנתכם אשר מספרה: FW-7770001',
  ].join('\r\n');
  return Buffer.from(
    [
      'From: Dana <dana@yahoo.com>',
      'Subject: =?UTF-8?B?' +
        Buffer.from("FW: הזמנה: יום ד׳ 18.נוב׳ '26 @ 10:00 (FW-T5550001)").toString('base64') +
        '?=',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(text).toString('base64').replace(/.{76}/g, '$&\r\n'),
    ].join('\r\n'),
  );
};
