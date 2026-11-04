/**
 * Reads schema.org reservation markup (JSON-LD) that airlines, hotels and ticket sites embed in
 * confirmation emails — the same data Gmail uses for its trip cards.
 * https://developers.google.com/workspace/gmail/markup/reference
 */
import { splitIso } from './iso.js';
import { withProvenance, type Draft, type SegmentDraft } from './types.js';

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null;
const name = (v: unknown): string | null => (isObj(v) ? str(v.name) : str(v));
const typeOf = (o: Json) => {
  const t = o['@type'];
  return (Array.isArray(t) ? t[0] : t) as string | undefined;
};

/** All JSON-LD objects in an HTML document, flattened (handles arrays and @graph). */
export function extractJsonLd(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const parsed: unknown = JSON.parse(m[1]!.replace(/&quot;/g, '"').trim());
      const visit = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(visit);
        else if (isObj(v)) {
          if (Array.isArray(v['@graph'])) (v['@graph'] as unknown[]).forEach(visit);
          else out.push(v);
          if (Array.isArray(v.subReservation)) (v.subReservation as unknown[]).forEach(visit);
        }
      };
      visit(parsed);
    } catch {
      /* ignore malformed blocks */
    }
  }
  return out;
}

function formatAddress(a: unknown): string | null {
  if (!isObj(a)) return str(a);
  return (
    [a.streetAddress, a.addressLocality, a.postalCode, a.addressCountry]
      .map((x) => name(x))
      .filter(Boolean)
      .join(', ') || null
  );
}

function bookingUrl(r: Json): string | null {
  const direct = str(r.modifyReservationUrl) ?? str(r.url);
  if (direct) return direct;
  const actions = Array.isArray(r.potentialAction) ? r.potentialAction : [r.potentialAction];
  for (const a of actions) {
    if (!isObj(a)) continue;
    const target = isObj(a.target) ? str(a.target.urlTemplate) : str(a.target);
    if (target ?? str(a.url)) return target ?? str(a.url);
  }
  return null;
}

function money(r: Json): { price: string | null; currency: string | null } {
  const raw = r.totalPrice ?? r.price;
  const total = isObj(raw) ? (raw.price ?? raw.value) : raw;
  const n =
    typeof total === 'number'
      ? total
      : typeof total === 'string'
        ? Number(total.replace(/[^\d.]/g, ''))
        : NaN;
  const currency = str(r.priceCurrency) ?? (isObj(raw) ? str(raw.priceCurrency) : null);
  return {
    price: Number.isFinite(n) && n > 0 ? n.toFixed(2) : null,
    currency: currency?.toUpperCase() ?? null,
  };
}

const common = (r: Json) => ({
  confirmationCode: str(r.reservationNumber) ?? str(r.confirmationNumber),
  bookingUrl: bookingUrl(r),
  provider: name(r.provider) ?? name(r.broker),
  ...money(r),
});

function flightSegment(f: Json): SegmentDraft | null {
  const dep = splitIso(f.departureTime);
  if (!dep) return null;
  const arr = splitIso(f.arrivalTime);
  const airline = isObj(f.airline) ? f.airline : {};
  const carrier = str(airline.iataCode);
  const number = str(f.flightNumber);
  return {
    carrier: name(airline) ?? carrier,
    number: number
      ? carrier && !number.startsWith(carrier)
        ? `${carrier} ${number}`
        : number
      : null,
    fromCode: isObj(f.departureAirport) ? str(f.departureAirport.iataCode) : null,
    fromName: isObj(f.departureAirport) ? str(f.departureAirport.name) : null,
    toCode: isObj(f.arrivalAirport) ? str(f.arrivalAirport.iataCode) : null,
    toName: isObj(f.arrivalAirport) ? str(f.arrivalAirport.name) : null,
    departLocal: dep.local,
    arriveLocal: arr?.local ?? null,
    departTz: dep.tz,
    arriveTz: arr?.tz ?? null,
  };
}

function flights(reservations: Json[]): Draft[] {
  // One booking per confirmation code; one segment per distinct flight (several passengers share them).
  const groups = new Map<string, Json[]>();
  for (const r of reservations) {
    const key = str(r.reservationNumber) ?? `__${groups.size}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((rs) => {
    const segs = new Map<string, SegmentDraft>();
    const passengers = new Set<string>();
    for (const r of rs) {
      const seg = isObj(r.reservationFor) ? flightSegment(r.reservationFor) : null;
      if (seg) segs.set(`${seg.number}|${seg.departLocal}`, seg);
      const who = name(r.underName);
      if (who) passengers.add(who);
    }
    const segments = [...segs.values()].sort((a, b) => a.departLocal.localeCompare(b.departLocal));
    const first = segments[0];
    const last = segments.at(-1);
    const city = (s: SegmentDraft | undefined, end: 'from' | 'to') =>
      (end === 'from' ? (s?.fromName ?? s?.fromCode) : (s?.toName ?? s?.toCode)) ?? '?';
    const roundTrip = segments.length > 1 && first?.fromCode && first.fromCode === last?.toCode;
    const title = !first
      ? 'Flight'
      : roundTrip
        ? `${city(first, 'from')} ⇄ ${city(first, 'to')}`
        : `${city(first, 'from')} → ${city(last, 'to')}`;
    const base = common(rs[0]!);
    return withProvenance({
      type: 'FLIGHT',
      title,
      ...base,
      provider: base.provider ?? first?.carrier ?? null,
      startLocal: first?.departLocal ?? null,
      endLocal: last?.arriveLocal ?? null,
      timeZone: first?.departTz ?? null,
      travellers: passengers.size || null,
      segments,
    });
  });
}

function single(r: Json, kind: string): Draft | null {
  const f = isObj(r.reservationFor) ? r.reservationFor : {};
  const base = common(r);
  const at = (v: unknown) => splitIso(v);
  switch (kind) {
    case 'LodgingReservation': {
      const start = at(r.checkinTime ?? r.checkinDate);
      const end = at(r.checkoutTime ?? r.checkoutDate);
      return withProvenance({
        type: 'STAY',
        title: name(f) ?? 'Stay',
        ...base,
        startLocal: start?.local ?? null,
        endLocal: end?.local ?? null,
        timeZone: start?.tz ?? end?.tz ?? null,
        address: formatAddress(f.address),
        location: name(f),
        travellers: typeof r.numAdults === 'number' ? r.numAdults : null,
        segments: [],
      });
    }
    case 'EventReservation': {
      const start = at(f.startDate);
      const end = at(f.endDate);
      const loc = isObj(f.location) ? f.location : {};
      const tickets = Array.isArray(r.reservedTicket)
        ? r.reservedTicket.length
        : typeof r.numSeats === 'number'
          ? r.numSeats
          : null;
      const isAttraction = /museum|palace|park|tour|admission|entry|castle|garden/i.test(
        name(f) ?? '',
      );
      return withProvenance({
        type: isAttraction ? 'ATTRACTION' : 'EVENT',
        title: name(f) ?? 'Event',
        ...base,
        startLocal: start?.local ?? null,
        endLocal: end?.local ?? null,
        timeZone: start?.tz ?? null,
        location: name(loc),
        address: formatAddress(loc.address),
        travellers: tickets,
        segments: [],
      });
    }
    case 'FoodEstablishmentReservation': {
      const start = at(r.startTime);
      return withProvenance({
        type: 'DINING',
        title: name(f) ?? 'Restaurant',
        ...base,
        startLocal: start?.local ?? null,
        endLocal: at(r.endTime)?.local ?? null,
        timeZone: start?.tz ?? null,
        location: name(f),
        address: formatAddress(f.address),
        travellers: typeof r.partySize === 'number' ? r.partySize : null,
        segments: [],
      });
    }
    case 'TrainReservation':
    case 'BusReservation': {
      const dep = at(f.departureTime);
      const arr = at(f.arrivalTime);
      const from = name(f.departureStation ?? f.departureBusStop);
      const to = name(f.arrivalStation ?? f.arrivalBusStop);
      const seg: SegmentDraft[] = dep
        ? [
            {
              carrier: name(f.trainCompany ?? f.busCompany ?? f.provider),
              number: str(f.trainNumber ?? f.busNumber),
              fromName: from,
              toName: to,
              departLocal: dep.local,
              arriveLocal: arr?.local ?? null,
              departTz: dep.tz,
              arriveTz: arr?.tz ?? null,
            },
          ]
        : [];
      return withProvenance({
        type: 'TRANSPORT',
        title: from && to ? `${from} → ${to}` : kind === 'BusReservation' ? 'Bus' : 'Train',
        ...base,
        provider: base.provider ?? seg[0]?.carrier ?? null,
        startLocal: dep?.local ?? null,
        endLocal: arr?.local ?? null,
        timeZone: dep?.tz ?? null,
        segments: seg,
      });
    }
    case 'RentalCarReservation': {
      const start = at(r.pickupTime);
      const end = at(r.dropoffTime);
      return withProvenance({
        type: 'TRANSPORT',
        title: `Car rental${name(f.rentalCompany ?? r.provider) ? ` · ${name(f.rentalCompany ?? r.provider)}` : ''}`,
        ...base,
        startLocal: start?.local ?? null,
        endLocal: end?.local ?? null,
        timeZone: start?.tz ?? null,
        location: name(r.pickupLocation),
        address: isObj(r.pickupLocation) ? formatAddress(r.pickupLocation.address) : null,
        segments: [],
      });
    }
    default:
      return null;
  }
}

/** Bookings described by schema.org markup in an HTML email. */
export function draftsFromJsonLd(html: string): Draft[] {
  const objects = extractJsonLd(html);
  const flightRes = objects.filter((o) => typeOf(o) === 'FlightReservation');
  const others = objects
    .filter((o) => typeOf(o) !== 'FlightReservation' && typeOf(o)?.endsWith('Reservation'))
    .map((o) => single(o, typeOf(o)!))
    .filter((d): d is Draft => d !== null);
  return [...flights(flightRes), ...others];
}
