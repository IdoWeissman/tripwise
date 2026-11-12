import { useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../components/Bits';
import { Button } from '../components/Button';
import { AlertIcon, BellIcon, ExternalIcon, PlusIcon } from '../components/Icons';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import {
  BOOKING_TYPES,
  bookingPrice,
  bookingWhen,
  dayHeading,
  FILTER_GROUPS,
  groupByDay,
} from '../lib/bookings';
import { useTrip } from '../lib/trip';
import { AddBookingDialog } from './bookings/AddBookingDialog';
import { CalendarDialog } from './bookings/CalendarDialog';
import { BookingsDocument, type BookingSummary } from './bookings/queries';

type FilterValue = (typeof FILTER_GROUPS)[number]['value'];

/** Bookings — design canvas "Bookings" / rules §2 · 08. */
export function BookingsPage() {
  const { trip, canEdit } = useTrip();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<FilterValue>('ALL');
  const { data, loading, error, refetch } = useQuery(BookingsDocument, {
    variables: { id: trip.id },
  });

  // Dialogs are addressable (?add, ?calendar) so other screens can link straight to them.
  const dialog = params.has('add') ? 'add' : params.has('calendar') ? 'calendar' : null;
  const open = (name: 'add' | 'calendar') => setParams({ [name]: '' });
  const close = () => setParams({}, { replace: true });

  const header = (
    <PageHeader
      title="Bookings"
      subtitle="Tickets, reservations and confirmations for the whole group."
      actions={
        <>
          <Button variant="secondary" onClick={() => open('calendar')}>
            <BellIcon />
            Calendar &amp; reminders
          </Button>
          {canEdit && (
            <Button onClick={() => open('add')}>
              <PlusIcon />
              Add booking
            </Button>
          )}
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
        <Skeleton className="h-10 w-full max-w-xl" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[92px]" />
        ))}
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
  const types = FILTER_GROUPS.find((g) => g.value === filter)!.types as readonly string[];
  const shown = all.filter((b) => types.includes(b.type));
  const needsDetails = all.filter((b) => b.missingFields.length > 0 && types.includes(b.type));

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

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div role="tablist" aria-label="Booking type" className="flex flex-wrap gap-2">
        {FILTER_GROUPS.map((g) => {
          const on = g.value === filter;
          const count = all.filter((b) => (g.types as readonly string[]).includes(b.type)).length;
          return (
            <button
              key={g.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(g.value)}
              className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
                on
                  ? 'border-ink bg-ink text-white'
                  : 'border-border-input bg-surface text-ink hover:bg-surface-muted'
              }`}
            >
              {g.label}
              <span className="text-xs font-bold opacity-80">{count}</span>
            </button>
          );
        })}
      </div>

      {needsDetails.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-[14px] border border-attention bg-tint-orange px-4 py-3.5"
        >
          <AlertIcon size={20} className="shrink-0 text-attention-ink" />
          <span className="min-w-0 flex-1 text-sm">
            <strong>{needsDetails[0]!.title}</strong> is missing{' '}
            {needsDetails[0]!.missingFields.join(' and ')}
            {needsDetails.length > 1 && `, and ${needsDetails.length - 1} more need details`}.
          </span>
          <Link to={needsDetails[0]!.id} className="min-h-11 content-center text-sm font-semibold">
            Add details
          </Link>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState
          title="No bookings of this type"
          body="Drop a confirmation email or PDF to add one."
        />
      ) : (
        groupByDay(shown).map((g) => (
          <section
            key={g.date ?? 'undated'}
            aria-label={g.date ?? 'Date not set'}
            className="flex flex-col gap-2.5"
          >
            <h2 className="mt-2 text-sm font-bold text-ink-secondary">
              {g.date ? dayHeading(g.date, trip.startDate, trip.endDate) : 'Date not set'}
            </h2>
            {g.items.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </section>
        ))
      )}
      {dialogs}
    </div>
  );
}

function BookingCard({ booking: b }: { booking: BookingSummary }) {
  const t = BOOKING_TYPES[b.type];
  const needs = b.missingFields.length > 0;
  const files = b.attachments.length;
  const leg = b.segments[0];
  const price = bookingPrice(b.price, b.currency);
  return (
    <article
      className={`grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-card border bg-surface px-4 py-4 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:px-[18px] ${
        needs ? 'border-attention' : 'border-border'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex size-12 items-center justify-center rounded-xl text-xs font-bold tracking-[0.04em] ${t.chip}`}
      >
        {t.code}
      </span>
      <Link to={b.id} className="flex min-w-0 flex-col gap-1 text-ink no-underline hover:text-ink">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-base font-bold">
            <span className="sr-only">{t.label}: </span>
            {b.title}
          </span>
          {(b.provider || leg?.number) && (
            <span className="text-[13px] text-ink-muted">
              {[b.provider, leg?.number].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <span
          className={`text-sm tabular-nums ${needs ? 'text-attention-ink' : 'text-ink-secondary'}`}
        >
          {bookingWhen(b)}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {b.confirmationCode && (
            <span className="rounded-chip bg-surface-muted px-2 py-1 font-mono text-xs font-bold tracking-[0.06em] text-ink-secondary">
              {b.confirmationCode}
            </span>
          )}
          {files > 0 && (
            <span className="text-xs text-ink-muted">
              {files} {files === 1 ? 'document' : 'documents'}
            </span>
          )}
          <span
            className={`rounded-chip px-2 py-1 text-xs font-semibold ${
              needs
                ? 'bg-attention text-attention-ink'
                : b.status === 'CANCELLED'
                  ? 'bg-surface-muted text-ink-secondary'
                  : 'bg-accent-tint text-accent-strong'
            }`}
          >
            {needs ? 'Needs details' : b.status === 'CANCELLED' ? 'Cancelled' : 'Confirmed'}
          </span>
        </span>
      </Link>
      <div
        className={`col-span-2 items-center justify-between gap-3 sm:col-span-1 sm:flex sm:justify-end ${price || b.bookingUrl ? 'flex' : 'hidden'}`}
      >
        {price ? (
          <span className="text-[15px] font-bold tabular-nums">{price}</span>
        ) : (
          <span className="text-sm text-ink-muted">No price</span>
        )}
        {b.bookingUrl && (
          <a
            href={b.bookingUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${b.title} on the provider's site`}
            className="flex size-11 items-center justify-center rounded-control border border-border-input text-ink-secondary hover:bg-surface-muted"
          >
            <ExternalIcon size={16} />
          </a>
        )}
      </div>
    </article>
  );
}
