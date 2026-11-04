import { Link } from 'react-router';
import { BOOKING_TYPES, localTime } from '../../lib/bookings';
import type { Day } from './queries';

/** Bookings on an itinerary day — design canvas "Itinerary with bookings" / rules §2 · 03. Read-only: edit on the booking. */
export function DayBookings({ day }: { day: Day }) {
  const { stay, bookings } = day;
  if (!stay && bookings.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {stay && (
        <Link
          to={`../bookings/${stay.booking.id}`}
          relative="path"
          className="flex min-h-11 items-center gap-2 rounded-control bg-member-teal px-2.5 py-1.5 text-xs font-semibold text-member-teal-ink no-underline hover:text-member-teal-ink"
        >
          <span aria-hidden="true" className="text-[9px] font-bold tracking-[0.04em]">
            STAY
          </span>
          <span className="min-w-0 truncate">
            {stay.isCheckIn
              ? `Check-in ${localTime(stay.booking.startLocal) ?? ''} · ${stay.booking.title}`
              : stay.isCheckOut
                ? `Check-out ${localTime(stay.booking.endLocal) ?? ''} · ${stay.booking.title}`
                : `Night ${stay.night} of ${stay.nights} · ${stay.booking.title}`}
          </span>
        </Link>
      )}
      {bookings
        .filter((b) => b.type !== 'STAY')
        .map((b) => {
          const t = BOOKING_TYPES[b.type];
          const leg = b.segments[0];
          const start = localTime(leg?.departLocal ?? b.startLocal);
          const end = localTime(leg?.arriveLocal ?? b.endLocal);
          const needs = b.missingFields.length > 0;
          return (
            <Link
              key={b.id}
              to={`../bookings/${b.id}`}
              relative="path"
              className={`flex flex-col gap-1 rounded-xl border bg-surface px-3 py-2.5 text-ink no-underline hover:text-ink ${needs ? 'border-attention' : 'border-border'}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-chip px-1.5 py-0.5 text-[9px] font-bold tracking-[0.04em] ${t.chip}`}
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
              <span className="text-sm font-semibold">
                {leg?.fromCode && leg.toCode ? `${leg.fromCode} → ${leg.toCode}` : b.title}
              </span>
              <span className="truncate text-xs text-ink-muted">
                {[leg?.number ?? b.provider, b.confirmationCode].filter(Boolean).join(' · ')}
              </span>
            </Link>
          );
        })}
    </div>
  );
}
