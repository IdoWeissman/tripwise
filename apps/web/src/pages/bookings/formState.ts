import type { BookingInput, BookingType } from '../../gql/graphql';
import { localDate, localTime, type BookingDraft, type SegmentDraft } from '../../lib/bookings';

/** Editable state: dates and times split for the pickers. */
export interface LegState {
  number: string;
  from: string;
  to: string;
  departDate: string;
  departTime: string;
  arriveDate: string;
  arriveTime: string;
  departTz: string | null;
  arriveTz: string | null;
  carrier: string | null;
}

export interface BookingFormState {
  type: BookingType;
  title: string;
  provider: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeZone: string | null;
  location: string;
  address: string;
  confirmationCode: string;
  bookingUrl: string;
  price: string;
  currency: string;
  travellers: string;
  notes: string;
  legs: LegState[];
  /** Fields that came from the uploaded file. */
  fromSource: string[];
}

const legFrom = (s: SegmentDraft): LegState => ({
  number: s.number ?? '',
  from: s.fromCode ?? s.fromName ?? '',
  to: s.toCode ?? s.toName ?? '',
  departDate: localDate(s.departLocal),
  departTime: localTime(s.departLocal) ?? '',
  arriveDate: localDate(s.arriveLocal),
  arriveTime: localTime(s.arriveLocal) ?? '',
  departTz: s.departTz ?? null,
  arriveTz: s.arriveTz ?? null,
  carrier: s.carrier ?? null,
});

export function formStateFrom(
  d: Partial<BookingDraft> & { type: BookingType; title: string },
  currency: string,
): BookingFormState {
  return {
    type: d.type,
    title: d.title ?? '',
    provider: d.provider ?? '',
    startDate: localDate(d.startLocal),
    startTime: localTime(d.startLocal) ?? '',
    endDate: localDate(d.endLocal),
    endTime: localTime(d.endLocal) ?? '',
    timeZone: d.timeZone ?? null,
    location: d.location ?? '',
    address: d.address ?? '',
    confirmationCode: d.confirmationCode ?? '',
    bookingUrl: d.bookingUrl ?? '',
    price: d.price ?? '',
    currency: d.currency ?? currency,
    travellers: d.travellers ? String(d.travellers) : '',
    notes: d.notes ?? '',
    legs: (d.segments ?? []).map(legFrom),
    fromSource: d.fromSource ?? [],
  };
}

const join = (date: string, time: string) => (date ? (time ? `${date}T${time}` : date) : null);
const airportish = (v: string) => /^[A-Za-z]{3}$/.test(v.trim());

export function toBookingInput(f: BookingFormState): BookingInput {
  const hasLegs = (f.type === 'FLIGHT' || f.type === 'TRANSPORT') && f.legs.length > 0;
  return {
    type: f.type,
    title: f.title,
    provider: f.provider || null,
    startLocal: hasLegs ? null : join(f.startDate, f.startTime),
    endLocal: hasLegs ? null : join(f.endDate, f.endTime),
    timeZone: f.timeZone,
    location: f.location || null,
    address: f.address || null,
    confirmationCode: f.confirmationCode || null,
    bookingUrl: f.bookingUrl || null,
    price: f.price ? f.price.replace(',', '.') : null,
    currency: f.price ? f.currency : null,
    travellers: f.travellers ? Number(f.travellers) : null,
    notes: f.notes || null,
    segments: hasLegs
      ? f.legs
          .filter((l) => l.departDate)
          .map((l) => ({
            carrier: l.carrier,
            number: l.number || null,
            fromCode: airportish(l.from) ? l.from.toUpperCase() : null,
            fromName: airportish(l.from) ? null : l.from || null,
            toCode: airportish(l.to) ? l.to.toUpperCase() : null,
            toName: airportish(l.to) ? null : l.to || null,
            departLocal: join(l.departDate, l.departTime)!,
            arriveLocal: join(l.arriveDate, l.arriveTime),
            departTz: l.departTz,
            arriveTz: l.arriveTz,
          }))
      : [],
  };
}

/** What still needs filling in (mirrors the API's missingFields). */
export function formProblems(f: BookingFormState): string[] {
  const p: string[] = [];
  if (!f.title.trim()) p.push('title');
  const legs = (f.type === 'FLIGHT' || f.type === 'TRANSPORT') && f.legs.length > 0;
  if (legs ? !f.legs[0]!.departDate : !f.startDate) p.push('start');
  return p;
}
