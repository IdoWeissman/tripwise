import { useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../components/Bits';
import { Button } from '../components/Button';
import {
  AlertIcon,
  BellIcon,
  ChevronDownIcon,
  CopyIcon,
  ExternalIcon,
  PlusIcon,
} from '../components/Icons';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import {
  BOOKING_TYPES,
  bookingPrice,
  bookingRows,
  bookingWhen,
  dayHeading,
  dayShift,
  FILTER_GROUPS,
  groupRowsByDay,
  localDay,
  localTime,
  type BookingRow,
} from '../lib/bookings';
import { isPast, nowHHMM, todayIn } from '../lib/format';
import { useTrip } from '../lib/trip';
import { AddBookingDialog } from './bookings/AddBookingDialog';
import { CalendarDialog } from './bookings/CalendarDialog';
import { BookingsDocument, type BookingSummary } from './bookings/queries';

type FilterValue = (typeof FILTER_GROUPS)[number]['value'];
type Row = BookingRow<BookingSummary>;

/**
 * Bookings — rules §2 · 08. A timetable: one row per booking (one per leg for multi-leg flights),
 * grouped by day in one panel each. Mid-trip it opens on today; finished days fold away.
 */
export function BookingsPage() {
  const { trip, canEdit } = useTrip();
  const [params, setParams] = useSearchParams();
  const foldKey = `tripwise:bookings-earlier:${trip.id}`;
  const [showEarlier, setShowEarlierState] = useState(() => {
    try {
      return sessionStorage.getItem(foldKey) === 'open';
    } catch {
      return false;
    }
  });
  const setShowEarlier = (open: boolean) => {
    setShowEarlierState(open);
    try {
      sessionStorage.setItem(foldKey, open ? 'open' : 'closed');
    } catch {
      /* private mode: the fold is simply not remembered */
    }
  };
  const { data, loading, error, refetch } = useQuery(BookingsDocument, {
    variables: { id: trip.id },
  });

  // The filter and the dialogs live in the URL, so back-navigation and links keep them.
  const filter = (FILTER_GROUPS.find((g) => g.value === params.get('type'))?.value ??
    'ALL') as FilterValue;
  const dialog = params.has('add') ? 'add' : params.has('calendar') ? 'calendar' : null;
  const withType = (extra: Record<string, string> = {}) => ({
    ...(filter === 'ALL' ? {} : { type: filter }),
    ...extra,
  });
  const open = (name: 'add' | 'calendar') => setParams(withType({ [name]: '' }));
  const close = () => setParams(withType(), { replace: true });
  const setFilter = (value: FilterValue) =>
    setParams(value === 'ALL' ? {} : { type: value }, { replace: true });

  const header = (
    <PageHeader
      title="Bookings"
      subtitle="Tickets, reservations and confirmations for the whole group."
      subtitleClassName="max-sm:hidden"
      actions={
        <>
          {canEdit && (
            <Button onClick={() => open('add')} className="max-sm:flex-1">
              <PlusIcon />
              Add booking
            </Button>
          )}
          {/* Set once, so on phones it folds to an icon beside the primary. */}
          <Button
            variant="secondary"
            onClick={() => open('calendar')}
            aria-label="Calendar & reminders"
            className="max-sm:order-last max-sm:w-11 max-sm:px-0"
          >
            <BellIcon />
            <span className="max-sm:hidden">Calendar &amp; reminders</span>
          </Button>
        </>
      }
    />
  );

  const dialogs = (
    <>
      {canEdit && <AddBookingDialog open={dialog === 'add'} onClose={close} />}
      <CalendarDialog open={dialog === 'calendar'} onClose={close} />
    </>
  );

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        {header}
        <Skeleton className="h-11 w-full max-w-xl" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (error || !data?.trip) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState message="We couldn't load the bookings." onRetry={() => void refetch()} />
      </div>
    );
  }

  const all = data.trip.bookings;
  if (all.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          title="No bookings yet"
          body="Add a confirmation email, PDF or ticket photo and we'll fill in the details — flights, stays, shows and more."
          action={
            canEdit && (
              <Button onClick={() => open('add')}>
                <PlusIcon />
                Add your first booking
              </Button>
            )
          }
        />
        {dialogs}
      </div>
    );
  }

  const rows = bookingRows(all);
  const typesOf = (value: FilterValue) =>
    FILTER_GROUPS.find((g) => g.value === value)!.types as readonly string[];
  const shown = rows.filter((r) => typesOf(filter).includes(r.booking.type));
  const needsDetails = all.filter(
    (b) => b.missingFields.length > 0 && typesOf(filter).includes(b.type),
  );

  const tz = trip.timeZone;
  const today = todayIn(tz);
  const nowKey = `${today}T${nowHHMM(tz)}`;
  const isDone = (r: Row) => !!r.end && isPast(r.end.slice(0, 10), localTime(r.end), tz);
  // The next departure lifts: the first row still ahead, whatever the filter shows.
  const nextKey = shown.find(
    (r) => r.start && r.start.slice(0, 16) >= nowKey && r.booking.status !== 'CANCELLED',
  )?.key;

  // Anything still in effect today (a stay, a multi-day tour) is pinned to Today instead of
  // folding away with the day it started on.
  const ongoing = shown.filter(
    (r) =>
      r.start &&
      r.end &&
      r.start.slice(0, 10) < today &&
      r.end.slice(0, 10) >= today &&
      !isDone(r) &&
      r.booking.status !== 'CANCELLED',
  );
  const groups = groupRowsByDay(shown.filter((r) => !ongoing.includes(r)));
  if (ongoing.length > 0 && !groups.some((g) => g.date === today)) {
    const at = groups.findIndex((g) => g.date === null || g.date > today);
    groups.splice(at === -1 ? groups.length : at, 0, { date: today, items: [] });
  }
  // Days before today (only finished rows remain in them) fold into one line.
  const earlier = groups.filter((g) => g.date && g.date < today);
  const rest = groups.filter((g) => !earlier.includes(g));
  const visible = showEarlier ? groups : rest;
  const earlierRows = earlier.reduce((n, g) => n + g.items.length, 0);
  // Mid-trip the plan comes first: the needs-details note shrinks to one line after Today.
  const midTrip = today >= trip.startDate.slice(0, 10) && today <= trip.endDate.slice(0, 10);
  const alertAfterToday = midTrip && visible.some((g) => g.date === today);
  const first = needsDetails[0];
  const compactAlert = first && (
    <Link
      to={first.id}
      className="flex min-h-11 items-center gap-2 rounded-card border border-attention bg-tint-orange px-4 text-sm font-bold text-attention-ink no-underline hover:text-attention-ink"
    >
      <AlertIcon size={18} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {needsDetails.length === 1
          ? `${first.title} needs ${first.missingFields.join(' and ')}`
          : `${needsDetails.length} bookings need details`}
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );

  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      {header}

      {/* phones: a fade at the right edge says the pill row scrolls */}
      <div className="relative after:pointer-events-none after:absolute after:inset-y-0 after:-right-4 after:w-10 after:bg-linear-to-l after:from-bg after:to-transparent sm:after:hidden">
        <div
          role="group"
          aria-label="Filter by type"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {FILTER_GROUPS.map((g) => {
            const on = g.value === filter;
            const count = rows.filter((r) => typesOf(g.value).includes(r.booking.type)).length;
            // Empty types hide; All and the active filter always stay.
            if (count === 0 && g.value !== 'ALL' && !on) return null;
            return (
              <button
                key={g.value}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(g.value)}
                className={`relative flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold ${
                  on
                    ? 'border-sign bg-sign text-white'
                    : 'border-border-input bg-surface text-ink hover:bg-surface-muted'
                }`}
              >
                {g.label}
                <span aria-hidden="true" className="figures text-xs opacity-80">
                  {count}
                </span>
                <span className="sr-only">
                  , {count} {count === 1 ? 'booking' : 'bookings'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {first && !alertAfterToday && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-attention bg-tint-orange px-4 py-2 text-sm">
          <AlertIcon size={20} className="shrink-0 text-attention-ink" />
          <span>
            <strong>{first.title}</strong> is missing {first.missingFields.join(' and ')}
            {needsDetails.length > 1 && `, and ${needsDetails.length - 1} more need details`}.
          </span>
          <Link to={first.id} className="flex min-h-11 items-center font-bold text-attention-ink">
            Add details
          </Link>
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          title="No bookings of this type"
          body="Add a confirmation email, PDF or ticket photo and we'll file it here."
          action={
            canEdit && (
              <Button variant="secondary" onClick={() => open('add')}>
                <PlusIcon />
                Add booking
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {earlier.length > 0 && (
            <button
              type="button"
              aria-expanded={showEarlier}
              onClick={() => setShowEarlier(!showEarlier)}
              className="flex min-h-12 items-center justify-between gap-3 rounded-card border border-border bg-surface px-5 text-left text-sm font-bold text-ink-secondary hover:bg-bg"
            >
              <span>
                Earlier · {earlier.length} {earlier.length === 1 ? 'day' : 'days'}, {earlierRows}{' '}
                {earlierRows === 1 ? 'booking' : 'bookings'}
              </span>
              <ChevronDownIcon
                size={18}
                className={`transition-transform duration-200 ${showEarlier ? 'rotate-180' : ''}`}
              />
            </button>
          )}
          {visible.map((g) => {
            const id = `bk-day-${g.date ?? 'undated'}`;
            const isToday = g.date === today;
            return (
              <section
                key={g.date ?? 'undated'}
                aria-labelledby={id}
                className="flex flex-col gap-2"
              >
                <h2 id={id} className="flex items-center gap-2 text-[15px] font-extrabold">
                  {isToday && (
                    <span className="rounded-full bg-signal px-2 py-0.5 text-xs font-extrabold text-sign">
                      Today
                    </span>
                  )}
                  <span className={isToday ? 'text-ink' : 'text-ink-secondary'}>
                    {g.date ? dayHeading(g.date, trip.startDate, trip.endDate) : 'No date yet'}
                  </span>
                </h2>
                <ol
                  className={`overflow-hidden rounded-card border-2 bg-surface ${isToday ? 'border-sign' : 'border-transparent'}`}
                >
                  {isToday &&
                    ongoing.map((r) => (
                      <BookingLine key={r.key} row={r} done={false} next={false} today={today} />
                    ))}
                  {g.items.map((r) => (
                    <BookingLine key={r.key} row={r} done={isDone(r)} next={r.key === nextKey} />
                  ))}
                </ol>
                {isToday && alertAfterToday && compactAlert}
              </section>
            );
          })}
        </div>
      )}
      {dialogs}
    </div>
  );
}

function BookingLine({
  row: r,
  done,
  next,
  today,
}: {
  row: Row;
  done: boolean;
  next: boolean;
  /** Set for a row pinned to Today because it is still in effect. */
  today?: string;
}) {
  const toast = useToast();
  const b = r.booking;
  const t = BOOKING_TYPES[b.type];
  const leg = r.leg;
  const needs = b.missingFields.length > 0;
  const cancelled = b.status === 'CANCELLED';
  const time = localTime(r.start);
  const route =
    leg && (leg.fromName || leg.fromCode) && (leg.toName || leg.toCode)
      ? `${leg.fromName ?? leg.fromCode} → ${leg.toName ?? leg.toCode}`
      : null;
  const staying = today ? stayingLine(r, today) : null;
  const when = staying
    ? staying
    : needs
      ? `Missing ${b.missingFields.join(' and ')}`
      : leg
        ? [
            `${localTime(leg.departLocal)}${leg.arriveLocal ? ` – ${localTime(leg.arriveLocal)}${dayShift(leg.departLocal, leg.arriveLocal)}` : ''}`,
            r.legCount > 1 && `Leg ${r.legNo} of ${r.legCount}`,
            b.travellers && `${b.travellers} ${b.travellers === 1 ? 'passenger' : 'passengers'}`,
          ]
            .filter(Boolean)
            .join(' · ')
        : bookingWhen(b);
  const files = b.attachments.length;
  // Price belongs to the booking, so a multi-leg trip shows it once, on its first leg.
  const price = r.legNo <= 1 ? bookingPrice(b.price, b.currency) : null;
  const meta = [
    b.provider,
    leg?.number,
    price,
    files > 0 && `${files} ${files === 1 ? 'document' : 'documents'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(b.confirmationCode ?? '');
      toast(`Copied ${b.confirmationCode}`);
    } catch {
      toast('Copy failed — select the code and copy it manually.', 'error');
    }
  };

  return (
    // The title link stretches over the whole row; the code and external buttons sit above it.
    <li className="relative grid has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-accent grid-cols-[64px_minmax(0,1fr)] items-start gap-x-4 gap-y-2 border-t border-border px-4 py-3.5 first:border-t-0 hover:bg-bg sm:grid-cols-[80px_minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <span className="flex flex-col items-start gap-1.5">
        <span
          className={`figures text-[22px] leading-none font-extrabold ${
            done ? 'text-ink-muted' : next ? 'text-accent-strong' : 'text-ink'
          }`}
        >
          {staying
            ? 'Now'
            : (time ?? (
                <>
                  <span aria-hidden="true">––:––</span>
                  <span className="sr-only">No time</span>
                </>
              ))}
        </span>
        <span
          aria-hidden="true"
          className={`rounded-chip px-1.5 py-0.5 text-xs font-extrabold tracking-[0.06em] ${
            needs
              ? 'border-[1.5px] border-dashed border-attention-ink text-attention-ink'
              : done
                ? 'bg-surface-muted text-ink-muted'
                : t.chip
          }`}
        >
          {t.code}
        </span>
      </span>

      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to={b.id}
            className={`text-base font-bold no-underline after:absolute after:inset-0 focus-visible:outline-none ${done || cancelled ? 'text-ink-muted hover:text-ink-muted' : 'text-ink hover:text-ink'}`}
          >
            <span className="sr-only">
              {done ? 'Done: ' : next ? 'Next: ' : ''}
              {t.label}
              {time ? ` at ${time}` : ''}:{' '}
            </span>
            <span className={done || cancelled ? 'line-through decoration-1' : ''}>
              {route ?? b.title}
            </span>
          </Link>
          {next && (
            <span className="rounded-full bg-signal px-2 py-0.5 text-xs font-extrabold text-sign">
              Next
            </span>
          )}
          {cancelled && (
            <span className="rounded-chip bg-surface-muted px-2 py-0.5 text-xs font-bold text-ink-secondary">
              Cancelled
            </span>
          )}
        </span>
        <span
          className={`figures text-sm ${needs ? 'font-semibold text-attention-ink' : 'text-ink-secondary'}`}
        >
          {when}
        </span>
        {meta && <span className="text-[13px] text-ink-muted">{meta}</span>}
      </span>

      {(b.confirmationCode || b.bookingUrl) && (
        <span className="relative z-10 col-start-2 flex items-center gap-1 sm:col-start-3">
          {b.confirmationCode && (
            <button
              type="button"
              onClick={() => void copy()}
              aria-label={`Copy confirmation code ${b.confirmationCode}`}
              className={`flex min-h-11 items-center gap-2 rounded-control border border-border bg-bg px-3 font-mono text-[15px] font-extrabold tracking-[0.1em] hover:border-border-input ${done ? 'text-ink-muted' : 'text-sign'}`}
            >
              {b.confirmationCode}
              <CopyIcon size={16} className="text-ink-muted" />
            </button>
          )}
          {b.bookingUrl && (
            <a
              href={b.bookingUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${route ?? b.title} on the provider's site`}
              className="flex size-11 items-center justify-center rounded-control text-ink-secondary hover:bg-surface-muted"
            >
              <ExternalIcon size={16} />
            </a>
          )}
          {/* keeps code plates in one column whether or not a row has a provider link */}
          {!b.bookingUrl && <span aria-hidden="true" className="hidden size-11 sm:block" />}
        </span>
      )}
    </li>
  );
}

/** "Staying · night 3 of 5 · check-out Wed, May 19 · 11:00" — for rows pinned to Today. */
function stayingLine(r: Row, today: string): string {
  const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const startDay = r.start!.slice(0, 10);
  const endLocal = r.end!;
  const until = [localDay(endLocal), localTime(endLocal)].filter(Boolean).join(' · ');
  if (r.booking.type === 'STAY') {
    const nights = Math.max(
      1,
      Math.round((day(endLocal.slice(0, 10)) - day(startDay)) / 86_400_000),
    );
    const night = Math.min(nights, Math.round((day(today) - day(startDay)) / 86_400_000) + 1);
    return `Staying · night ${night} of ${nights} · check-out ${until}`;
  }
  return `In progress · until ${until}`;
}
