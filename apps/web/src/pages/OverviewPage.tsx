import { useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
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
  daysFrom,
  directions,
  duration,
  inDays,
  leaveBy,
  localDay,
  localTime,
  wallClock,
  reminderWhen,
  splitReminders,
  untilTime,
  type AgendaState,
} from '../lib/bookings';
import { formatMoney, nowHHMM, todayIn, toNumber } from '../lib/format';
import { useTrip } from '../lib/trip';
import { loadSnapshot, saveSnapshot } from '../lib/overviewSnapshot';
import { useNow } from '../lib/useNow';
import { SetupChecklist } from './overview/SetupChecklist';

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
      reminders(limit: 6) {
        key
        kind
        title
        body
        fireAt
        targetAt
        booking {
          id
        }
      }
      setup {
        hasBookings
        hasInvited
        hasExpenses
        hidden
      }
      expenseSummary {
        total
        viewerBalance
        viewerPaid
        expenseCount
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

function greeting(timeZone: string, nowMs: number) {
  let hour = new Date(nowMs).getHours();
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(
        new Date(nowMs),
      ),
    );
  } catch {
    /* keep the viewer's local hour */
  }
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' });
const MONTH_DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const utcDay = (date: string) => new Date(`${date}T00:00:00Z`);

/** Trip overview / Today — the station: departure board, timetable, money panel. Rules §2 · 10. */
export function OverviewPage() {
  const { trip, viewerId, canEdit, isOwner } = useTrip();
  const me = trip.members.find((m) => m.user.id === viewerId)?.user.name.split(' ')[0] ?? '';
  const nowMs = useNow();
  const today = todayIn(trip.timeZone, new Date(nowMs));

  const { data, loading, error, refetch } = useQuery(TripOverviewDocument, {
    variables: { id: trip.id },
    // Always revalidate on arrival: coming back from a setup step must show its tick.
    fetchPolicy: 'cache-and-network',
  });
  // The last overview that loaded, kept on this device: on flaky airport Wi-Fi a failed load
  // still shows the next departure and its code instead of a blank error.
  const [snapshot] = useState(() => loadSnapshot<TripOverviewQuery>(trip.id));
  useEffect(() => {
    if (data?.trip) saveSnapshot(trip.id, data);
  }, [data, trip.id]);
  const offline = !data?.trip && !!error && !!snapshot?.data.trip;
  const view = data?.trip ? data : offline ? snapshot!.data : undefined;

  const days = useMemo(() => view?.trip?.days ?? [], [view]);
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
  const dayDate = day?.date.slice(0, 10);
  // From the trip's own dates (already loaded), so the lines don't change once the page's data
  // arrives; whole calendar days in the trip's time zone, never hours from UTC midnight.
  const startDate = trip.startDate.slice(0, 10);
  const endDate = trip.endDate.slice(0, 10);
  const tripDays = daysFrom(startDate, endDate) + 1;
  const phase = today < startDate ? 'before' : today > endDate ? 'ended' : 'during';
  const hello = `${greeting(trip.timeZone, nowMs)}${me ? `, ${me}` : ''}`;
  // On trip days the headline is the day itself; the greeting steps down to the status line.
  const title =
    phase === 'during'
      ? `${WEEKDAY.format(utcDay(today))} · Day ${daysFrom(startDate, today) + 1} of ${tripDays}`
      : hello;
  const status =
    phase === 'during'
      ? `${hello} · ${MONTH_DAY.format(utcDay(today))} · ${trip.destination}`
      : phase === 'before'
        ? `Starts ${inDays(today, startDate)} · ${tripDays} days · ${trip.destination}`
        : `Trip ended · ${tripDays} days · ${trip.destination}`;

  // On phones the first screen belongs to the day: the day as the headline, one row of the two
  // actions people take mid-trip. Add to calendar lives with the reminders. Add booking steps
  // aside when the board already offers it (no departures yet) and once the trip is over.
  const header = (showAddBooking: boolean) => (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-headline-sm font-extrabold tracking-[-0.02em] md:text-headline">
          {title}
        </h1>
        <p className="text-sm text-ink-muted md:text-body">
          <bdi>{status}</bdi>
        </p>
      </div>
      {canEdit && (
        <div className="flex w-full gap-3 sm:w-auto">
          <Link
            to="../expenses?add"
            relative="path"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control bg-sign px-5 text-body font-bold text-white no-underline hover:bg-sign-raised hover:text-white sm:flex-none"
          >
            <PlusIcon />
            Add expense
          </Link>
          {showAddBooking && (
            <Link
              to="../bookings?add"
              relative="path"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control border-[1.5px] border-border bg-surface px-5 text-body font-bold text-ink no-underline hover:border-border-input hover:text-ink sm:flex-none"
            >
              <PlusIcon />
              Add booking
            </Link>
          )}
        </div>
      )}
    </div>
  );

  if (loading && !view) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        {header(phase !== 'ended')}
        <p className="sr-only" role="status">
          Loading today…
        </p>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-6">
            <div className="h-48 animate-pulse rounded-card bg-sign/80" />
            <section className="rounded-card bg-surface py-1">
              <div className="px-5 py-3 md:px-6">
                <Skeleton className="h-6 w-40" />
              </div>
              <TimetableSkeleton />
            </section>
          </div>
          <div className="flex flex-col gap-4">
            <div className="h-36 animate-pulse rounded-card bg-money/80" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }
  // Only with nothing to show at all: a failed refresh keeps the page that's here, and a failed
  // first load shows the copy saved on this device.
  if (!view?.trip) {
    return (
      <div className="flex flex-col gap-6">
        {header(phase !== 'ended')}
        <ErrorState message="We couldn't load the trip overview." onRetry={() => void refetch()} />
      </div>
    );
  }

  const t = view.trip;
  const balance = toNumber(t.expenseSummary.viewerBalance);
  const showSetup = isOwner && !t.setup.hidden;
  // The server already drops spent reminders; a page left open must too.
  const reminders = t.reminders.filter((r) => Date.parse(r.targetAt) > nowMs);

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
  const upNextDay = upNext
    ? (upNext.segment?.departLocal ?? upNext.booking.startLocal ?? '').slice(0, 10)
    : '';
  const board: BoardContent = nextToday
    ? nextToday.booking && upNext && nextToday.booking.id === upNext.booking.id
      ? { kind: 'booking', upNext, label: 'Up next', later: false }
      : { kind: 'plan', item: nextToday, until: untilTime(now, nextToday.time!) }
    : upNext
      ? {
          kind: 'booking',
          upNext,
          label: `Next booking · ${localDay(upNextDay) ?? ''}`,
          // a booking on another day doesn't get today's board: compact, no yellow, after the day
          later: upNextDay !== today,
        }
      : phase === 'ended'
        ? { kind: 'ended', balance }
        : { kind: 'none', todayDone: isToday && agenda.length > 0 };
  const boardOffersBooking = board.kind === 'none';
  const later = board.kind === 'booking' && board.later;
  const boardBookingId =
    board.kind === 'booking'
      ? board.upNext.booking.id
      : board.kind === 'plan'
        ? (board.item.booking?.id ?? null)
        : null;
  // Each booking said once: the board's own reminder folds into it; the rest are for the phone
  // strip (the soonest) and the Reminders panel (the next three).
  const split = splitReminders(reminders, boardBookingId);
  const boardReminder = split.board && {
    title: split.board.title,
    when: reminderWhen(split.board, trip.timeZone, nowMs),
  };
  const stripReminder = split.others[0];
  const panelReminders = split.others.slice(0, 3);
  // Today's plans all behind us: the timetable says what's free next instead of ending on a
  // struck-through row.
  const dayDone = isToday && agenda.length > 0 && states.every((s) => s === 'done');
  const ended = phase === 'ended';

  const setup = showSetup && (
    <SetupChecklist tripId={trip.id} setup={t.setup} started={today >= startDate} />
  );
  // Before the trip the checklist leads; once it has started the day comes first.
  const setupFirst = phase === 'before';

  const departureBoard = !(
    showSetup &&
    board.kind === 'none' &&
    !board.todayDone &&
    !t.setup.hasBookings
  ) && (
    // An empty board would only repeat the checklist's first row, so it waits.
    <DepartureBoard
      board={board}
      canEdit={canEdit}
      nowMs={nowMs}
      currency={trip.currency}
      tripDays={tripDays}
      destination={trip.destination}
      reminder={boardReminder}
    />
  );
  const timetable = ended ? (
    <Recap
      days={tripDays}
      dates={`${MONTH_DAY.format(utcDay(startDate))} – ${MONTH_DAY.format(utcDay(endDate))}`}
      bookings={trip.bookingStats.total}
      planned={trip.proposalCounts.scheduled}
      expenses={t.expenseSummary.expenseCount}
      total={formatMoney(toNumber(t.expenseSummary.total), trip.currency)}
      // what you used = what you paid − what you're owed, in whole cents (money is exact)
      share={formatMoney(
        (Math.round(toNumber(t.expenseSummary.viewerPaid) * 100) - Math.round(balance * 100)) / 100,
        trip.currency,
      )}
    />
  ) : (
    <Timetable
      loading={agendaQuery.loading && !agendaQuery.data}
      error={!!agendaQuery.error && !agendaQuery.data}
      onRetry={() => void agendaQuery.refetch()}
      agenda={agenda}
      states={states}
      heading={
        // the status line above already carries today's date
        isToday ? 'Today' : day ? `Day ${day.position + 1} · ${localDay(dayDate)}` : 'Today'
      }
      dayDone={dayDone}
      openIdeas={trip.proposalCounts.proposed}
      canEdit={canEdit}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {header(!ended && !boardOffersBooking)}
      {offline && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card bg-surface-muted px-4 py-2 md:px-5"
        >
          <p className="py-2 text-sm text-ink-secondary">
            <strong className="text-ink">Offline.</strong> Showing Today as saved on this device,{' '}
            {savedAt(snapshot!.at, trip.timeZone, today)}.
          </p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      <div
        className={`grid items-start gap-6 lg:gap-8 ${
          ended ? 'max-w-3xl' : 'lg:grid-cols-[minmax(0,1fr)_360px]'
        }`}
      >
        <div className="flex min-w-0 flex-col gap-6">
          {/* first-run checklist for the organiser; gone once hidden */}
          {setupFirst && setup}
          {/* a booking on another day waits under today's plan */}
          {later ? timetable : departureBoard}
          {stripReminder && !ended && (
            <Link
              to={`../bookings/${stripReminder.booking.id}`}
              relative="path"
              className="flex items-start gap-3 rounded-card bg-signal-tint px-4 py-3 text-ink no-underline hover:text-ink md:hidden"
            >
              <BellIcon size={18} className="mt-0.5 shrink-0 text-signal-ink" />
              <span className="text-sm" dir="auto">
                <strong>
                  {stripReminder.title} · {reminderWhen(stripReminder, trip.timeZone, nowMs)}.
                </strong>{' '}
                {stripReminder.body}
              </span>
            </Link>
          )}
          {later ? departureBoard : timetable}
          {!setupFirst && setup}
        </div>

        {/* after the trip the board and recap say it all: no balance twice, no stale panels */}
        {!ended && (
          // tablets: the side panels sit two-up under the day; desktop: a column beside it
          <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:flex lg:flex-col">
            <Link
              to="../expenses"
              relative="path"
              aria-labelledby="ov-bal"
              aria-describedby="ov-bal-amount ov-bal-note"
              className={`flex flex-col gap-1 rounded-card px-6 py-5 text-white no-underline hover:text-white ${
                balance < 0 ? 'bg-negative-ink' : 'bg-money'
              }`}
            >
              {/* one short name for the link; the figures read as its description */}
              <span id="ov-bal" className="text-body font-bold">
                Your balance
              </span>
              {/* a step under the board time at every width, so the board stays the headline */}
              <span
                id="ov-bal-amount"
                className="figures text-count leading-[1.1] font-extrabold tracking-[-0.02em] md:text-board-sm"
              >
                {formatMoney(balance, trip.currency, true)}
              </span>
              <span id="ov-bal-note" className="text-sm text-white/90">
                {balance < 0 ? 'You owe' : balance > 0 ? 'You are owed' : 'All settled'} · Group
                spent {formatMoney(toNumber(t.expenseSummary.total), trip.currency)}
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
                note={trip.proposalCounts.proposed ? 'Waiting for votes' : 'Nothing to vote on'}
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
                // no bookings yet is the board's (and the checklist's) to say, not a zero here
                trip.bookingStats.total > 0 && (
                  <Waiting
                    to="../bookings"
                    mark="bg-accent"
                    label="Bookings"
                    note="All confirmed"
                    count={trip.bookingStats.total}
                    countClass="text-accent-strong"
                  />
                )
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
              {panelReminders.length === 0 ? (
                <p className="pb-3 text-sm text-ink-muted">
                  {split.board
                    ? 'Nothing else coming up. The next departure’s reminder is on the board.'
                    : 'Nothing coming up. Reminders appear here before flights, check-outs and shows.'}
                </p>
              ) : (
                panelReminders.map((r) => (
                  <Link
                    key={r.key}
                    to={`../bookings/${r.booking.id}`}
                    relative="path"
                    className="flex flex-col border-t border-border py-3 text-ink no-underline first-of-type:border-t-0 hover:text-accent-strong"
                  >
                    <span className="text-sm font-bold" dir="auto">
                      {r.title}
                    </span>
                    <span className="text-meta text-ink-muted" dir="auto">
                      {reminderWhen(r, trip.timeZone, nowMs)} · {r.body}
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
        )}
      </div>
    </div>
  );
}

/** "at 14:32", or "Mon at 14:32" when it wasn't saved today. */
function savedAt(at: number, timeZone: string, today: string) {
  const local = wallClock(new Date(at).toISOString(), timeZone);
  const day = local.slice(0, 10);
  return day === today ? `at ${local.slice(11, 16)}` : `${localDay(day)} at ${local.slice(11, 16)}`;
}

type AgendaItem = Agenda[number];
type BoardContent =
  | {
      kind: 'booking';
      upNext: NonNullable<Overview['upNext']>;
      label: string;
      /** On another day than today: a compact board without the yellow time. */
      later: boolean;
    }
  | { kind: 'plan'; item: AgendaItem; until: string }
  | { kind: 'none'; todayDone: boolean }
  | { kind: 'ended'; balance: number };

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
        <span className="text-meta text-ink-muted">{note}</span>
      </span>
      {/* timetable size: the board's time stays the biggest figure on the screen */}
      <span className={`figures text-timetable leading-none font-extrabold ${countClass}`}>
        {count}
      </span>
    </Link>
  );
}

/** A white action on the sign: the board's own next step (yellow stays for now and next). */
const SIGN_ACTION =
  'mt-2 flex min-h-11 items-center gap-2 rounded-control bg-white px-4 text-sm font-bold text-sign no-underline hover:bg-signal-tint hover:text-sign';

function DepartureBoard({
  board,
  canEdit,
  nowMs,
  currency,
  tripDays,
  destination,
  reminder,
}: {
  board: BoardContent;
  canEdit: boolean;
  nowMs: number;
  currency: string;
  tripDays: number;
  destination: string;
  /** The board's own booking's next reminder, folded in as one line. */
  reminder?: BoardReminder;
}) {
  if (board.kind === 'ended') {
    const { balance } = board;
    const amount = formatMoney(Math.abs(balance), currency);
    return (
      <section
        aria-labelledby="ov-next"
        className="flex flex-col items-start gap-2 rounded-card bg-sign px-6 py-5 text-white"
      >
        <h2 id="ov-next" className="text-timetable font-extrabold" dir="auto">
          That was {tripDays} {tripDays === 1 ? 'day' : 'days'} in {destination.split(',')[0]}
        </h2>
        <p className="text-sm text-sign-ink-soft">
          {balance > 0
            ? `You're owed ${amount}. See who still owes you and mark payments as they come in.`
            : balance < 0
              ? `You owe ${amount}. Settle up so everyone ends the trip square.`
              : 'Your balance is settled. The plan and every booking stay here to look back on.'}
        </p>
        <Link to={balance ? '../expenses' : '../itinerary'} relative="path" className={SIGN_ACTION}>
          {balance > 0 ? 'See who owes you' : balance < 0 ? 'Settle up' : 'Open itinerary'}
        </Link>
      </section>
    );
  }
  if (board.kind === 'none') {
    return (
      <section
        aria-labelledby="ov-next"
        className="flex flex-col items-start gap-2 rounded-card bg-sign px-6 py-5 text-white"
      >
        <h2 id="ov-next" className="text-timetable font-extrabold">
          {board.todayDone ? "That's everything for today" : 'No departures yet'}
        </h2>
        <p className="text-sm text-sign-ink-soft">
          {board.todayDone
            ? 'Nothing else is planned or booked ahead. Add the next stop when you have it.'
            : "Add flights, stays and tickets to see what's next here and get reminders before each one."}
        </p>
        {canEdit && (
          <Link to="../bookings?add" relative="path" className={SIGN_ACTION}>
            <PlusIcon size={16} />
            Add a booking
          </Link>
        )}
      </section>
    );
  }
  if (board.kind === 'plan')
    return <PlanBoard item={board.item} until={board.until} reminder={reminder} />;
  return (
    <BookingBoard
      upNext={board.upNext}
      label={board.label}
      later={board.later}
      nowMs={nowMs}
      reminder={reminder}
    />
  );
}

type BoardReminder = { title: string; when: string };

/** One line on the board for its booking's next reminder ("Online check-in opens · Tomorrow · 17:40"). */
function ReminderLine({ reminder }: { reminder: BoardReminder }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-bold text-white" dir="auto">
      <BellIcon size={16} className="shrink-0 text-sign-ink-soft" />
      {reminder.title} · {reminder.when}
    </span>
  );
}

/** The board when the next thing today is a plan (or a booking without leg details). */
function PlanBoard({
  item: a,
  until,
  reminder,
}: {
  item: AgendaItem;
  until: string;
  reminder?: BoardReminder;
}) {
  const type = a.booking ? BOOKING_TYPES[a.booking.type] : null;
  return (
    <section
      aria-labelledby="ov-next"
      className="overflow-hidden rounded-card bg-sign text-white [perspective:800px]"
    >
      <div className="flex flex-wrap justify-between gap-2 border-b border-white/15 px-5 py-3 text-meta font-bold md:px-6">
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
          <span
            dir="auto"
            title={a.title}
            className="text-timetable leading-tight font-extrabold tracking-[-0.01em] md:truncate md:text-headline-sm"
          >
            {a.title}
          </span>
          {a.subtitle && (
            <span className="text-sm text-sign-ink-soft" dir="auto">
              {a.subtitle}
            </span>
          )}
          {reminder && <ReminderLine reminder={reminder} />}
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
  later,
  nowMs,
  reminder,
}: {
  upNext: NonNullable<Overview['upNext']>;
  label: string;
  later: boolean;
  nowMs: number;
  reminder?: BoardReminder;
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
  const routeTitle = s
    ? `${s.fromName ?? s.fromCode ?? ''} → ${s.toName ?? s.toCode ?? ''}`
    : b.title;
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
      <div className="flex flex-wrap justify-between gap-2 border-b border-white/15 px-5 py-3 text-meta font-bold md:px-6">
        <h2 id="ov-next" className="text-sign-ink-soft">
          {label} · {t.label}
        </h2>
        {/* yellow is for today's next; a later day's countdown stays quiet */}
        <span className={later ? 'text-sign-ink-soft' : 'text-signal'}>
          {verb} {countdown(upNext.startsAt, nowMs)}
        </span>
      </div>
      <div
        key={b.id}
        className={`grid origin-top grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-4 px-5 motion-safe:animate-flap-in md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:px-6 ${
          later ? 'py-4' : 'py-5'
        }`}
      >
        <span
          className={
            later
              ? 'figures text-timetable leading-none font-extrabold text-white md:text-headline-sm'
              : 'figures text-board-sm leading-none font-extrabold text-signal md:text-board'
          }
        >
          {time ?? '—'}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span
            dir="auto"
            title={routeTitle}
            className="text-timetable leading-tight font-extrabold tracking-[-0.01em] md:truncate md:text-headline-sm"
          >
            {routeTitle}
          </span>
          <span className="text-sm text-sign-ink-soft" dir="auto">
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
          {reminder && <ReminderLine reminder={reminder} />}
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
              {/* on another day the time carries its day, or it reads as today */}
              <span
                className={`figures leading-tight font-extrabold ${later ? 'text-timetable' : 'text-headline-sm'}`}
              >
                {later && `${localDay(s?.departLocal)?.split(',')[0] ?? ''} `}
                {leave}
              </span>
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t border-white/15 px-5 py-1.5 md:px-6">
        {b.attachments.length > 0 && (
          <span className="mr-auto text-meta text-sign-ink-soft">
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
            <span className="sr-only"> (opens in a new tab)</span>
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
            <span className="sr-only"> (opens in a new tab)</span>
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
  dayDone,
  openIdeas,
  canEdit,
}: {
  agenda: Agenda;
  states: AgendaState[];
  heading: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Today, with every plan behind us. */
  dayDone: boolean;
  openIdeas: number;
  canEdit: boolean;
}) {
  // A free day (or the rest of one) points at the group's open ideas, or at the itinerary.
  const freeAction =
    openIdeas > 0 ? (
      <Link
        to="../proposals"
        relative="path"
        className="flex min-h-11 items-center text-sm font-bold"
      >
        {openIdeas} {openIdeas === 1 ? 'idea is' : 'ideas are'} waiting for votes
      </Link>
    ) : canEdit ? (
      <Link
        to="../itinerary"
        relative="path"
        className="flex min-h-11 items-center text-sm font-bold"
      >
        Add to the itinerary
      </Link>
    ) : null;
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
        <TimetableSkeleton />
      ) : error ? (
        // Never let a failed load pass for an empty day.
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 md:px-6">
          <p className="text-sm text-negative-ink">We couldn't load this day's plan.</p>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : agenda.length === 0 ? (
        <div className="mx-5 mt-1 mb-4 flex flex-wrap items-center justify-between gap-x-4 rounded-card border-[1.5px] border-dashed border-border-input px-4 py-2 md:mx-6">
          <p className="py-2 text-sm text-ink-secondary">Nothing planned for this day yet.</p>
          {freeAction}
        </div>
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
                      title={a.title}
                      className={`min-w-0 text-base font-bold md:truncate ${done ? 'text-ink-muted line-through decoration-1' : ''}`}
                    >
                      <span className="sr-only">{sr}: </span>
                      {/* its own run, so a Hebrew title isn't set in the English label's direction */}
                      <bdi>{a.title}</bdi>
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
                    <span className="truncate text-meta text-ink-muted" dir="auto">
                      {a.subtitle}
                    </span>
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
          {dayDone && (
            <li className="flex flex-wrap items-center justify-between gap-x-4 border-t border-border px-5 py-2 md:px-6">
              <span className="py-2 text-sm text-ink-secondary">The rest of the day is free.</span>
              {freeAction}
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

/** Loading rows in the timetable's own shape: time · chip · title. */
function TimetableSkeleton() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="grid min-h-16 grid-cols-[64px_56px_minmax(0,1fr)] items-center gap-3 border-t border-border px-5 py-3 md:grid-cols-[88px_64px_minmax(0,1fr)] md:gap-4 md:px-6"
        >
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-7" />
          <span className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * After the trip, the last day's struck-through rows give way to the trip in a few lines: a
 * timetable-style panel of what the group did and what it cost.
 */
function Recap({
  days,
  dates,
  bookings,
  planned,
  expenses,
  total,
  share,
}: {
  days: number;
  dates: string;
  bookings: number;
  planned: number;
  expenses: number;
  total: string;
  share: string;
}) {
  const rows: [string, string][] = [
    ['Days', `${days} · ${dates}`],
    ['Bookings', String(bookings)],
    ['Plans on the itinerary', String(planned)],
    [
      'Group spent',
      `${total}${expenses ? ` · ${expenses} expense${expenses === 1 ? '' : 's'}` : ''}`,
    ],
    ['Your share', share],
  ];
  return (
    <section aria-labelledby="ov-recap" className="rounded-card bg-surface py-1">
      <div className="flex items-center justify-between px-5 md:px-6">
        <h2 id="ov-recap" className="text-lg font-extrabold">
          The trip
        </h2>
        <Link
          to="../itinerary"
          relative="path"
          className="flex min-h-11 items-center text-sm font-bold"
        >
          Full itinerary
        </Link>
      </div>
      <dl>
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex min-h-14 items-center justify-between gap-4 border-t border-border px-5 py-3 md:px-6"
          >
            <dt className="text-sm text-ink-secondary">{label}</dt>
            <dd className="figures text-right text-base font-extrabold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
