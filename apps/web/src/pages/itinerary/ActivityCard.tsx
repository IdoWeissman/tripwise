import { forwardRef, useContext, type HTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { ClockIcon, PinIcon } from '../../components/Icons';
import { BOOKING_TYPES } from '../../lib/bookings';
import { formatMoney, isPast, toNumber } from '../../lib/format';
import { useTrip } from '../../lib/trip';
import { DayDateContext } from './dayDate';
import type { ItineraryActivity } from './queries';

interface ActivityCardProps extends HTMLAttributes<HTMLElement> {
  activity: ItineraryActivity;
  currency: string;
  avatarIndex: number;
  /** Drag handle or "Move to" control. */
  control?: ReactNode;
  lifted?: boolean;
}

/**
 * Activity card — design rules §2 · Itinerary board. Same density as the day's booking cards;
 * a plan that stands for a booking carries that booking instead of appearing twice.
 */
export const ActivityCard = forwardRef<HTMLElement, ActivityCardProps>(function ActivityCard(
  { activity: a, currency, avatarIndex, control, lifted = false, className = '', ...rest },
  ref,
) {
  const booked = a.booking ? BOOKING_TYPES[a.booking.type] : null;
  const { trip } = useTrip();
  const date = useContext(DayDateContext);
  // Done steps back a tone and is struck through — never colour alone (rules §1.3).
  const done = !lifted && isPast(date, a.startTime, trip.timeZone);
  return (
    <article
      ref={ref}
      className={`flex flex-col gap-1 rounded-card border bg-surface px-3 py-2.5 ${
        lifted ? '-rotate-[1.5deg] border-accent shadow-lifted' : 'border-border'
      } ${done ? 'bg-surface/60' : ''} ${className}`}
      {...rest}
    >
      <div className="flex min-h-7 items-center justify-between gap-2">
        {a.startTime ? (
          <span
            className={`flex items-center gap-1.5 text-sm font-extrabold figures ${done ? 'text-ink-muted' : 'text-accent-strong'}`}
          >
            <ClockIcon size={14} />
            {a.startTime}
          </span>
        ) : (
          <span className="text-xs text-ink-muted">Any time</span>
        )}
        {control}
      </div>
      <h3
        className={`text-sm leading-snug font-semibold text-balance ${done ? 'text-ink-muted line-through decoration-1' : ''}`}
      >
        {done && <span className="sr-only">Done: </span>}
        {a.title}
      </h3>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
          {a.location && (
            <>
              <PinIcon size={14} className="shrink-0" />
              <span className="truncate">{a.location}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span className="shrink-0 figures">
            {a.costPerPerson ? `${formatMoney(toNumber(a.costPerPerson), currency)} pp` : 'Free'}
          </span>
        </span>
        <span title={`Added by ${a.createdBy.name}`} className="shrink-0">
          <span className="sr-only">Added by {a.createdBy.name}</span>
          <span aria-hidden="true">
            <Avatar name={a.createdBy.name} index={avatarIndex} size="sm" />
          </span>
        </span>
      </div>
      {a.booking && booked && (
        <Link
          to={`../bookings/${a.booking.id}`}
          relative="path"
          className="mt-1 flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-2.5 text-xs font-semibold text-ink-secondary no-underline hover:bg-surface-muted hover:text-ink"
        >
          <span className={`rounded-chip px-1.5 py-0.5 tracking-[0.04em] ${booked.chip}`}>
            <span className="sr-only">{booked.label} </span>
            {booked.code}
          </span>
          <span className="min-w-0 truncate">
            Booked
            {a.booking.confirmationCode && (
              <>
                {' · '}
                <span className="font-mono tracking-[0.06em]">{a.booking.confirmationCode}</span>
              </>
            )}
          </span>
        </Link>
      )}
    </article>
  );
});
