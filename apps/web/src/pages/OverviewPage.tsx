import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import { BellIcon, CopyIcon, PlusIcon } from '../components/Icons';
import { ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { graphql } from '../gql';
import type { DayAgendaQuery, TripOverviewQuery } from '../gql/graphql';
import { BOOKING_TYPES, countdown, dayShift, duration, localDay, localTime } from '../lib/bookings';
import { formatMoney, toNumber } from '../lib/format';
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

/** "YYYY-MM-DD" for now in the destination's time zone. */
function todayIn(timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

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

/** Trip overview / Today — design canvas "Trip overview" and M-Today / rules §2 · 10. */
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
      ? `Day ${day!.position + 1} of ${days.length} · ${localDay(today)}`
      : days[0] && today < days[0].date.slice(0, 10)
        ? `Starts ${countdown(`${days[0].date.slice(0, 10)}T00:00:00Z`)} · ${days.length} days`
        : `Trip ended · ${days.length} days`;

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] md:text-[28px]">
          {greeting(trip.timeZone)}
          {me && `, ${me}`}
        </h1>
        <p className="text-sm text-ink-muted">{view ? status : trip.destination}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          to="../bookings?calendar"
          relative="path"
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-input bg-surface px-5 text-[15px] font-semibold text-ink no-underline hover:bg-surface-muted hover:text-ink"
        >
          <BellIcon />
          Add to calendar
        </Link>
        {canEdit && (
          <Link
            to="../bookings?add"
            relative="path"
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-accent px-5 text-[15px] font-semibold text-white no-underline hover:bg-accent-hover hover:text-white"
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
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-[2_1_420px] flex-col gap-4">
            <Skeleton className="h-56" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-72 flex-[1_1_280px]" />
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
  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[2_1_420px] flex-col gap-5">
          <UpNextCard upNext={t.upNext} canEdit={canEdit} />
          {t.reminders[0] && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-[14px] bg-tint-blue px-3.5 py-3 md:hidden"
            >
              <BellIcon size={18} className="mt-0.5 shrink-0 text-member-blue-ink" />
              <span className="text-sm">
                <strong>{t.reminders[0].title}.</strong> {t.reminders[0].body}
              </span>
            </div>
          )}
          <TodayList
            loading={agendaQuery.loading && !agendaQuery.data}
            agenda={agendaQuery.data?.trip?.agenda ?? []}
            heading={
              dayDate === today
                ? 'Today'
                : day
                  ? `Day ${day.position + 1} · ${localDay(dayDate)}`
                  : 'Today'
            }
          />
        </div>

        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-5">
          <section
            aria-labelledby="ov-rem"
            className="hidden flex-col gap-1 rounded-card border border-border bg-surface p-5 md:flex"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <h2 id="ov-rem" className="text-[17px] font-bold">
                Reminders
              </h2>
              <Link
                to="../bookings?calendar"
                relative="path"
                className="flex min-h-11 items-center text-sm font-semibold"
              >
                Settings
              </Link>
            </div>
            {t.reminders.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Nothing coming up. Reminders appear here before flights, check-outs and shows.
              </p>
            ) : (
              t.reminders.map((r) => (
                <Link
                  key={r.key}
                  to={`../bookings/${r.booking.id}`}
                  relative="path"
                  className="flex items-start gap-3 border-t border-surface-muted py-3 text-ink no-underline first-of-type:border-t-0 hover:text-ink"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-member-blue-ink"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{r.title}</span>
                    <span className="text-xs text-ink-muted">
                      {countdown(r.fireAt)} · {r.body}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </section>

          <section aria-label="Trip at a glance" className="grid grid-cols-2 gap-3">
            <Glance
              to="../bookings"
              k="Bookings"
              v={String(trip.bookingStats.total)}
              note={
                trip.bookingStats.needsDetails
                  ? `${trip.bookingStats.needsDetails} need details`
                  : 'All confirmed'
              }
              warn={trip.bookingStats.needsDetails > 0}
            />
            <Glance
              to="../proposals"
              k="Open ideas"
              v={String(trip.proposalCounts.proposed)}
              note="Waiting for votes"
            />
            <Glance
              to="../expenses"
              k="Spent"
              v={formatMoney(toNumber(t.expenseSummary.total), trip.currency)}
              note="Group total"
            />
            <Glance
              to="../expenses"
              k="Your balance"
              v={formatMoney(toNumber(t.expenseSummary.viewerBalance), trip.currency, true)}
              note={
                toNumber(t.expenseSummary.viewerBalance) < 0
                  ? 'You owe'
                  : toNumber(t.expenseSummary.viewerBalance) > 0
                    ? 'You are owed'
                    : 'Settled'
              }
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function Glance({
  to,
  k,
  v,
  note,
  warn,
}: {
  to: string;
  k: string;
  v: string;
  note: string;
  warn?: boolean;
}) {
  return (
    <Link
      to={to}
      relative="path"
      className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4 text-ink no-underline hover:bg-surface-muted hover:text-ink"
    >
      <span className="text-xs font-semibold text-ink-muted">{k}</span>
      <span className="text-xl font-bold tabular-nums">{v}</span>
      <span className={`text-xs ${warn ? 'font-semibold text-attention-ink' : 'text-ink-muted'}`}>
        {note}
      </span>
    </Link>
  );
}

function UpNextCard({ upNext, canEdit }: { upNext: Overview['upNext']; canEdit: boolean }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  if (!upNext) {
    return (
      <section
        aria-label="Up next"
        className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border-input bg-surface p-5"
      >
        <span className="text-xs font-bold tracking-[0.04em] text-ink-muted uppercase">
          Up next
        </span>
        <p className="text-sm text-ink-secondary">
          Nothing booked ahead yet. Add flights, stays and tickets to see what's next and get
          reminders.
        </p>
        {canEdit && (
          <Link
            to="../bookings?add"
            relative="path"
            className="flex min-h-11 items-center gap-2 text-sm font-semibold"
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
  const verb = b.type === 'FLIGHT' ? 'Departs' : b.type === 'STAY' ? 'Check-in' : 'Starts';
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
      aria-label="Up next"
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      <div
        className={`flex flex-wrap justify-between gap-2 px-5 py-2.5 text-xs font-bold ${t.tint}`}
      >
        <span className="tracking-[0.04em] uppercase">Up next · {t.label}</span>
        <span>
          {verb} {countdown(upNext.startsAt)}
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        {s ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-[28px] font-bold tabular-nums">{localTime(s.departLocal)}</span>
              <span className="truncate text-sm font-semibold">
                {[s.fromCode, s.fromName].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="text-center text-[11px] font-semibold text-ink-muted">
              {s.arrivesAt ? duration(s.departsAt, s.arrivesAt) : s.number}
            </span>
            <span className="flex min-w-0 flex-col text-right">
              <span className="text-[28px] font-bold tabular-nums">
                {localTime(s.arriveLocal) ?? '—'}
                <span className="text-base">{dayShift(s.departLocal, s.arriveLocal)}</span>
              </span>
              <span className="truncate text-sm font-semibold">
                {[s.toCode, s.toName].filter(Boolean).join(' · ')}
              </span>
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-xl font-bold">{b.title}</span>
            <span className="text-sm text-ink-secondary">
              {[localDay(b.startLocal), localTime(b.startLocal), b.location]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-surface-muted pt-4">
          {b.confirmationCode && (
            <span className="flex items-center gap-1">
              <span className="text-xs text-ink-muted">Confirmation</span>
              <span className="ml-1 font-mono text-[15px] font-bold tracking-[0.08em]">
                {b.confirmationCode}
              </span>
              <button
                type="button"
                aria-label="Copy confirmation code"
                onClick={() => void copy()}
                className="flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted"
              >
                <CopyIcon size={16} />
              </button>
              <span className="sr-only" aria-live="polite">
                {copied ? 'Copied' : ''}
              </span>
            </span>
          )}
          <span className="text-xs text-ink-muted">
            {[
              s?.number ?? b.provider,
              b.attachments.length
                ? `${b.attachments.length} document${b.attachments.length === 1 ? '' : 's'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="flex-1" />
          <Link
            to={`../bookings/${b.id}`}
            relative="path"
            className="flex min-h-11 items-center text-sm font-semibold"
          >
            Details
          </Link>
          {b.bookingUrl && (
            <Button
              variant="secondary"
              onClick={() => window.open(b.bookingUrl!, '_blank', 'noreferrer')}
            >
              Manage booking
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function TodayList({
  agenda,
  heading,
  loading,
}: {
  agenda: Agenda;
  heading: string;
  loading: boolean;
}) {
  return (
    <section aria-labelledby="ov-today" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 id="ov-today" className="text-[17px] font-bold">
          {heading}
        </h2>
        <Link
          to="../itinerary"
          relative="path"
          className="flex min-h-11 items-center text-sm font-semibold"
        >
          Full itinerary
        </Link>
      </div>
      {loading ? (
        <Skeleton className="h-48" />
      ) : agenda.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-5 text-sm text-ink-muted">
          Nothing scheduled this day yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {agenda.map((a, i) => {
            const type = a.booking ? BOOKING_TYPES[a.booking.type] : null;
            const code =
              a.kind === 'CHECK_IN'
                ? 'IN'
                : a.kind === 'CHECK_OUT'
                  ? 'OUT'
                  : (type?.code ?? 'PLAN');
            const chip = type?.chip ?? 'bg-surface-muted text-ink-secondary';
            const inner = (
              <>
                <span className="text-sm font-bold text-accent-strong tabular-nums">
                  {a.time ?? '—'}
                </span>
                <span
                  aria-hidden="true"
                  className={`flex size-8 items-center justify-center rounded-[9px] text-[9px] font-bold ${chip}`}
                >
                  {code}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{a.title}</span>
                  {a.subtitle && (
                    <span className="truncate text-xs text-ink-muted">{a.subtitle}</span>
                  )}
                </span>
              </>
            );
            const cls =
              'grid min-h-14 grid-cols-[48px_32px_minmax(0,1fr)] items-center gap-2.5 rounded-[14px] border border-border bg-surface px-3 py-2.5 text-ink no-underline';
            return (
              <li key={`${a.kind}-${a.booking?.id ?? a.activity?.id ?? i}`}>
                {a.booking ? (
                  <Link
                    to={`../bookings/${a.booking.id}`}
                    relative="path"
                    className={`${cls} hover:bg-surface-muted hover:text-ink`}
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
