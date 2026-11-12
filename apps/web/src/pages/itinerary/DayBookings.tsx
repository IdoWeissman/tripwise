import { Link } from 'react-router';
import { BOOKING_TYPES, dayShift, localTime } from '../../lib/bookings';
import { bookedByPlans } from './bookedPlans';
import type { Day } from './queries';
import { legOn, type DayBooking } from './timeline';

/** Teal stay strip pinned at the top of a day — rules §2 · 03. Links to the stay. */
export function StayStrip({ day }: { day: Day }) {
  const { stay } = day;
  if (!stay) return null;
  // When a plan already covers the check-in, the strip just says which night it is.
  const checkInPlanned = stay.isCheckIn && bookedByPlans(day).has(stay.booking.id);
  return (
    <Link
      to={`../bookings/${stay.booking.id}`}
      relative="path"
      title={stay.booking.title}
      className="flex min-h-11 items-center gap-2 rounded-control bg-member-teal px-2.5 py-1.5 text-xs font-semibold text-member-teal-ink no-underline hover:text-member-teal-ink"
    >
      <span aria-hidden="true" className="font-bold tracking-[0.04em]">
        STAY
      </span>
      <span className="sr-only">Stay: </span>
      <span className="min-w-0 truncate">
        {stay.isCheckIn && !checkInPlanned
          ? `Check-in ${localTime(stay.booking.startLocal) ?? ''} · ${stay.booking.title}`
          : stay.isCheckOut
            ? `Check-out ${localTime(stay.booking.endLocal) ?? ''} · ${stay.booking.title}`
            : `Night ${Math.max(stay.night, 1)} of ${stay.nights} · ${stay.booking.title}`}
      </span>
    </Link>
  );
}

/** Compact, read-only booking card for one day (edit on the booking). Shows the leg that belongs to `date`. */
export function BookingCard({ booking: b, date }: { booking: DayBooking; date: string }) {
  const t = BOOKING_TYPES[b.type];
  const leg = legOn(b, date);
  const start = localTime(leg?.departLocal ?? b.startLocal);
  const endLocal = leg?.arriveLocal ?? b.endLocal;
  // "00:25 +1" when it ends after midnight, as on the booking page.
  const end =
    localTime(endLocal) &&
    `${localTime(endLocal)}${dayShift(leg?.departLocal ?? b.startLocal, endLocal)}`;
  const needs = b.missingFields.length > 0;
  return (
    <Link
      to={`../bookings/${b.id}`}
      relative="path"
      className={`flex flex-col gap-1 rounded-xl border bg-surface px-3 py-2.5 text-ink no-underline hover:text-ink ${needs ? 'border-attention' : 'border-border'}`}
    >
      <span className="flex min-h-7 items-center justify-between gap-2">
        <span
          className={`rounded-chip px-1.5 py-0.5 text-xs font-bold tracking-[0.04em] ${t.chip}`}
        >
          <span className="sr-only">{t.label} booking: </span>
          {t.code}
        </span>
        <span
          className={`text-xs font-semibold tabular-nums ${needs ? 'text-attention-ink' : 'text-ink-secondary'}`}
        >
          {start ? (end ? `${start} – ${end}` : start) : 'Time missing'}
        </span>
      </span>
      <span className="text-sm leading-snug font-semibold text-balance">
        {leg?.fromCode && leg.toCode ? `${leg.fromCode} → ${leg.toCode}` : b.title}
      </span>
      <span className="truncate text-xs text-ink-muted">
        {[leg?.number ?? b.provider, b.confirmationCode].filter(Boolean).join(' · ')}
      </span>
    </Link>
  );
}
