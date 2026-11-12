import { localDate, localTime } from '../lib/time.js';
import type { BookingModel } from '../graphql/models.js';

/** The part of an activity that decides whether it is the same event as a booking. */
export interface ActivityLike {
  title: string;
  location: string | null;
  startTime: string | null;
}

/** Lower case, accents and punctuation removed: "Pastéis de Belém!" → "pasteis de belem". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** True when the shorter name (≥ 4 chars) appears inside the longer one. */
function overlaps(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = normalize(a);
  const y = normalize(b);
  if (x.length < 4 || y.length < 4) return false;
  return x.includes(y) || y.includes(x);
}

const CHECK_IN = /\bcheck\s*-?\s*in\b/i;

/** When the booking starts on `date` (local "YYYY-MM-DD"): its local start time, and whether it is a stay check-in. */
export function bookingStartOn(
  b: BookingModel,
  date: string,
  tripZone: string,
): { time: string | null; checkIn: boolean } | null {
  if (b.status === 'CANCELLED') return null;
  const tz = b.timeZone ?? tripZone;
  if (b.segments?.length) {
    const leg = b.segments.find((s) => localDate(s.departsAt, s.departTz ?? tz) === date);
    return leg ? { time: localTime(leg.departsAt, leg.departTz ?? tz), checkIn: false } : null;
  }
  if (!b.startsAt || localDate(b.startsAt, tz) !== date) return null;
  return { time: localTime(b.startsAt, tz), checkIn: b.type === 'STAY' };
}

/**
 * The booking an activity on `date` stands for, if any — so the same event is shown once.
 * A plan matches a booking that starts the same day at the same time (or either has no time)
 * when the booking's name or place appears in the plan, or when both are a stay check-in.
 */
export function matchBooking(
  activity: ActivityLike,
  date: string,
  bookings: BookingModel[],
  tripZone: string,
): BookingModel | null {
  for (const b of bookings) {
    const start = bookingStartOn(b, date, tripZone);
    if (!start) continue;
    const sameTime = !activity.startTime || !start.time || activity.startTime === start.time;
    if (!sameTime) continue;
    const name = b.title.split(',')[0]!;
    const named = overlaps(activity.title, name) || overlaps(activity.title, b.title);
    // A place match is only trusted at an exact time; untimed plans need the name.
    const placed =
      Boolean(activity.startTime && start.time) &&
      (overlaps(activity.location, b.address) || overlaps(activity.location, b.location));
    const checkIn = start.checkIn && CHECK_IN.test(activity.title);
    if (named || placed || checkIn) return b;
  }
  return null;
}
