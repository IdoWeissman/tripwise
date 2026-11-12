import { localTime } from '../../lib/bookings';
import type { Day } from './queries';

export type DayBooking = Day['bookings'][number];
interface LegLike {
  departLocal?: string | null;
  arriveLocal?: string | null;
}
interface BookingLike {
  segments: LegLike[];
  startLocal?: string | null;
}

/** The leg of a booking that belongs to `date` ("YYYY-MM-DD"): the one departing that day, else arriving. */
export function legOn<L extends LegLike>(b: { segments: L[] }, date: string): L | undefined {
  return (
    b.segments.find((s) => s.departLocal?.slice(0, 10) === date) ??
    b.segments.find((s) => s.arriveLocal?.slice(0, 10) === date) ??
    b.segments[0]
  );
}

/** Local "HH:mm" when the booking starts on `date`, or null when it has no time. */
export function bookingTimeOn(b: BookingLike, date: string): string | null {
  const leg = legOn(b, date);
  return localTime(leg?.departLocal ?? b.startLocal);
}

export type Entry<B> =
  | { kind: 'booking'; booking: B; time: string | null }
  | { kind: 'activity'; id: string; time: string | null };

/**
 * One day in time order (rules §2 · 03). Anything with a time is placed by its time — a booking
 * before a plan at the same minute — then plans without a time in their saved order, then
 * bookings whose time is still missing.
 */
export function dayTimeline<B extends BookingLike>(
  activityIds: string[],
  timeOf: (activityId: string) => string | null | undefined,
  bookings: B[],
  date: string,
): Entry<B>[] {
  const entries: (Entry<B> & { rank: number; seq: number })[] = [
    ...bookings.map((booking, seq) => {
      const time = bookingTimeOn(booking, date);
      return { kind: 'booking' as const, booking, time, rank: time ? 0 : 2, seq };
    }),
    ...activityIds.map((id, seq) => {
      const time = timeOf(id) ?? null;
      return { kind: 'activity' as const, id, time, rank: time ? 0 : 1, seq };
    }),
  ];
  entries.sort(
    (x, y) =>
      x.rank - y.rank ||
      (x.time ?? '').localeCompare(y.time ?? '') ||
      (x.kind === y.kind ? 0 : x.kind === 'booking' ? -1 : 1) ||
      x.seq - y.seq,
  );
  return entries.map(({ rank: _rank, seq: _seq, ...e }) => e as Entry<B>);
}

/** Activity ids of a day in the order the timeline shows them (what the drag-and-drop list must use). */
export function orderedActivities(
  activityIds: string[],
  timeOf: (activityId: string) => string | null | undefined,
): string[] {
  return dayTimeline(activityIds, timeOf, [], '').flatMap((e) =>
    e.kind === 'activity' ? [e.id] : [],
  );
}
