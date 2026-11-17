import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { graphql } from '../gql';
import { formatDateRange } from '../lib/format';
import { messageFromError } from '../lib/errors';
import { useTrip } from '../lib/trip';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { DateInputField } from './Fields';
import { AlertIcon, CalendarIcon } from './Icons';
import { useToast } from './Toast';

const TripDatesCheckDocument = graphql(`
  query TripDatesCheck($id: ID!) {
    trip(id: $id) {
      id
      startDate
      endDate
      outsideBookings {
        id
        title
      }
      datesToFit {
        startDate
        endDate
      }
    }
  }
`);

const UpdateTripDatesDocument = graphql(`
  mutation UpdateTripDates($tripId: ID!, $startDate: Date!, $endDate: Date!) {
    updateTripDates(tripId: $tripId, startDate: $startDate, endDate: $endDate) {
      unplannedCount
      trip {
        id
        startDate
        endDate
      }
    }
  }
`);

const day = (iso: string) => iso.slice(0, 10);
const DAY_MS = 24 * 60 * 60 * 1000;
const dayCount = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;

/** Changes the trip's dates; every screen refetches what it shows. */
function useChangeDates() {
  const { trip } = useTrip();
  const toast = useToast();
  const [mutate, { loading }] = useMutation(UpdateTripDatesDocument, {
    refetchQueries: 'active',
    awaitRefetchQueries: true,
  });
  const change = async (startDate: string, endDate: string) => {
    try {
      const res = await mutate({ variables: { tripId: trip.id, startDate, endDate } });
      const moved = res.data?.updateTripDates.unplannedCount ?? 0;
      toast(
        `Trip dates are now ${formatDateRange(startDate, endDate)}.${
          moved ? ` ${moved} ${moved === 1 ? 'plan' : 'plans'} moved to Unplanned.` : ''
        }`,
      );
      return true;
    } catch (err) {
      toast(messageFromError(err, "Couldn't change the trip dates."), 'error');
      return false;
    }
  };
  return { change, loading };
}

/**
 * Bookings outside the trip's dates have no day on the itinerary (rules §2 · 03 Outside the
 * dates). This says which, and offers the dates that fit everything in one click.
 */
export function OutsideDatesNotice() {
  const { trip, canEdit } = useTrip();
  const { data } = useQuery(TripDatesCheckDocument, { variables: { id: trip.id } });
  const { change, loading } = useChangeDates();
  const [picking, setPicking] = useState(false);
  const t = data?.trip;
  if (!t || t.outsideBookings.length === 0) return null;
  const names = t.outsideBookings.map((b) => b.title);
  const fit = t.datesToFit;
  const range = formatDateRange(t.startDate, t.endDate);

  return (
    <section
      aria-label="Bookings outside the trip dates"
      className="flex flex-col gap-3 rounded-card border border-attention bg-tint-orange px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2.5 text-sm text-attention-ink">
        <AlertIcon size={20} className="mt-px shrink-0" />
        <span>
          {names.length === 1 ? (
            <>
              <strong>{names[0]}</strong> is outside the trip dates ({range}), so part of it isn’t
              on the itinerary.
            </>
          ) : (
            <>
              <strong>
                {names.length} bookings are outside the trip dates ({range})
              </strong>
              : {names.join(' · ')}. They aren’t fully on the itinerary.
            </>
          )}
        </span>
      </p>
      {canEdit && fit && (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => void change(day(fit.startDate), day(fit.endDate))}
          >
            {loading ? 'Changing…' : `Change to ${formatDateRange(fit.startDate, fit.endDate)}`}
          </Button>
          <Button variant="ghost" onClick={() => setPicking(true)}>
            Other dates
          </Button>
        </div>
      )}
      {picking && <TripDatesDialog onClose={() => setPicking(false)} />}
    </section>
  );
}

/** "Nov 21 – 24" with a calendar icon: opens the trip-dates dialog (editors). */
/** Editors: the trip's dates, opening Trip dates. `compact` (phones) shows just the calendar icon. */
export function TripDatesButton({ compact = false }: { compact?: boolean } = {}) {
  const { trip, canEdit } = useTrip();
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;
  const range = formatDateRange(trip.startDate, trip.endDate);
  return (
    <>
      <Button
        variant="secondary"
        className={compact ? 'size-11 shrink-0 px-0!' : 'px-4 text-sm'}
        onClick={() => setOpen(true)}
        aria-label={compact ? `Trip dates, ${range}: change the trip dates` : undefined}
      >
        <CalendarIcon size={16} />
        {!compact && (
          <>
            {range}
            <span className="sr-only">: change the trip dates</span>
          </>
        )}
      </Button>
      {open && <TripDatesDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function TripDatesDialog({ onClose }: { onClose: () => void }) {
  const { trip } = useTrip();
  const { data } = useQuery(TripDatesCheckDocument, { variables: { id: trip.id } });
  const { change, loading } = useChangeDates();
  const [start, setStart] = useState(day(trip.startDate));
  const [end, setEnd] = useState(day(trip.endDate));
  const fit = data?.trip?.datesToFit;
  const error =
    !start || !end
      ? 'Pick both dates.'
      : end < start
        ? 'The trip must end on or after the day it starts.'
        : dayCount(start, end) > 60
          ? 'Trips can be at most 60 days long.'
          : null;
  const shorter = !error && (start > day(trip.startDate) || end < day(trip.endDate));

  return (
    <Dialog open onClose={onClose} title="Trip dates">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!error) void change(start, end).then((ok) => ok && onClose());
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <DateInputField label="Starts" value={start} onChange={setStart} />
          <DateInputField label="Ends" value={end} onChange={setEnd} min={start} error={error} />
        </div>
        {fit && (
          <p className="text-[13px] text-ink-secondary">
            Your bookings run {formatDateRange(fit.startDate, fit.endDate)}.{' '}
            <button
              type="button"
              className="min-h-11 font-semibold text-accent-strong underline"
              onClick={() => {
                setStart(day(fit.startDate));
                setEnd(day(fit.endDate));
              }}
            >
              Use those dates
            </button>
          </p>
        )}
        {shorter && (
          <p className="text-[13px] text-ink-muted">
            Plans on days you remove move to Unplanned. Nothing is deleted.
          </p>
        )}
        <Button type="submit" disabled={loading || !!error} className="self-start">
          {loading ? 'Saving…' : 'Save dates'}
        </Button>
      </form>
    </Dialog>
  );
}
