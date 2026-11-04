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
