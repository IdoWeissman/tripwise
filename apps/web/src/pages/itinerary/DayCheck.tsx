import { Fragment } from 'react';
import { AlertIcon, CheckIcon, ChevronRightIcon } from '../../components/Icons';
import { Skeleton } from '../../components/States';
import { planSummary, planSummaryParts } from './planText';
import type { DayPlan } from './queries';

/**
 * The day's plan in one line under the day header (rules §2 · 03 Day check): stops, travel and
 * span, or how many things need a look. Opens the day plan.
 */
export function DayCheck({
  plan,
  loading,
  dayName,
  onOpen,
}: {
  plan: DayPlan | undefined;
  loading: boolean;
  dayName: string;
  onOpen: () => void;
}) {
  if (!plan) return loading ? <Skeleton className="h-11 rounded-control" /> : null;
  if (plan.stops.length === 0) return null;
  const problems = plan.issues.length;
  const summary = planSummary(plan);
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`Day plan for ${dayName}: ${problems ? `${problems} to check. ` : ''}${summary}`}
      className={`flex min-h-11 w-full items-center gap-2 rounded-control border px-3 py-1.5 text-left text-meta ${
        problems
          ? 'border-attention bg-tint-orange text-attention-ink hover:bg-attention/60'
          : 'border-border bg-surface text-ink-secondary hover:border-border-input'
      }`}
    >
      {problems ? (
        <AlertIcon size={16} className="shrink-0" />
      ) : (
        <CheckIcon size={16} className="shrink-0 text-accent-strong" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        {problems > 0 && <span className="font-bold">{problems} to check</span>}
        {/* Each part stays whole ("09:30–17:10" never breaks); parts wrap between. */}
        <span className="figures">
          {planSummaryParts(plan).map((part, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              <span className="whitespace-nowrap">{part}</span>
            </Fragment>
          ))}
        </span>
      </span>
      <ChevronRightIcon size={16} className="shrink-0" />
    </button>
  );
}
