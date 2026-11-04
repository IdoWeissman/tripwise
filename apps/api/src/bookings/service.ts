import type { BookingSegment, Prisma } from '../generated/prisma/client.js';
import type { BookingModel } from '../graphql/models.js';
import { isValidZone, localToInstant } from '../lib/time.js';

export class BookingInputError extends Error {}

export interface SegmentInputLike {
  carrier?: string | null;
  number?: string | null;
  fromCode?: string | null;
  fromName?: string | null;
  toCode?: string | null;
  toName?: string | null;
  departLocal: string;
  arriveLocal?: string | null;
  departTz?: string | null;
  arriveTz?: string | null;
}

export interface BookingInputLike {
  type: BookingModel['type'];
  title: string;
  provider?: string | null;
  confirmationCode?: string | null;
  bookingUrl?: string | null;
  startLocal?: string | null;
  endLocal?: string | null;
  timeZone?: string | null;
  location?: string | null;
  address?: string | null;
  price?: string | null;
  currency?: string | null;
  travellers?: number | null;
  notes?: string | null;
  segments?: SegmentInputLike[] | null;
  status?: BookingModel['status'] | null;
}

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;

function zone(tz: string | null | undefined, fallback: string) {
  const z = clean(tz) ?? fallback;
  if (!isValidZone(z)) throw new BookingInputError(`Unknown time zone "${z}".`);
  return z;
}

function instant(local: string | null | undefined, tz: string, label: string) {
  if (!clean(local)) return null;
  try {
    return localToInstant(local!, tz);
  } catch {
    throw new BookingInputError(`${label} must be a date like 2027-05-14 or 2027-05-14T09:30.`);
  }
}

function safeUrl(url: string | null | undefined) {
  const u = clean(url);
  if (!u) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
    return parsed.toString();
  } catch {
    throw new BookingInputError('Booking link must be a web address (https://…).');
  }
}

/** Validates input and converts wall-clock times to instants. */
export function toBookingData(input: BookingInputLike, tripZone: string) {
  const title = clean(input.title);
  if (!title) throw new BookingInputError('Title is required.');
  const tz = zone(input.timeZone, tripZone);
  const price = clean(input.price);
  if (price && !MONEY_RE.test(price))
    throw new BookingInputError('Price must be a number with up to 2 decimals.');
  const currency = clean(input.currency)?.toUpperCase() ?? null;
  if (currency && !/^[A-Z]{3}$/.test(currency))
    throw new BookingInputError('Currency must be a 3-letter code like EUR.');
  if (input.travellers != null && (input.travellers < 1 || input.travellers > 99)) {
    throw new BookingInputError('Travellers must be between 1 and 99.');
  }

  const segments = (input.segments ?? []).map((s, position) => {
    const departTz = zone(s.departTz, tz);
    const arriveTz = zone(s.arriveTz, departTz);
    const departsAt = instant(s.departLocal, departTz, 'Departure');
    if (!departsAt) throw new BookingInputError('Each leg needs a departure time.');
    const arrivesAt = instant(s.arriveLocal, arriveTz, 'Arrival');
    if (arrivesAt && arrivesAt < departsAt)
      throw new BookingInputError('A leg can’t arrive before it departs.');
    return {
      position,
      carrier: clean(s.carrier),
      number: clean(s.number),
      fromCode: clean(s.fromCode)?.toUpperCase() ?? null,
      fromName: clean(s.fromName),
      toCode: clean(s.toCode)?.toUpperCase() ?? null,
      toName: clean(s.toName),
      departsAt,
      arrivesAt,
      departTz,
      arriveTz,
    };
  });

  // Legs define the booking's span when present.
  const startsAt = segments[0]?.departsAt ?? instant(input.startLocal, tz, 'Start');
  const lastLeg = segments.at(-1);
  const endsAt = lastLeg
    ? (lastLeg.arrivesAt ?? lastLeg.departsAt)
    : instant(input.endLocal, tz, 'End');
  if (startsAt && endsAt && endsAt < startsAt)
    throw new BookingInputError('End must be after the start.');

  const status =
    input.status === 'CANCELLED' ? 'CANCELLED' : startsAt ? 'CONFIRMED' : 'NEEDS_DETAILS';

  const data = {
    type: input.type,
    title,
    status,
    provider: clean(input.provider),
    confirmationCode: clean(input.confirmationCode),
    bookingUrl: safeUrl(input.bookingUrl),
    startsAt,
    endsAt,
    timeZone: segments[0]?.departTz ?? tz,
    location: clean(input.location),
    address: clean(input.address),
    price,
    currency: price ? (currency ?? null) : currency,
    travellers: input.travellers ?? null,
    notes: clean(input.notes),
  } satisfies Partial<Prisma.BookingUncheckedCreateInput>;

  return { data, segments };
}

export function missingFields(b: BookingModel): string[] {
  const missing: string[] = [];
  if (!b.startsAt)
    missing.push(b.type === 'FLIGHT' || b.type === 'TRANSPORT' ? 'departure time' : 'start time');
  if (b.type === 'STAY' && !b.endsAt) missing.push('check-out');
  return missing;
}

/** Things that have their own start time: flight/train legs, or the booking itself. */
export function timedParts(b: BookingModel): { at: Date; segment: BookingSegment | null }[] {
  if (b.status === 'CANCELLED') return [];
  if (b.segments?.length) return b.segments.map((s) => ({ at: s.departsAt, segment: s }));
  return b.startsAt ? [{ at: b.startsAt, segment: null }] : [];
}
