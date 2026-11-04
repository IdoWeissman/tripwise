import { useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { AvatarStack } from '../components/Bits';
import { Button } from '../components/Button';
import { PlusIcon } from '../components/Icons';
import { Segmented } from '../components/Segmented';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { graphql } from '../gql';
import { daysUntil, formatDateRange } from '../lib/format';
import { CreateTripDialog } from './CreateTripDialog';

const TripsQuery = graphql(`
  query Trips {
    trips {
      id
      name
      destination
      startDate
      endDate
      proposalCounts {
        proposed
        scheduled
      }
      members {
        user {
          id
          name
        }
      }
    }
  }
`);

const TINTS = [
  'bg-accent-tint text-accent-strong',
  'bg-tint-blue text-member-blue-ink',
  'bg-tint-orange text-member-orange-ink',
];

type Filter = 'upcoming' | 'past';

function status(start: string, end: string) {
  const toStart = daysUntil(start);
  const toEnd = daysUntil(end);
  if (toEnd < 0) return { label: 'Past', countdown: '' };
  if (toStart <= 0) return { label: 'Happening now', countdown: '' };
  return { label: 'Upcoming', countdown: toStart === 1 ? 'tomorrow' : `in ${toStart} days` };
}

export function TripsPage() {
  const { data, loading, error, refetch } = useQuery(TripsQuery);
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [creating, setCreating] = useState(false);
  /** Skeletons only before the first response — refetches update silently. */
  const initialLoading = loading && !data;
  const all = data?.trips ?? [];
  const trips = all.filter((t) => daysUntil(t.endDate) < 0 === (filter === 'past'));
  const upcoming = all.filter((t) => daysUntil(t.endDate) >= 0).length;

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-10 px-4 pt-12 pb-16 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] font-bold tracking-[-0.02em]">Your trips</h1>
          {!initialLoading && (
            <p className="text-[15px] text-ink-muted">
              {upcoming} upcoming · {all.length - upcoming} past
            </p>
          )}
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          New trip
        </Button>
      </div>

      <Segmented
        label="Trip filter"
        value={filter}
        onChange={setFilter}
        className="self-start"
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
      />

      {error && (
        <ErrorState message="We couldn't load your trips." onRetry={() => void refetch()} />
      )}

      <section
        aria-label="Trips"
        className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6"
      >
        {initialLoading &&
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[280px]" />)}

        {trips.map((trip, i) => {
          const s = status(trip.startDate, trip.endDate);
          return (
            <Link
              key={trip.id}
              to={`/trips/${trip.id}`}
              className="flex flex-col overflow-hidden rounded-card border border-border bg-surface text-ink no-underline hover:border-border-input"
            >
              <div
                className={`flex h-[132px] items-start justify-between p-4 ${TINTS[i % TINTS.length]}`}
              >
                <span className="rounded-full bg-surface px-3 py-1.5 text-[13px] font-semibold">
                  {s.label}
                </span>
                {s.countdown && <span className="text-[13px] font-semibold">{s.countdown}</span>}
              </div>
              <div className="flex flex-col gap-3.5 p-5">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold">{trip.name}</span>
                  <span className="text-sm text-ink-muted">
                    {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <AvatarStack
                    people={trip.members.map((m, index) => ({
                      id: m.user.id,
                      name: m.user.name,
                      index,
                    }))}
                    max={4}
                  />
                  <span className="text-[13px] text-ink-muted">
                    {trip.proposalCounts.scheduled} activities · {trip.proposalCounts.proposed} open
                    votes
                  </span>
                </div>
              </div>
            </Link>
          );
        })}

        {!initialLoading && filter === 'upcoming' && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-[280px] flex-col items-center justify-center gap-2.5 rounded-card border-[1.5px] border-dashed border-border-input text-[15px] font-semibold text-ink-secondary hover:bg-surface"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-surface-muted">
              <PlusIcon size={20} />
            </span>
            Plan a new trip
          </button>
        )}
      </section>

      {!initialLoading && !error && filter === 'past' && trips.length === 0 && (
        <EmptyState title="No past trips yet" body="Trips move here after their last day." />
      )}

      {creating && <CreateTripDialog onClose={() => setCreating(false)} />}
    </main>
  );
}
