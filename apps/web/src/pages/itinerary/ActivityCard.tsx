import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { ClockIcon, PinIcon } from '../../components/Icons';
import { formatMoney, toNumber } from '../../lib/format';
import type { ItineraryActivity } from './queries';

interface ActivityCardProps extends HTMLAttributes<HTMLElement> {
  activity: ItineraryActivity;
  currency: string;
  avatarIndex: number;
  /** Drag handle or "Move to" control. */
  control?: ReactNode;
  lifted?: boolean;
}

/** Activity card — design rules §2 · Itinerary board. */
export const ActivityCard = forwardRef<HTMLElement, ActivityCardProps>(function ActivityCard(
  { activity: a, currency, avatarIndex, control, lifted = false, className = '', ...rest },
  ref,
) {
  return (
    <article
      ref={ref}
      className={`flex flex-col gap-2.5 rounded-xl border bg-surface p-3.5 ${
        lifted
          ? '-rotate-[1.5deg] border-accent shadow-lifted'
          : 'border-border'
      } ${className}`}
      {...rest}
    >
      <div className="flex min-h-7 items-center justify-between gap-2">
        {a.startTime ? (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-accent-strong">
            <ClockIcon size={14} />
            {a.startTime}
          </span>
        ) : (
          <span className="text-[13px] text-ink-muted">Any time</span>
        )}
        {control}
      </div>
      <h3 className="text-[15px] leading-snug font-semibold">{a.title}</h3>
      {a.location && (
        <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
          <PinIcon size={14} />
          {a.location}
        </span>
      )}
      <div className="flex items-center justify-between">
        <span className="rounded-chip bg-surface-muted px-2 py-1 text-xs font-semibold text-ink-secondary tabular-nums">
          {a.costPerPerson ? `${formatMoney(toNumber(a.costPerPerson), currency)} pp` : 'Free'}
        </span>
        <span title={`Added by ${a.createdBy.name}`}>
          <Avatar name={a.createdBy.name} index={avatarIndex} size="sm" />
        </span>
      </div>
    </article>
  );
});
