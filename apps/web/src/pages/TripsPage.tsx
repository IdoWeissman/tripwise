import { useQuery } from '@apollo/client/react';
import { Link } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { graphql } from '../gql';
import { formatDateRange } from '../lib/format';

const TripsQuery = graphql(`
  query Trips {
    trips {
      id
      name
      destination
      startDate
      endDate
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
  'bg-[#eef1fc] text-member-blue-ink',
  'bg-[#fdf1e6] text-member-orange-ink',
];

export function TripsPage() {
  const { data, loading, error, refetch } = useQuery(TripsQuery);
  const trips = data?.trips ?? [];

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-10 px-4 pt-12 pb-16 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] font-bold tracking-[-0.02em]">Your trips</h1>
          {!loading && <p className="text-[15px] text-ink-muted">{trips.length} trips</p>}
        </div>
        <Button>New trip</Button>
      </div>

      {error && (
        <ErrorState message="We couldn't load your trips." onRetry={() => void refetch()} />
      )}

      <section
        aria-label="Trips"
        className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6"
      >
        {loading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[280px]" />)}

        {trips.map((trip, i) => (
          <Link
            key={trip.id}
            to={`/trips/${trip.id}`}
            className="flex flex-col overflow-hidden rounded-card border border-border bg-surface text-ink no-underline"
          >
            <div className={`flex h-[132px] items-start p-4 ${TINTS[i % TINTS.length]}`}>
              <span className="rounded-full bg-surface px-3 py-1.5 text-[13px] font-semibold">
                {trip.destination}
              </span>
            </div>
            <div className="flex flex-col gap-3.5 p-5">
              <div className="flex flex-col gap-1">
                <span className="text-lg font-bold">{trip.name}</span>
                <span className="text-sm text-ink-muted">
                  {formatDateRange(trip.startDate, trip.endDate)}
                </span>
              </div>
              <div className="flex">
                {trip.members.map((m, idx) => (
                  <Avatar key={m.user.id} name={m.user.name} index={idx} stacked />
                ))}
              </div>
            </div>
          </Link>
        ))}

        {!loading && (
          <button
            type="button"
            className="flex min-h-[280px] flex-col items-center justify-center gap-2.5 rounded-card border-[1.5px] border-dashed border-border-input text-[15px] font-semibold text-ink-secondary"
          >
            Plan a new trip
          </button>
        )}
      </section>

      {!loading && !error && trips.length === 0 && (
        <EmptyState
          title="No trips yet"
          body="Create a trip and invite your friends to start planning."
        />
      )}
    </main>
  );
}
