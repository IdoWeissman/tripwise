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
  ChevronLeftIcon,
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
  {
    to: 'overview',
    label: 'Today',
    short: 'Today',
    icon: HomeIcon,
    mark: 'bg-signal',
    mobile: true,
  },
  {
    to: 'itinerary',
    label: 'Itinerary',
    short: 'Plan',
    icon: CalendarIcon,
    mark: 'bg-rail-plan',
    mobile: true,
  },
  {
    to: 'bookings',
    label: 'Bookings',
    short: 'Bookings',
    icon: SuitcaseIcon,
    mark: 'bg-rail-book',
    mobile: true,
  },
  {
    to: 'proposals',
    label: 'Proposals',
    short: 'Vote',
    icon: BulbIcon,
    mark: 'bg-rail-vote',
    mobile: true,
  },
  {
    to: 'expenses',
    label: 'Expenses',
    short: 'Money',
    icon: WalletIcon,
    mark: 'bg-rail-money',
    mobile: true,
  },
  // On phones Members moves to a header button (five tabs max).
  {
    to: 'members',
    label: 'Members',
    short: 'People',
    icon: UsersIcon,
    mark: 'bg-white',
    mobile: false,
  },
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
  // Two Ask buttons (rail and phone header); focus returns to whichever is on screen.
  const askButtons = useRef<(HTMLButtonElement | null)[]>([]);
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
    askButtons.current.find((b) => b?.offsetParent)?.focus();
  };
  const people = trip.members.map((m, index) => ({ id: m.user.id, name: m.user.name, index }));

  const askButton = (slot: number, extra: string) => (
    <button
      ref={(el) => {
        askButtons.current[slot] = el;
      }}
      type="button"
      aria-expanded={assistantOpen}
      aria-controls="trip-assistant"
      onClick={() => (assistantOpen ? closeAssistant() : setAssistantOpen(true))}
      className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control bg-sign-raised text-sm font-bold text-white hover:bg-accent-strong/80 aria-expanded:bg-white aria-expanded:text-sign ${extra}`}
    >
      <SparkleIcon size={16} className="text-signal" />
      {/* the narrowest phones keep the icon; the name stays for screen readers */}
      <span className="max-[359px]:sr-only">Ask</span>
    </button>
  );
  const needs = (to: string) =>
    to === 'proposals'
      ? trip.proposalCounts.proposed
      : to === 'bookings'
        ? trip.bookingStats.needsDetails
        : 0;

  return (
    // Phones and tablets (< lg): blue sign header, bottom tab bar, assistant as a sheet.
    // Desktop (lg+): the blue sign rail on the left, docked assistant on the right.
    <div
      className={`min-h-screen bg-bg pb-24 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:pb-0 ${assistantOpen ? 'lg:pr-[420px]' : ''}`}
    >
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-4 py-3 text-sm font-semibold shadow-popover focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Desktop: the sign rail */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto bg-sign px-4 py-6 text-white lg:flex">
        <Logo onSign />
        <div className="flex flex-col gap-1 border-t border-white/20 pt-5">
          <span className="text-[17px] leading-snug font-bold">{trip.name}</span>
          <span className="text-[13px] text-sign-ink-soft">
            {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
          </span>
        </div>
        <nav aria-label="Trip sections" className="flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) =>
                `relative flex min-h-11 items-center gap-3 rounded-control px-3 text-[15px] no-underline hover:text-white ${
                  isActive
                    ? 'bg-sign-raised font-bold text-white'
                    : 'font-semibold text-white/85 hover:bg-white/10'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* you-are-here bar */}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute top-2 bottom-2 -left-4 w-[5px] rounded-r-[3px] bg-signal"
                    />
                  )}
                  <span aria-hidden="true" className={`size-3.5 rounded-[3px] ${s.mark}`} />
                  <span className="flex-1">{s.label}</span>
                  <CountBadge count={needs(s.to)} />
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1" />
        {askButton(0, 'w-full justify-start px-4')}
        <div className="flex flex-col gap-4 border-t border-white/20 pt-5">
          <div className="flex items-center justify-between">
            <AvatarStack people={people} ringClassName="border-sign" />
            <LiveIndicator online={!liveError} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link
              to="/"
              className="flex min-h-11 flex-1 items-center gap-1 font-semibold text-sign-ink-soft no-underline hover:text-white"
            >
              <ChevronLeftIcon size={16} />
              My trips
            </Link>
            {ctx.isOwner && (
              <Link
                to="members"
                className="flex min-h-11 items-center rounded-control border border-white/30 px-4 font-bold text-white no-underline hover:bg-white/10 hover:text-white"
              >
                Invite
              </Link>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phones and tablets: the sign header — one row at every width; the name truncates. */}
        <header className="flex items-center gap-3 bg-sign px-4 py-2.5 text-white sm:px-8 lg:hidden">
          <Logo onSign compact />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] leading-tight font-bold">{trip.name}</p>
            <p className="truncate text-[13px] text-sign-ink-soft">
              {formatDateRange(trip.startDate, trip.endDate)} · {trip.members.length}{' '}
              {trip.members.length === 1 ? 'member' : 'members'}
            </p>
          </div>
          <LiveIndicator online={!liveError} labelClassName="max-sm:sr-only" />
          {askButton(1, 'px-3 min-[360px]:px-4')}
          <NavLink
            to="members"
            aria-label="People on this trip"
            className={({ isActive }) =>
              `flex size-11 shrink-0 items-center justify-center rounded-control ${isActive ? 'bg-white text-sign' : 'bg-sign-raised text-white hover:text-white'}`
            }
          >
            <UsersIcon size={20} />
          </NavLink>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto max-w-[1200px] px-4 py-6 focus:outline-none sm:px-8 md:py-8 lg:px-10"
        >
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

      {/* Bottom tab bar on phones and tablets — the yellow bar marks where you are */}
      <nav
        aria-label="Trip sections"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface px-1 pb-[max(22px,env(safe-area-inset-bottom))] lg:hidden"
      >
        {SECTIONS.filter((s) => s.mobile).map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            className={({ isActive }) =>
              `relative flex min-h-14 flex-col items-center justify-center gap-1 pt-1.5 text-xs no-underline ${
                isActive ? 'font-bold text-sign' : 'font-medium text-ink-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-[22%] top-0 h-1 rounded-b-[3px] bg-signal"
                  />
                )}
                <s.icon size={22} />
                {s.short}
                {needs(s.to) > 0 && (
                  <span
                    className="absolute top-1.5 right-[26%] size-2.5 rounded-full border-2 border-surface bg-negative"
                    aria-label={
                      s.to === 'proposals'
                        ? `${needs(s.to)} open proposals`
                        : `${needs(s.to)} bookings need details`
                    }
                  />
                )}
              </>
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
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[248px_minmax(0,1fr)]" aria-busy="true">
      <div className="hidden h-screen bg-sign lg:block" />
      <div className="min-w-0">
        <div className="h-16 bg-sign lg:hidden" />
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-6 sm:px-8 md:py-8 lg:px-10">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-40" />
          <Skeleton className="h-80" />
        </div>
      </div>
    </div>
  );
}
