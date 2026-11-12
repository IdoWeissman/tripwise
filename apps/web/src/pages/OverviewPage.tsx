import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BellIcon, CalendarIcon, CopyIcon, PinIcon, PlusIcon } from '../components/Icons';
import { ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { graphql } from '../gql';
import type { DayAgendaQuery, TripOverviewQuery } from '../gql/graphql';
import {
  BOOKING_TYPES,
  countdown,
  dayShift,
  directions,
  duration,
  leaveBy,
  localDay,
  localTime,
} from '../lib/bookings';
import { formatMoney, nowHHMM, todayIn, toNumber } from '../lib/format';
import { useTrip } from '../lib/trip';

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
  const today = todayIn(trip.timeZone);

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

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] md:text-[34px]">
          {greeting(trip.timeZone)}
          {me && `, ${me}`}
        </h1>
        <p className="text-[15px] text-ink-muted">{view ? status : trip.destination}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          to="../bookings?calendar"
          relative="path"
          className="inline-flex min-h-11 items-center gap-2 rounded-control border-[1.5px] border-border bg-surface px-5 text-[15px] font-bold text-ink no-underline hover:border-border-input hover:text-ink"
        >
          <CalendarIcon />
          Add to calendar
        </Link>
        {canEdit && (
          <Link
            to="../bookings?add"
            relative="path"
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-sign px-5 text-[15px] font-bold text-white no-underline hover:bg-sign-raised hover:text-white"
          >
            <PlusIcon />
            Add booking
          </Link>
        )}
      </div>
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
  // Phones show one reminder: leaving for the airport outranks the rest.
  const phoneReminder = t.reminders.find((r) => r.key.endsWith(':leave')) ?? t.reminders[0];
  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <DepartureBoard upNext={t.upNext} canEdit={canEdit} />
          {phoneReminder && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-card bg-signal-tint px-4 py-3 lg:hidden"
            >
              <BellIcon size={18} className="mt-0.5 shrink-0 text-signal-ink" />
              <span className="text-sm">
                <strong>{phoneReminder.title}.</strong> {phoneReminder.body}
              </span>
            </div>
          )}
          <Timetable
            loading={agendaQuery.loading && !agendaQuery.data}
            agenda={agendaQuery.data?.trip?.agenda ?? []}
            now={
              dayDate === today ? nowHHMM(trip.timeZone) : dayDate && dayDate < today ? '99:99' : ''
            }
            heading={
              dayDate === today
                ? `Today · ${localDay(today)}`
                : day
                  ? `Day ${day.position + 1} · ${localDay(dayDate)}`
                  : 'Today'
            }
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Link
            to="../expenses"
            relative="path"
            className={`flex flex-col gap-1 rounded-card px-6 py-5 text-white no-underline hover:text-white ${
              balance < 0 ? 'bg-negative-ink' : 'bg-money'
            }`}
          >
            <span className="text-[15px] font-bold">Your balance</span>
            <span className="figures text-[44px] leading-[1.1] font-extrabold tracking-[-0.02em] md:text-[48px]">
              {formatMoney(balance, trip.currency, true)}
            </span>
            <span className="text-sm text-white/90">
              {balance < 0 ? 'You owe' : balance > 0 ? 'You are owed' : 'All settled'} · Group spent{' '}
              {formatMoney(toNumber(t.expenseSummary.total), trip.currency)}
            </span>
          </Link>

          <section
            aria-label="Waiting on the group"
            className="flex flex-col rounded-card bg-surface px-5 py-2"
          >
            <Waiting
              to="../proposals"
              mark="bg-vote"
              label="Open ideas"
              note="Waiting for votes"
              count={trip.proposalCounts.proposed}
              countClass="text-vote"
            />
            <Waiting
              to="../bookings"
              mark="bg-accent"
              label="Bookings"
              note={
                trip.bookingStats.needsDetails
                  ? `${trip.bookingStats.needsDetails} ${trip.bookingStats.needsDetails === 1 ? 'needs' : 'need'} details`
                  : `${trip.bookingStats.total} confirmed`
              }
              count={trip.bookingStats.needsDetails || trip.bookingStats.total}
              countClass="text-accent-strong"
            />
          </section>

          <section
            aria-labelledby="ov-rem"
            className="hidden flex-col rounded-card bg-surface px-5 pt-3 pb-2 lg:flex"
          >
            <div className="flex items-center justify-between">
              <h2 id="ov-rem" className="flex items-center gap-2 text-base font-extrabold">
                <span aria-hidden="true" className="size-3 rounded-[3px] bg-signal" />
                Reminders
              </h2>
              <Link
                to="../bookings?calendar"
                relative="path"
                className="flex min-h-11 items-center text-sm font-bold"
              >
                Settings
              </Link>
            </div>
            {t.reminders.length === 0 ? (
              <p className="pb-3 text-sm text-ink-muted">
                Nothing coming up. Reminders appear here before flights, check-outs and shows.
              </p>
            ) : (
              t.reminders.map((r) => (
                <Link
                  key={r.key}
                  to={`../bookings/${r.booking.id}`}
                  relative="path"
                  className="flex flex-col border-t border-border py-3 text-ink no-underline first-of-type:border-t-0 hover:text-accent-strong"
                >
                  <span className="text-sm font-bold">{r.title}</span>
                  <span className="text-[13px] text-ink-muted">
                    {countdown(r.fireAt)} · {r.body}
                  </span>
                </Link>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

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
      className="flex min-h-16 items-center gap-3 border-t border-border py-3 text-ink no-underline first:border-t-0 hover:text-ink"
    >
      <span aria-hidden="true" className={`size-3 shrink-0 rounded-[3px] ${mark}`} />
      <span className="flex flex-1 flex-col">
        <span className="text-base font-extrabold">{label}</span>
        <span className="text-[13px] text-ink-muted">{note}</span>
      </span>
      <span className={`figures text-[36px] leading-none font-extrabold ${countClass}`}>
        {count}
      </span>
    </Link>
  );
}

function DepartureBoard({ upNext, canEdit }: { upNext: Overview['upNext']; canEdit: boolean }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  if (!upNext) {
    return (
      <section
        aria-labelledby="ov-next"
        className="flex flex-col items-start gap-2 rounded-card bg-sign px-6 py-5 text-white"
      >
        <h2 id="ov-next" className="text-[22px] font-extrabold">
          No departures yet
        </h2>
        <p className="text-sm text-sign-ink-soft">
          Add flights, stays and tickets to see what's next here and get reminders before each one.
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
  const { booking: b, segment: s } = upNext;
  const t = BOOKING_TYPES[b.type];
  const route = directions(b, s);
  const verb = b.type === 'FLIGHT' ? 'Departs' : b.type === 'STAY' ? 'Check-in' : 'Starts';
  const time = s ? localTime(s.departLocal) : localTime(b.startLocal);
  const flightTime = s?.arrivesAt ? duration(s.departsAt, s.arrivesAt) : null;
  const leave = b.type === 'FLIGHT' && s ? leaveBy(s.departLocal) : null;
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
          Up next · {t.label}
        </h2>
        <span className="text-signal">
          {verb} {countdown(upNext.startsAt)}
        </span>
      </div>
      <div
        key={b.id}
        className="grid origin-top motion-safe:animate-flap-in grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-4 px-5 py-5 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:px-6"
      >
        <span className="figures text-[44px] leading-none font-extrabold text-signal md:text-[56px]">
          {time ?? '—'}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[22px] leading-tight font-extrabold tracking-[-0.01em] md:truncate md:text-[26px]">
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
            <span className="flex items-center gap-1">
              <span className="rounded-chip bg-white px-3 py-2 font-mono text-lg font-extrabold tracking-[0.1em] text-sign">
                <span className="sr-only">Confirmation </span>
                {b.confirmationCode}
              </span>
              <button
                type="button"
                aria-label="Copy confirmation code"
                onClick={() => void copy()}
                className="flex size-11 items-center justify-center rounded-control text-sign-ink-soft hover:bg-white/10 hover:text-white"
              >
                <CopyIcon size={18} />
              </button>
              <span className="sr-only" aria-live="polite">
                {copied ? 'Copied' : ''}
              </span>
            </span>
          )}
          {leave && (
            <span className="flex flex-col items-end md:items-center md:pl-2">
              <span className="text-xs font-bold text-sign-ink-soft">Leave by</span>
              <span className="figures text-[26px] leading-tight font-extrabold md:text-[28px]">
                {leave}
              </span>
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/15 px-5 py-1.5 md:px-6">
        {b.attachments.length > 0 && (
          <span className="text-[13px] text-sign-ink-soft">
            {b.attachments.length} document{b.attachments.length === 1 ? '' : 's'}
          </span>
        )}
        <span className="hidden flex-1 md:block" />
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

function Timetable({
  agenda,
  heading,
  loading,
  now,
}: {
  agenda: Agenda;
  heading: string;
  loading: boolean;
  /** "HH:MM" — rows before it have departed; '' when the day is ahead. */
  now: string;
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
      ) : agenda.length === 0 ? (
        <p className="border-t border-border px-5 py-5 text-sm text-ink-muted md:px-6">
          Nothing scheduled this day yet.
        </p>
      ) : (
        <ol>
          {agenda.map((a, i) => {
            // The next departure lifts: the first timed row still ahead today.
            const isNext =
              !!now && now !== '99:99' && i === agenda.findIndex((x) => !!x.time && x.time >= now);
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
            const departed = !!now && !!a.time && a.time < now;
            // Booked = solid sign; a plan nobody has booked yet = dashed.
            const chip = type
              ? type.chip
              : 'border-[1.5px] border-dashed border-ink-muted text-ink-secondary';
            const inner = (
              <>
                <span
                  className={`figures text-[22px] font-extrabold ${departed ? 'text-ink-muted' : isNext ? 'text-accent-strong' : 'text-ink'}`}
                >
                  {a.time ?? <span className="text-xs font-bold text-ink-muted">Any time</span>}
                </span>
                <span
                  className={`flex h-7 items-center justify-center rounded-chip text-xs font-extrabold tracking-[0.06em] ${chip}`}
                >
                  <span className="sr-only">{label}: </span>
                  <span aria-hidden="true">{code}</span>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`truncate text-base font-bold ${departed ? 'text-ink-muted line-through decoration-1' : ''}`}
                    >
                      {departed && <span className="sr-only">Done: </span>}
                      {a.title}
                    </span>
                    {isNext && (
                      <span className="shrink-0 rounded-full bg-signal px-2 py-0.5 text-xs font-extrabold text-sign">
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
            const cls = `grid min-h-16 grid-cols-[64px_56px_minmax(0,1fr)] items-center gap-3 border-t border-border px-5 py-3 text-ink no-underline md:grid-cols-[88px_64px_minmax(0,1fr)] md:gap-4 md:px-6`;
            return (
              <li key={`${a.kind}-${a.booking?.id ?? a.activity?.id ?? i}`}>
                {a.booking ? (
                  <Link
                    to={`../bookings/${a.booking.id}`}
                    relative="path"
                    className={`${cls} hover:bg-bg hover:text-ink`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
