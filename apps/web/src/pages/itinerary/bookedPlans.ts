import type { Day } from './queries';

/** Bookings that a planned activity on the day already stands for (shown on that activity). */
export function bookedByPlans(day: Day): Set<string> {
  return new Set(day.activities.flatMap((a) => (a.booking ? [a.booking.id] : [])));
}

/** Booking cards shown on their own (not already carried by a planned activity). */
export function standaloneBookings(day: Day) {
  const booked = bookedByPlans(day);
  return day.bookings.filter((b) => b.type !== 'STAY' && !booked.has(b.id));
}
