import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useApolloClient, useQuery, useSubscription } from '@apollo/client/react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router';
import { formatDateRange } from '../lib/format';
import {
  buildMemberIndex,
  TripEventsDocument,
  TripShellDocument,
  useTripId,
  type TripContext,
} from '../lib/trip';
import { AssistantPanel, type ChatMessage } from './AssistantPanel';
import { AvatarStack, CountBadge, LiveIndicator } from './Bits';
import {
  BulbIcon,
  CalendarIcon,
  HomeIcon,
  SuitcaseIcon,
  UsersIcon,
  WalletIcon,
  SparkleIcon,
} from './Icons';
import { Logo } from './Logo';
import { EmptyState, ErrorState, Skeleton } from './States';
import { useToast } from './Toast';

const SECTIONS = [
  { to: 'overview', label: 'Overview', short: 'Today', icon: HomeIcon, mobile: true },
  { to: 'itinerary', label: 'Itinerary', short: 'Plan', icon: CalendarIcon, mobile: true },
  { to: 'bookings', label: 'Bookings', short: 'Bookings', icon: SuitcaseIcon, mobile: true },
  { to: 'proposals', label: 'Proposals', short: 'Vote', icon: BulbIcon, mobile: true },
  { to: 'expenses', label: 'Expenses', short: 'Money', icon: WalletIcon, mobile: true },
  // On phones Members moves to a header button (five tabs max).
  { to: 'members', label: 'Members', short: 'People', icon: UsersIcon, mobile: false },
] as const;

/** Shared shell for every trip screen — design rules §1.4. */
export function TripLayout() {
  const tripId = useTripId();
  const client = useApolloClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [assistantOpen, setAssistantOpen] = useState(false);
  // Kept here so closing the panel (or changing section) doesn't lose the conversation.
  const [assistantMessages, setAssistantMessages] = useState<ChatMessage[]>([]);
  const assistantButton = useRef<HTMLButtonElement>(null);
  const { data, loading, error, refetch } = useQuery(TripShellDocument, {
    variables: { id: tripId },
  });

  // Live updates: any change in this trip refetches what's on screen (debounced).
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { error: liveError } = useSubscription(TripEventsDocument, {
    variables: { tripId },
    skip: !data?.trip,
    onData: ({ data: event }) => {
      if (event.data?.tripEvents.actorId === data?.me?.id) return; // our own change is already applied
      if (event.data?.tripEvents.kind === 'TRIP_DELETED') {
        // Someone else (the owner) deleted the trip we're looking at.
        toast(`${data?.trip?.name ?? 'This trip'} was deleted by its owner.`);
        void navigate('/', { replace: true });
        void client.refetchQueries({ include: 'active' });
        return;
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void client.refetchQueries({ include: 'active' }), 150);
    },
  });

  const ctx = useMemo<TripContext | null>(() => {
    if (!data?.trip || !data.me) return null;
    return {
      trip: data.trip,
      viewerId: data.me.id,
      memberIndex: buildMemberIndex(data.trip.members),
      canEdit: data.trip.myRole !== 'VIEWER',
      isOwner: data.trip.myRole === 'OWNER',
    };
  }, [data]);

  if (loading && !data) return <ShellSkeleton />;
  // The API answers FORBIDDEN for trips that are deleted or that we're not a member of — that is
  // "not found", not "signed out". Only an UNAUTHENTICATED error (or no viewer) means sign in.
  const errorCodes = CombinedGraphQLErrors.is(error)
    ? error.errors.map((e) => e.extensions?.code)
    : [];
  const noAccess = errorCodes.includes('FORBIDDEN');
  if (errorCodes.includes('UNAUTHENTICATED') || (!error && !data?.me)) {
    return <Navigate to="/sign-in" replace />;
  }
  if (error && !noAccess) {
    return (
      <Centered>
        <ErrorState message="We couldn't load this trip." onRetry={() => void refetch()} />
      </Centered>
    );
  }
  if (!ctx || noAccess) {
    return (
      <Centered>
        <EmptyState
          title="Trip not found"
          body="It may have been deleted, or you're not a member."
          action={
            <Link to="/" className="inline-flex min-h-11 items-center font-semibold text-accent">
              Back to your trips
            </Link>
          }
        />
      </Centered>
    );
  }

  const { trip } = ctx;
  const closeAssistant = () => {
    setAssistantOpen(false);
    assistantButton.current?.focus();
  };
  const people = trip.members.map((m, index) => ({ id: m.user.id, name: m.user.name, index }));

  return (
    <div className={`min-h-screen bg-bg pb-24 md:pb-0 ${assistantOpen ? 'md:pr-[420px]' : ''}`}>
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-4 py-3 text-sm font-semibold shadow-popover focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3.5 sm:px-8">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-3 text-sm">
          <Logo />
          <span aria-hidden="true" className="hidden text-border-input sm:inline">
            /
          </span>
          <Link to="/" className="hidden text-ink-muted no-underline hover:text-ink sm:inline">
            My trips
          </Link>
          <span aria-hidden="true" className="hidden text-border-input sm:inline">
            /
          </span>
          <span className="hidden truncate font-semibold sm:inline">{trip.name}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-4">
          <button
            ref={assistantButton}
            type="button"
            aria-expanded={assistantOpen}
            aria-controls="trip-assistant"
            onClick={() => (assistantOpen ? closeAssistant() : setAssistantOpen(true))}
            className="flex min-h-11 items-center gap-2 rounded-control border border-border-input bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-muted aria-expanded:border-accent aria-expanded:text-accent-strong"
          >
            <SparkleIcon size={16} className="text-accent" />
            Ask
          </button>
          <LiveIndicator online={!liveError} />
          <div className="hidden sm:block">
            <AvatarStack people={people} />
          </div>
          {ctx.isOwner && (
            <Link
              to="members"
              className="flex min-h-11 items-center rounded-control border border-border-input bg-surface px-4 text-sm font-semibold text-ink no-underline hover:bg-surface-muted"
            >
              Invite
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] flex-wrap gap-8 px-4 py-6 sm:px-8 md:py-8">
        <aside className="hidden max-w-[260px] flex-[1_1_220px] flex-col gap-5 md:flex">
          <div className="flex flex-col gap-1 rounded-[14px] bg-accent-tint p-4">
            <span className="font-bold text-accent-deep">{trip.name}</span>
            <span className="text-[13px] text-accent-ink-soft">
              {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
            </span>
          </div>
          <nav aria-label="Trip sections" className="flex flex-col gap-1">
            {SECTIONS.map((s) => (
              <NavLink
                key={s.to}
                to={s.to}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-control border px-3 text-sm no-underline ${
                    isActive
                      ? 'border-border bg-surface font-semibold text-accent-strong'
                      : 'border-transparent font-medium text-ink-secondary hover:bg-surface-muted'
                  }`
                }
              >
                <s.icon />
                <span className="flex-1">{s.label}</span>
                {s.to === 'proposals' && <CountBadge count={trip.proposalCounts.proposed} />}
                {s.to === 'bookings' && <CountBadge count={trip.bookingStats.needsDetails} />}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Mobile: trip name above content, People as a button */}
        <div className="flex w-full items-center gap-3 md:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold">{trip.name}</p>
            <p className="text-[13px] text-ink-muted">
              {formatDateRange(trip.startDate, trip.endDate)} · {trip.members.length} members
            </p>
          </div>
          <NavLink
            to="members"
            aria-label="People on this trip"
            className={({ isActive }) =>
              `flex size-11 items-center justify-center rounded-control border ${isActive ? 'border-accent text-accent' : 'border-border-input text-ink-secondary'}`
            }
          >
            <UsersIcon size={20} />
          </NavLink>
        </div>

        <main id="main" tabIndex={-1} className="min-w-0 flex-[999_1_560px] focus:outline-none">
          <Outlet context={ctx} />
        </main>
      </div>

      {assistantOpen && (
        <div id="trip-assistant">
          <AssistantPanel
            tripId={tripId}
            currency={trip.currency}
            canEdit={ctx.canEdit}
            messages={assistantMessages}
            setMessages={setAssistantMessages}
            onClose={closeAssistant}
          />
        </div>
      )}

      {/* Mobile bottom tab bar — M1–M7 */}
      <nav
        aria-label="Trip sections"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface px-1 pt-1.5 pb-[22px] md:hidden"
      >
        {SECTIONS.filter((s) => s.mobile).map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            className={({ isActive }) =>
              `relative flex min-h-14 flex-col items-center justify-center gap-1 text-xs no-underline ${
                isActive ? 'font-semibold text-accent' : 'font-medium text-ink-muted'
              }`
            }
          >
            <s.icon size={22} />
            {s.short}
            {((s.to === 'proposals' && trip.proposalCounts.proposed > 0) ||
              (s.to === 'bookings' && trip.bookingStats.needsDetails > 0)) && (
              <span
                className="absolute top-1 right-[26%] size-2 rounded-full bg-attention-ink"
                aria-label={
                  s.to === 'proposals'
                    ? `${trip.proposalCounts.proposed} open proposals`
                    : `${trip.bookingStats.needsDetails} bookings need details`
                }
              />
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-xl px-4 py-24">{children}</main>;
}

function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-bg">
      <Skeleton className="h-[72px] rounded-none" />
      <div className="mx-auto flex max-w-[1440px] gap-8 p-8">
        <Skeleton className="hidden h-64 w-[240px] md:block" />
        <div className="flex flex-1 flex-col gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-80" />
        </div>
      </div>
    </div>
  );
}
