import type { ReminderPreference } from '../generated/prisma/client.js';
import type { BookingModel, ReminderModel } from '../graphql/models.js';
import { instantToLocal, localTime, localToInstant } from '../lib/time.js';

const HOUR = 3_600_000;
export const DEFAULT_PREFS = {
  checkIn: true,
  leaveForAirport: true,
  checkOut: true,
  startingSoon: false,
  email: false,
} as const;

type Prefs = Pick<ReminderPreference, keyof typeof DEFAULT_PREFS>;

const STARTING_SOON_TYPES = new Set([
  'EVENT',
  'ATTRACTION',
  'TOUR',
  'DINING',
  'TRANSPORT',
  'OTHER',
]);

/**
 * Reminders for one person, derived from bookings — nothing is stored except what was emailed.
 * - Online check-in opens: 24 h before each flight leg
 * - Leave for the airport: 2 h 30 min before a flight that isn't a short connection
 * - Check-out: 08:00 local on check-out day (or 1 h before, if earlier)
 * - Starting soon: 1 h before events, tours, attractions, restaurants and trains
 */
export function computeReminders(
  bookings: BookingModel[],
  prefs: Prefs,
  tripZone: string,
): ReminderModel[] {
  const out: ReminderModel[] = [];
  for (const b of bookings) {
    if (b.status === 'CANCELLED') continue;
    const tz = b.timeZone ?? tripZone;

    if (b.type === 'FLIGHT') {
      const legs = b.segments ?? [];
      legs.forEach((s, i) => {
        const route = [s.fromCode ?? s.fromName, s.toCode ?? s.toName].filter(Boolean).join(' → ');
        const label = [s.number, route].filter(Boolean).join(' · ');
        const dz = s.departTz ?? tz;
        if (prefs.checkIn) {
          out.push({
            key: `${b.id}:${s.id}:checkin`,
            kind: 'CHECK_IN_OPENS',
            title: 'Online check-in opens',
            body: `${label} · departs ${instantToLocal(s.departsAt, dz).replace('T', ' ')}`,
            fireAt: new Date(s.departsAt.getTime() - 24 * HOUR),
            targetAt: s.departsAt,
            booking: b,
          });
        }
        const prev = legs[i - 1];
        const isConnection =
          prev?.arrivesAt && s.departsAt.getTime() - prev.arrivesAt.getTime() < 6 * HOUR;
        if (prefs.leaveForAirport && !isConnection) {
          const leaveAt = new Date(s.departsAt.getTime() - 2.5 * HOUR);
          out.push({
            key: `${b.id}:${s.id}:leave`,
            kind: 'LEAVE_FOR_AIRPORT',
            title: `Leave for the airport by ${localTime(leaveAt, dz)}`,
            body: `${label} departs at ${localTime(s.departsAt, dz)}. Recommended 2 h 30 min before.`,
            fireAt: new Date(leaveAt.getTime() - HOUR),
            targetAt: leaveAt,
            booking: b,
          });
        }
      });
    }

    if (b.type === 'STAY' && b.endsAt && prefs.checkOut) {
      const morning = localToInstant(`${instantToLocal(b.endsAt, tz).slice(0, 10)}T08:00`, tz);
      const fireAt = new Date(Math.min(morning.getTime(), b.endsAt.getTime() - HOUR));
      out.push({
        key: `${b.id}:checkout`,
        kind: 'CHECK_OUT',
        title: `Check out by ${localTime(b.endsAt, tz)}`,
        body: b.title,
        fireAt,
        targetAt: b.endsAt,
        booking: b,
      });
    }

    if (STARTING_SOON_TYPES.has(b.type) && b.startsAt && prefs.startingSoon) {
      out.push({
        key: `${b.id}:soon`,
        kind: 'STARTING_SOON',
        title: `${b.title} starts at ${localTime(b.startsAt, tz)}`,
        body:
          [b.location, b.confirmationCode && `Ref. ${b.confirmationCode}`]
            .filter(Boolean)
            .join(' · ') || b.title,
        fireAt: new Date(b.startsAt.getTime() - HOUR),
        targetAt: b.startsAt,
        booking: b,
      });
    }
  }
  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

/** Reminders that are still relevant (the thing hasn't happened yet). */
export const upcoming = (rs: ReminderModel[], now = new Date()) =>
  rs.filter((r) => r.targetAt > now);
