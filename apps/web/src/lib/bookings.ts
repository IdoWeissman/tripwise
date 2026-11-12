import type { BookingSource, BookingType } from '../gql/graphql';

/**
 * Type label + chip — design rules §1.5. Every booked thing wears the same solid Plan-blue chip (a plan
 * nobody has booked is dashed); the 3–5 letter code names the type, so section hues stay with their section.
 */
export const BOOKING_TYPES: Record<
  BookingType,
  { label: string; code: string; chip: string; tint: string }
> = {
  FLIGHT: {
    label: 'Flight',
    code: 'FLT',
    chip: 'bg-accent-tint text-accent-strong',
    tint: 'bg-accent-tint text-accent-strong',
  },
  STAY: {
    label: 'Stay',
    code: 'STAY',
    chip: 'bg-accent-tint text-accent-strong',
    tint: 'bg-accent-tint text-accent-strong',
  },
  EVENT: {
    label: 'Event',
    code: 'SHOW',
    chip: 'bg-accent-tint text-accent-strong',
    tint: 'bg-accent-tint text-accent-strong',
  },
  ATTRACTION: {
    label: 'Attraction',
    code: 'SIGHT',
    chip: 'bg-accent-tint text-accent-strong',
    tint: 'bg-accent-tint text-accent-strong',
  },
  TOUR: {
    label: 'Tour',
    code: 'TOUR',
    chip: 'bg-accent-tint text-accent-strong',
    tint: 'bg-accent-tint text-accent-strong',
  },
  TRANSPORT: {
    label: 'Transport',
    code: 'RAIL',
    chip: 'bg-accent-tint text-accent-strong',
    tint: 'bg-accent-tint text-accent-strong',
  },
  DINING: {
    label: 'Dining',
    code: 'FOOD',
    chip: 'bg-accent-tint text-accent-strong',
    tint: 'bg-accent-tint text-accent-strong',
  },
  OTHER: {
    label: 'Other',
    code: 'MISC',
    chip: 'bg-accent-tint text-accent-strong',
    tint: 'bg-accent-tint text-accent-strong',
  },
};

export const BOOKING_TYPE_ORDER: BookingType[] = [
  'FLIGHT',
  'STAY',
  'EVENT',
  'ATTRACTION',
  'TOUR',
  'TRANSPORT',
  'DINING',
  'OTHER',
];

/** Filter groups on the Bookings screen. */
export const FILTER_GROUPS = [
  { value: 'ALL', label: 'All', types: BOOKING_TYPE_ORDER },
  { value: 'FLIGHT', label: 'Flights', types: ['FLIGHT'] },
  { value: 'STAY', label: 'Stays', types: ['STAY'] },
  { value: 'THINGS', label: 'Things to do', types: ['EVENT', 'ATTRACTION', 'TOUR'] },
  { value: 'TRANSPORT', label: 'Transport', types: ['TRANSPORT'] },
  { value: 'DINING', label: 'Dining', types: ['DINING', 'OTHER'] },
] as const satisfies readonly { value: string; label: string; types: readonly BookingType[] }[];

export const SOURCE_LABEL: Record<BookingSource, string> = {
  MANUAL: 'Entered manually',
  EMAIL: 'Read from email',
  PDF: 'Read from PDF',
  IMAGE: 'From a photo',
  TEXT: 'Read from pasted text',
};

// --- wall-clock strings from the API: "YYYY-MM-DDTHH:mm" (already in the place's local time) ---

const DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const DAY_LONG = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const asUtc = (local: string) => new Date(`${local.slice(0, 10)}T00:00:00Z`);
export const localDay = (local: string | null | undefined) =>
  local ? DAY.format(asUtc(local)) : null;
export const localDayLong = (local: string | null | undefined) =>
  local ? DAY_LONG.format(asUtc(local)) : null;
/** "Leave by" for a flight: 2 h 30 min before departure, the same rule as the server's reminder. */
export function leaveBy(departLocal: string | null | undefined): string | null {
  const t = localTime(departLocal);
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const mins = (((h! * 60 + m! - 150) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export const localTime = (local: string | null | undefined) =>
  local && local.length > 10 ? local.slice(11, 16) : null;
export const localDate = (local: string | null | undefined) => (local ? local.slice(0, 10) : '');

/** "Fri, May 14 · 06:10" */
export const localDayTime = (local: string | null | undefined) =>
  local ? [localDay(local), localTime(local)].filter(Boolean).join(' · ') : null;

/** "+1" when the arrival is a day after departure. */
export function dayShift(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return '';
  const diff = Math.round((asUtc(to).getTime() - asUtc(from).getTime()) / 86_400_000);
  return diff > 0 ? ` +${diff}` : '';
}

/** "5 h 55 min" between two instants. */
export function duration(fromIso: string, toIso: string) {
  const mins = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ');
}

/** "in 45 min", "in 3 h 20 min", "in 2 days", "tomorrow". */
export function countdown(iso: string, now = Date.now()) {
  const mins = Math.round((Date.parse(iso) - now) / 60_000);
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins} min`;
  if (mins < 48 * 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `in ${h} h${m ? ` ${m} min` : ''}`;
  }
  return `in ${Math.round(mins / 1440)} days`;
}

export function fileExt(fileName: string, mime: string) {
  const ext = /\.([a-z0-9]{2,4})$/i.exec(fileName)?.[1];
  if (ext) return ext.toUpperCase();
  return mime === 'message/rfc822'
    ? 'EML'
    : (mime.split('/')[1]?.toUpperCase().slice(0, 4) ?? 'FILE');
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// --- uploads (REST: multipart isn't a good fit for GraphQL) ---

export interface SegmentDraft {
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

export interface BookingDraft {
  type: BookingType;
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
  segments: SegmentDraft[];
  fromSource: string[];
  source: BookingSource;
  attachmentId?: string | null;
  sourceName?: string | null;
}

export interface UploadResult {
  attachment: { id: string; fileName: string; mimeType: string; sizeBytes: number };
  kind: 'EMAIL' | 'PDF' | 'IMAGE';
  drafts: BookingDraft[];
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ACCEPT =
  '.pdf,.eml,.png,.jpg,.jpeg,application/pdf,message/rfc822,image/png,image/jpeg';

export async function uploadBookingFile(tripId: string, file: File): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Files can be up to 15 MB.');
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/trips/${tripId}/attachments`, {
    method: 'POST',
    body,
    credentials: 'include',
  });
  const json = (await res.json().catch(() => ({}))) as Partial<UploadResult> & { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Upload failed. Please try again.');
  return json as UploadResult;
}

// --- list/detail presentation ---

interface WhenLike {
  type: BookingType;
  startLocal?: string | null;
  endLocal?: string | null;
  travellers?: number | null;
  segments: { departLocal: string; arriveLocal?: string | null }[];
}

/** Wall-clock start used for ordering and grouping (first leg for flights/trains). */
export const startOf = (b: WhenLike) => b.segments[0]?.departLocal ?? b.startLocal ?? null;

/** One-line schedule shown on cards: "06:10 – 10:05 · 4 passengers". */
export function bookingWhen(b: WhenLike): string {
  const people = (n: number | null | undefined, one: string, many: string) =>
    n ? ` · ${n} ${n === 1 ? one : many}` : '';
  const leg = b.segments[0];
  if (leg) {
    const dep = localTime(leg.departLocal);
    const arr = localTime(leg.arriveLocal);
    if (!dep) return 'Time missing';
    const span = arr ? `${dep} – ${arr}${dayShift(leg.departLocal, leg.arriveLocal)}` : dep;
    return (
      span +
      (b.type === 'FLIGHT'
        ? people(b.travellers, 'passenger', 'passengers')
        : people(b.travellers, 'traveller', 'travellers'))
    );
  }
  if (b.type === 'STAY') {
    const inn = localDayTime(b.startLocal);
    const out = localDayTime(b.endLocal);
    if (!inn) return 'Dates missing';
    return out ? `Check-in ${inn} → check-out ${out}` : `Check-in ${inn} · check-out missing`;
  }
  const start = localTime(b.startLocal);
  if (!start) return b.startLocal ? 'Time not set' : 'Date and time missing';
  const end = localTime(b.endLocal);
  return (end ? `${start} – ${end}` : start) + people(b.travellers, 'person', 'people');
}

/** Section heading for a trip day: "Fri, May 14 · Day 1" (outside the trip: no day number). */
export function dayHeading(localDateStr: string, tripStartIso: string, tripEndIso: string) {
  const day = localDay(localDateStr) ?? localDateStr;
  const n =
    Math.round((asUtc(localDateStr).getTime() - asUtc(tripStartIso).getTime()) / 86_400_000) + 1;
  const last =
    Math.round((asUtc(tripEndIso).getTime() - asUtc(tripStartIso).getTime()) / 86_400_000) + 1;
  return n >= 1 && n <= last ? `${day} · Day ${n}` : day;
}

/** Bookings grouped by the local day they start, in time order; undated ones last. */
export function groupByDay<T extends WhenLike>(items: T[]): { date: string | null; items: T[] }[] {
  const sorted = [...items].sort((a, b) => (startOf(a) ?? '￿').localeCompare(startOf(b) ?? '￿'));
  const groups: { date: string | null; items: T[] }[] = [];
  for (const item of sorted) {
    const date = startOf(item)?.slice(0, 10) ?? null;
    const last = groups.at(-1);
    if (last && last.date === date) last.items.push(item);
    else groups.push({ date, items: [item] });
  }
  return groups;
}

/**
 * One timetable row: a booking, or one leg of a multi-leg flight/train. A round trip shows its
 * return under the day it departs, and each leg is done on its own.
 */
export interface BookingRow<T> {
  key: string;
  booking: T;
  leg: T extends { segments: (infer S)[] } ? S | null : null;
  /** 1-based leg number, and how many legs the booking has (0 when it has none). */
  legNo: number;
  legCount: number;
  start: string | null;
  /** When the row is over: the leg's arrival, the booking's end, or else its start. */
  end: string | null;
}

export function bookingRows<
  T extends WhenLike & {
    id: string;
    segments: { departLocal: string; arriveLocal?: string | null }[];
  },
>(items: T[]): BookingRow<T>[] {
  const rows: BookingRow<T>[] = [];
  for (const b of items) {
    if (b.segments.length > 1) {
      b.segments.forEach((leg, i) =>
        rows.push({
          key: `${b.id}:${i}`,
          booking: b,
          leg: leg as BookingRow<T>['leg'],
          legNo: i + 1,
          legCount: b.segments.length,
          start: leg.departLocal,
          end: leg.arriveLocal ?? leg.departLocal,
        }),
      );
    } else {
      const leg = b.segments[0] ?? null;
      rows.push({
        key: b.id,
        booking: b,
        leg: leg as BookingRow<T>['leg'],
        legNo: leg ? 1 : 0,
        legCount: b.segments.length,
        start: startOf(b),
        end: leg ? (leg.arriveLocal ?? leg.departLocal) : (b.endLocal ?? b.startLocal ?? null),
      });
    }
  }
  return rows.sort((a, b) => (a.start ?? '￿').localeCompare(b.start ?? '￿'));
}

/** Rows grouped by the local day they start, in time order; undated ones last. */
export function groupRowsByDay<R extends { start: string | null }>(
  rows: R[],
): { date: string | null; items: R[] }[] {
  const groups: { date: string | null; items: R[] }[] = [];
  for (const row of rows) {
    const date = row.start?.slice(0, 10) ?? null;
    const last = groups.at(-1);
    if (last && last.date === date) last.items.push(row);
    else groups.push({ date, items: [row] });
  }
  return groups;
}

/** "€1,248.00" — price is a decimal string from the API. */
export function bookingPrice(
  price: string | null | undefined,
  currency: string | null | undefined,
) {
  if (!price) return null;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency ?? 'EUR',
    }).format(Number(price));
  } catch {
    return `${price} ${currency ?? ''}`.trim();
  }
}

// --- directions ---

interface PlaceLike {
  type: BookingType;
  location?: string | null;
  address?: string | null;
}
interface LegPlace {
  fromCode?: string | null;
  fromName?: string | null;
}

/**
 * Google Maps directions to where you need to be: the departure airport/station for a leg,
 * otherwise the venue (name + address, so Maps finds the exact place). Null when unknown.
 */
export function directions(
  b: PlaceLike,
  leg?: LegPlace | null,
): { url: string; label: string } | null {
  let destination: string | null;
  let label = 'Directions';
  if (leg && (leg.fromCode || leg.fromName)) {
    const place = leg.fromName ?? leg.fromCode!;
    destination =
      b.type === 'FLIGHT'
        ? [leg.fromName, leg.fromCode, /airport|arpt|intl/i.test(place) ? null : 'airport']
            .filter(Boolean)
            .join(' ')
        : place;
    label = `Directions to ${leg.fromCode ?? leg.fromName}`;
  } else {
    destination = [b.location, b.address].filter(Boolean).join(', ') || null;
  }
  if (!destination) return null;
  return {
    url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
    label,
  };
}
