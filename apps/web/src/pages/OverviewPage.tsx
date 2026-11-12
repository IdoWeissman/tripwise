import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  CopyIcon,
  PinIcon,
  PlusIcon,
} from '../components/Icons';
import { ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { graphql } from '../gql';
import type { DayAgendaQuery, TripOverviewQuery } from '../gql/graphql';
import {
  agendaStates,
  BOOKING_TYPES,
  countdown,
  dayShift,
  directions,
  duration,
  leaveBy,
  localDay,
  localTime,
  untilTime,
  type AgendaState,
} from '../lib/bookings';
import { formatMoney, nowHHMM, todayIn, toNumber } from '../lib/format';
import { useTrip } from '../lib/trip';
import { useNow } from '../lib/useNow';

const TripOverviewDocument = graphql(`
  query TripOverview($id: ID!) {
    trip(id: $id) {
      id
      days {
        id
        date
        position
      }
      upNext {
        startsAt
        booking {
          id
          type
          title
          provider
          confirmationCode
          bookingUrl
          startLocal
          endLocal
          location
          address
          travellers
          attachments {
            id
          }
        }
        segment {
          id
          number
          fromCode
          fromName
          toCode
          toName
          departsAt
          arrivesAt
          departLocal
          arriveLocal
        }
      }
      reminders(limit: 3) {
        key
        title
        body
        fireAt
        targetAt
        booking {
          id
        }
      }
      expenseSummary {
        total
        viewerBalance
      }
    }
  }
`);

const DayAgendaDocument = graphql(`
  query DayAgenda($id: ID!, $dayId: ID!) {
    trip(id: $id) {
      id
      agenda(dayId: $dayId) {
        kind
        time
        title
        subtitle
        booking {
          id
          type
        }
        activity {
          id
        }
      }
    }
  }
`);

type Overview = NonNullable<TripOverviewQuery['trip']>;
type Agenda = NonNullable<DayAgendaQuery['trip']>['agenda'];

function greeting(timeZone: string) {
  let hour = new Date().getHours();
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(
        new Date(),
      ),
    );
  } catch {
    /* keep the viewer's local hour */
  }
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** Trip overview / Today — the station: departure board, timetable, money panel. Rules §2 · 10. */
export function OverviewPage() {
  const { trip, viewerId, canEdit } = useTrip();
  const me = trip.members.find((m) => m.user.id === viewerId)?.user.name.split(' ')[0] ?? '';
  const nowMs = useNow();
  const today = todayIn(trip.timeZone, new Date(nowMs));

  const { data, loading, error, refetch } = useQuery(TripOverviewDocument, {
    variables: { id: trip.id },
  });
  const days = useMemo(() => data?.trip?.days ?? [], [data]);
  // The day that matters: today during the trip, otherwise the first (before) or last (after) day.
  const day = useMemo(() => {
    if (!days.length) return undefined;
    return (
      days.find((x) => x.date.slice(0, 10) === today) ??
      (today < days[0]!.date.slice(0, 10) ? days[0] : days.at(-1))
    );
  }, [days, today]);
  const agendaQuery = useQuery(DayAgendaDocument, {
    variables: { id: trip.id, dayId: day?.id ?? '' },
    skip: !day,
  });
  const view = data;
  const dayDate = day?.date.slice(0, 10);
  const status =
    dayDate === today
      ? `Day ${day!.position + 1} of ${days.length} · ${localDay(today)} · ${trip.destination}`
      : days[0] && today < days[0].date.slice(0, 10)
        ? `Starts ${countdown(`${days[0].date.slice(0, 10)}T00:00:00Z`)} · ${days.length} days · ${trip.destination}`
        : `Trip ended · ${days.length} days · ${trip.destination}`;

  // On phones the first screen belongs to the day: one-line greeting, one row of the two
  // actions people take mid-trip. Add to calendar lives with the reminders.
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-headline-sm font-extrabold tracking-[-0.02em] md:text-headline">
          {greeting(trip.timeZone)}
          {me && `, ${me}`}
        </h1>
        <p className="text-sm text-ink-muted md:text-[15px]">{view ? status : trip.destination}</p>
      </div>
      {canEdit && (
        <div className="flex w-full gap-3 sm:w-auto">
          <Link
            to="../expenses?add"
            relative="path"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control bg-sign px-5 text-[15px] font-bold text-white no-underline hover:bg-sign-raised hover:text-white sm:flex-none"
          >
            <PlusIcon />
            Add expense
          </Link>
          <Link
            to="../bookings?add"
            relative="path"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control border-[1.5px] border-border bg-surface px-5 text-[15px] font-bold text-ink no-underline hover:border-border-input hover:text-ink sm:flex-none"
          >
            <PlusIcon />
            Add booking
          </Link>
        </div>
      )}
    </div>
  );

  if (loading && !view) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        {header}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-6">
            <div className="h-48 animate-pulse rounded-card bg-sign/80" />
            <Skeleton className="h-64" />
          </div>
          <div className="flex flex-col gap-4">
            <div className="h-36 animate-pulse rounded-card bg-money/80" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }
  if (error || !view?.trip) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState message="We couldn't load the trip overview." onRetry={() => void refetch()} />
      </div>
    );
  }

  const t = view.trip;
  const balance = toNumber(t.expenseSummary.viewerBalance);
  // The server already drops spent reminders; a page left open must too.
  const reminders = t.reminders.filter((r) => Date.parse(r.targetAt) > nowMs);
  // Phones show one reminder: leaving for the airport outranks the rest.
  const phoneReminder = reminders.find((r) => r.key.endsWith(':leave')) ?? reminders[0];

  // One "next" for the whole screen: the next thing today (plan or booking). When today has
  // nothing left, the board falls back to the next booking, labelled with its day.
  const agenda = agendaQuery.data?.trip?.agenda ?? [];
  const isToday = dayDate === today;
  const now = isToday
    ? nowHHMM(trip.timeZone, new Date(nowMs))
    : dayDate && dayDate < today
      ? 'past'
      : '';
  const states = agendaStates(
    agenda.map((a) => a.time),
    now,
  );
  const nextIdx = isToday ? states.indexOf('next') : -1;
  const nextToday = nextIdx >= 0 ? agenda[nextIdx]! : null;
  const upNext = t.upNext && Date.parse(t.upNext.startsAt) > nowMs ? t.upNext : null;
  const board: BoardContent = nextToday
    ? nextToday.booking && upNext && nextToday.booking.id === upNext.booking.id
      ? { kind: 'booking', upNext, label: 'Up next' }
      : { kind: 'plan', item: nextToday, until: untilTime(now, nextToday.time!) }
    : upNext
      ? {
          kind: 'booking',
          upNext,
          label: `Next booking · ${localDay(upNext.segment?.departLocal ?? upNext.booking.startLocal) ?? ''}`,
        }
      : { kind: 'none', todayDone: isToday && agenda.length > 0 };

  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <DepartureBoard board={board} canEdit={canEdit} nowMs={nowMs} />
          {phoneReminder && (
            <Link
              to={`../bookings/${phoneReminder.booking.id}`}
              relative="path"
              className="flex items-start gap-3 rounded-card bg-signal-tint px-4 py-3 text-ink no-underline hover:text-ink md:hidden"
            >
              <BellIcon size={18} className="mt-0.5 shrink-0 text-signal-ink" />
              <span className="text-sm">
                <strong>{phoneReminder.title}.</strong> {phoneReminder.body}
              </span>
            </Link>
          )}
          <Timetable
            loading={agendaQuery.loading && !agendaQuery.data}
            error={!!agendaQuery.error && !agendaQuery.data}
            onRetry={() => void agendaQuery.refetch()}
            agenda={agenda}
            states={states}
            heading={
              isToday
                ? `Today · ${localDay(today)}`
                : day
                  ? `Day ${day.position + 1} · ${localDay(dayDate)}`
                  : 'Today'
            }
          />
        </div>

        {/* tablets: the side panels sit two-up under the day; desktop: a column beside it */}
        <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:flex lg:flex-col">
          <Link
            to="../expenses"
            relative="path"
            className={`flex flex-col gap-1 rounded-card px-6 py-5 text-white no-underline hover:text-white ${
              balance < 0 ? 'bg-negative-ink' : 'bg-money'
            }`}
          >
            {/* one short name for the link; the figures read as its description */}
            <span className="text-[15px] font-bold">Your balance</span>
            <span className="figures text-board-sm leading-[1.1] font-extrabold tracking-[-0.02em] lg:text-display">
              {formatMoney(balance, trip.currency, true)}
            </span>
            <span className="text-sm text-white/90">
              {balance < 0 ? 'You owe' : balance > 0 ? 'You are owed' : 'All settled'} · Group spent{' '}
              {formatMoney(toNumber(t.expenseSummary.total), trip.currency)}
            </span>
          </Link>

          <section
            aria-labelledby="ov-wait"
            className="flex flex-col rounded-card bg-surface px-5 pt-3 pb-1"
          >
            <h2 id="ov-wait" className="text-base font-extrabold">
              Waiting on the group
            </h2>
            <Waiting
              to="../proposals"
              mark="bg-vote"
              label="Open ideas"
              note="Waiting for votes"
              count={trip.proposalCounts.proposed}
              countClass="text-vote"
            />
            {trip.bookingStats.needsDetails > 0 ? (
              <Waiting
                to="../bookings"
                mark="bg-negative"
                label="Bookings"
                note="Missing details"
                count={trip.bookingStats.needsDetails}
                countClass="text-negative-ink"
              />
            ) : (
              <Waiting
                to="../bookings"
                mark="bg-accent"
                label="Bookings"
                note="All confirmed"
                count={trip.bookingStats.total}
                countClass="text-accent-strong"
              />
            )}
          </section>

          <section
            aria-labelledby="ov-rem"
            className="hidden flex-col rounded-card bg-surface px-5 pt-3 pb-2 md:flex"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="ov-rem" className="text-base font-extrabold">
                Reminders
              </h2>
              <Link
                to="../bookings?calendar"
                relative="path"
                className="flex min-h-11 items-center gap-1.5 text-sm font-bold"
              >
                <CalendarIcon size={16} />
                Add to calendar
              </Link>
            </div>
            {reminders.length === 0 ? (
              <p className="pb-3 text-sm text-ink-muted">
                Nothing coming up. Reminders appear here before flights, check-outs and shows.
              </p>
            ) : (
              reminders.map((r) => (
                <Link
                  key={r.key}
                  to={`../bookings/${r.booking.id}`}
                  relative="path"
                  className="flex flex-col border-t border-border py-3 text-ink no-underline first-of-type:border-t-0 hover:text-accent-strong"
                >
                  <span className="text-sm font-bold">{r.title}</span>
                  <span className="text-[13px] text-ink-muted">
                    {countdown(r.fireAt, nowMs)} · {r.body}
                  </span>
                </Link>
              ))
            )}
          </section>
          {/* phones: the reminders panel is hidden, so the calendar link moves here */}
          <Link
            to="../bookings?calendar"
            relative="path"
            className="flex min-h-11 items-center justify-center gap-2 rounded-card border-[1.5px] border-border bg-surface text-sm font-bold text-ink no-underline hover:text-ink md:hidden"
          >
            <CalendarIcon size={16} />
            Calendar &amp; reminders
          </Link>
        </div>
      </div>
    </div>
  );
}

type AgendaItem = Agenda[number];
type BoardContent =
  | { kind: 'booking'; upNext: NonNullable<Overview['upNext']>; label: string }
  | { kind: 'plan'; item: AgendaItem; until: string }
  | { kind: 'none'; todayDone: boolean };

function Waiting({
  to,
  mark,
  label,
  note,
  count,
  countClass,
}: {
  to: string;
  mark: string;
  label: string;
  note: string;
  count: number;
  countClass: string;
}) {
  return (
    <Link
      to={to}
      relative="path"
      className="flex min-h-16 items-center gap-3 border-t border-border py-3 text-ink no-underline first-of-type:border-t-0 hover:text-ink"
    >
      <span aria-hidden="true" className={`size-3 shrink-0 rounded-[3px] ${mark}`} />
      <span className="flex flex-1 flex-col">
        <span className="text-base font-extrabold">{label}</span>
        <span className="text-[13px] text-ink-muted">{note}</span>
      </span>
      <span className={`figures text-count leading-none font-extrabold ${countClass}`}>
        {count}
      </span>
    </Link>
  );
}

function DepartureBoard({
  board,
  canEdit,
  nowMs,
}: {
  board: BoardContent;
  canEdit: boolean;
  nowMs: number;
}) {
  if (board.kind === 'none') {
    return (
      <section
        aria-labelledby="ov-next"
        className="flex flex-col items-start gap-2 rounded-card bg-sign px-6 py-5 text-white"
      >
        <h2 id="ov-next" className="text-[22px] font-extrabold">
          {board.todayDone ? "That's everything for today" : 'No departures yet'}
        </h2>
        <p className="text-sm text-sign-ink-soft">
          {board.todayDone
            ? 'Nothing else is planned or booked ahead. Add the next stop when you have it.'
            : "Add flights, stays and tickets to see what's next here and get reminders before each one."}
        </p>
        {canEdit && (
          <Link
            to="../bookings?add"
            relative="path"
            className="mt-2 flex min-h-11 items-center gap-2 rounded-control bg-signal px-4 text-sm font-bold text-sign no-underline hover:text-sign"
          >
            <PlusIcon size={16} />
            Add a booking
          </Link>
        )}
      </section>
    );
  }
  if (board.kind === 'plan') return <PlanBoard item={board.item} until={board.until} />;
  return <BookingBoard upNext={board.upNext} label={board.label} nowMs={nowMs} />;
}

/** The board when the next thing today is a plan (or a booking without leg details). */
function PlanBoard({ item: a, until }: { item: AgendaItem; until: string }) {
  const type = a.booking ? BOOKING_TYPES[a.booking.type] : null;
  return (
    <section
      aria-labelledby="ov-next"
      className="overflow-hidden rounded-card bg-sign text-white [perspective:800px]"
    >
      <div className="flex flex-wrap justify-between gap-2 border-b border-white/15 px-5 py-3 text-[13px] font-bold md:px-6">
        <h2 id="ov-next" className="text-sign-ink-soft">
          Up next · {type?.label ?? 'Plan'}
        </h2>
        <span className="text-signal">Starts {until}</span>
      </div>
      <div
        key={`${a.kind}-${a.booking?.id ?? a.activity?.id ?? a.title}`}
        className="grid origin-top grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 px-5 py-5 motion-safe:animate-flap-in md:px-6"
      >
        <span className="figures text-board-sm leading-none font-extrabold text-signal md:text-board">
          {a.time}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[22px] leading-tight font-extrabold tracking-[-0.01em] md:truncate md:text-headline-sm">
            {a.title}
          </span>
          {a.subtitle && <span className="text-sm text-sign-ink-soft">{a.subtitle}</span>}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-4 border-t border-white/15 px-5 py-1.5 md:px-6">
        <Link
          to={a.booking ? `../bookings/${a.booking.id}` : '../itinerary'}
          relative="path"
          className="flex min-h-11 items-center text-sm font-bold text-white hover:text-signal"
        >
          {a.booking ? 'Details' : 'Open itinerary'}
        </Link>
      </div>
    </section>
  );
}

function BookingBoard({
  upNext,
  label,
  nowMs,
}: {
  upNext: NonNullable<Overview['upNext']>;
  label: string;
  nowMs: number;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const { booking: b, segment: s } = upNext;
  const t = BOOKING_TYPES[b.type];
  const route = directions(b, s);
  const verb = b.type === 'FLIGHT' ? 'Departs' : b.type === 'STAY' ? 'Check-in' : 'Starts';
  const time = s ? localTime(s.departLocal) : localTime(b.startLocal);
  const flightTime = s?.arrivesAt ? duration(s.departsAt, s.arrivesAt) : null;
  // Leave by goes once it has passed: a missed time is not an instruction.
  const leaveStillAhead = s ? Date.parse(s.departsAt) - LEAVE_BEFORE_MS > nowMs : false;
  const leave = b.type === 'FLIGHT' && s && leaveStillAhead ? leaveBy(s.departLocal) : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(b.confirmationCode ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Copy failed — select the code and copy it manually.', 'error');
    }
  };
  return (
    <section
      aria-labelledby="ov-next"
      className="overflow-hidden rounded-card bg-sign text-white [perspective:800px]"
    >
      <div className="flex flex-wrap justify-between gap-2 border-b border-white/15 px-5 py-3 text-[13px] font-bold md:px-6">
        <h2 id="ov-next" className="text-sign-ink-soft">
          {label} · {t.label}
        </h2>
        <span className="text-signal">
          {verb} {countdown(upNext.startsAt, nowMs)}
        </span>
      </div>
      <div
        key={b.id}
        className="grid origin-top grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-4 px-5 py-5 motion-safe:animate-flap-in md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:px-6"
      >
        <span className="figures text-board-sm leading-none font-extrabold text-signal md:text-board">
          {time ?? '—'}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[22px] leading-tight font-extrabold tracking-[-0.01em] md:truncate md:text-headline-sm">
            {s ? `${s.fromName ?? s.fromCode ?? ''} → ${s.toName ?? s.toCode ?? ''}` : b.title}
          </span>
          <span className="text-sm text-sign-ink-soft">
            {(s
              ? [
                  [s.number, b.provider].filter(Boolean).join(' · '),
                  s.arriveLocal &&
                    `arrives ${localTime(s.arriveLocal)}${dayShift(s.departLocal, s.arriveLocal)}`,
                  flightTime,
                ]
              : [localDay(b.startLocal), b.location ?? b.provider]
            )
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="col-span-2 flex items-center justify-between gap-4 md:contents">
          {b.confirmationCode && (
            <button
              type="button"
              aria-label={`Copy confirmation code ${b.confirmationCode}`}
              onClick={() => void copy()}
              className="flex min-h-11 items-center gap-2 rounded-chip bg-white px-3 font-mono text-lg font-extrabold tracking-[0.1em] text-sign hover:bg-signal-tint"
            >
              {b.confirmationCode}
              {copied ? (
                <span className="flex items-center gap-1 font-sans text-xs font-extrabold tracking-normal text-money">
                  <CheckIcon size={16} />
                  Copied
                </span>
              ) : (
                <CopyIcon size={16} className="text-ink-muted" />
              )}
            </button>
          )}
          <span className="sr-only" aria-live="polite">
            {copied ? 'Copied' : ''}
          </span>
          {leave && (
            <span className="flex flex-col items-end md:items-center md:pl-2">
              <span className="text-xs font-bold text-sign-ink-soft">Leave by</span>
              <span className="figures text-headline-sm leading-tight font-extrabold">{leave}</span>
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t border-white/15 px-5 py-1.5 md:px-6">
        {b.attachments.length > 0 && (
          <span className="mr-auto text-[13px] text-sign-ink-soft">
            {b.attachments.length} document{b.attachments.length === 1 ? '' : 's'}
          </span>
        )}
        <Link
          to={`../bookings/${b.id}`}
          relative="path"
          className="flex min-h-11 items-center text-sm font-bold text-white hover:text-signal"
        >
          Details
        </Link>
        {route && (
          <a
            href={route.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center gap-1.5 text-sm font-bold text-white hover:text-signal"
          >
            <PinIcon size={16} />
            <span className="max-sm:hidden">{route.label}</span>
            <span className="sm:hidden">Directions</span>
          </a>
        )}
        {b.bookingUrl && (
          <a
            href={b.bookingUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center text-sm font-bold text-white hover:text-signal"
          >
            Manage<span className="max-sm:sr-only">&nbsp;booking</span>
          </a>
        )}
      </div>
    </section>
  );
}

/** The server's "leave for the airport" rule: 2 h 30 min before departure. */
const LEAVE_BEFORE_MS = 150 * 60_000;

const STATE_SR: Record<AgendaState, string> = {
  done: 'Done',
  now: 'Happening now',
  next: 'Next',
  ahead: '',
  untimed: '',
};

function Timetable({
  agenda,
  states,
  heading,
  loading,
  error,
  onRetry,
}: {
  agenda: Agenda;
  states: AgendaState[];
  heading: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="ov-today" className="rounded-card bg-surface py-1">
      <div className="flex items-center justify-between px-5 md:px-6">
        <h2 id="ov-today" className="text-lg font-extrabold">
          {heading}
        </h2>
        <Link
          to="../itinerary"
          relative="path"
          className="flex min-h-11 items-center text-sm font-bold"
        >
          Full itinerary
        </Link>
      </div>
      {loading ? (
        <div className="px-5 pb-4 md:px-6">
          <Skeleton className="h-48" />
        </div>
      ) : error ? (
        // Never let a failed load pass for an empty day.
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 md:px-6">
          <p className="text-sm text-negative-ink">We couldn't load this day's plan.</p>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : agenda.length === 0 ? (
        <p className="border-t border-border px-5 py-5 text-sm text-ink-muted md:px-6">
          Nothing scheduled this day yet.
        </p>
      ) : (
        <ol>
          {agenda.map((a, i) => {
            const state = states[i] ?? 'untimed';
            const type = a.booking ? BOOKING_TYPES[a.booking.type] : null;
            const code =
              a.kind === 'CHECK_IN'
                ? 'IN'
                : a.kind === 'CHECK_OUT'
                  ? 'OUT'
                  : (type?.code ?? 'PLAN');
            const label =
              a.kind === 'CHECK_IN'
                ? 'Check-in'
                : a.kind === 'CHECK_OUT'
                  ? 'Check-out'
                  : (type?.label ?? 'Plan, not booked');
            const done = state === 'done';
            // Booked = solid chip; a plan nobody has booked yet = dashed.
            const chip = done
              ? 'bg-surface-muted text-ink-muted'
              : type
                ? type.chip
                : 'border-[1.5px] border-dashed border-ink-muted text-ink-secondary';
            const sr = [STATE_SR[state], a.time ?? 'Any time', label].filter(Boolean).join(', ');
            const inner = (
              <>
                <span
                  aria-hidden="true"
                  className={`figures text-timetable font-extrabold ${
                    done ? 'text-ink-muted' : state === 'next' ? 'text-accent-strong' : 'text-ink'
                  }`}
                >
                  {a.time ?? <span className="text-xs font-bold text-ink-muted">Any time</span>}
                </span>
                <span
                  aria-hidden="true"
                  className={`flex h-7 items-center justify-center rounded-chip text-xs font-extrabold tracking-[0.06em] ${chip}`}
                >
                  {code}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex-nowrap">
                    <span
                      className={`min-w-0 text-base md:truncate font-bold ${done ? 'text-ink-muted line-through decoration-1' : ''}`}
                    >
                      <span className="sr-only">{sr}: </span>
                      {a.title}
                    </span>
                    {state === 'now' && (
                      <span
                        aria-hidden="true"
                        className="shrink-0 rounded-full bg-signal px-2 py-0.5 text-xs font-extrabold text-sign"
                      >
                        Now
                      </span>
                    )}
                    {state === 'next' && (
                      <span
                        aria-hidden="true"
                        className="shrink-0 rounded-full border-[1.5px] border-sign px-2 py-px text-xs font-extrabold text-sign"
                      >
                        Next
                      </span>
                    )}
                  </span>
                  {a.subtitle && (
                    <span className="truncate text-[13px] text-ink-muted">{a.subtitle}</span>
                  )}
                </span>
              </>
            );
            const cls = `grid min-h-16 grid-cols-[64px_56px_minmax(0,1fr)] items-center gap-3 border-t border-border px-5 py-3 text-ink no-underline hover:bg-bg hover:text-ink md:grid-cols-[88px_64px_minmax(0,1fr)] md:gap-4 md:px-6 ${
              state === 'now' ? 'bg-signal-tint/60' : ''
            }`;
            return (
              <li key={`${a.kind}-${a.booking?.id ?? a.activity?.id ?? i}`}>
                {/* bookings open their detail; plans open the itinerary */}
                <Link
                  to={a.booking ? `../bookings/${a.booking.id}` : '../itinerary'}
                  relative="path"
                  className={cls}
                >
                  {inner}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
