import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../components/Bits';
import { PlusIcon } from '../components/Icons';
import { Segmented } from '../components/Segmented';
import { useMaps } from '../lib/maps';
import { Select } from '../components/Select';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { messageFromError } from '../lib/errors';
import { formatDay, todayIn } from '../lib/format';
import { useMemberIndexOf, useTrip } from '../lib/trip';
import { useIsDesktop } from '../lib/useMediaQuery';
import { ActivityCard } from './itinerary/ActivityCard';
import { DayDateContext } from './itinerary/dayDate';
import { AddActivityDialog } from './itinerary/AddActivityDialog';
import { standaloneBookings } from './itinerary/bookedPlans';
import { Board, type Column } from './itinerary/Board';
import { BookingCard, StayStrip } from './itinerary/DayBookings';
import { DayCheck } from './itinerary/DayCheck';
import { DayPlanDialog } from './itinerary/DayPlanDialog';
import { PlanningSettings } from './itinerary/PlanningSettings';
import {
  DayPlansDocument,
  ItineraryDocument,
  MoveActivityDocument,
  UNPLANNED,
  type DayPlan,
  type ItineraryActivity,
} from './itinerary/queries';
import { dayTimeline, orderedActivities } from './itinerary/timeline';
import { TripMap } from './itinerary/TripMap';
import { TripRibbon } from './itinerary/TripRibbon';

type Items = Record<string, string[]>;

export function ItineraryPage() {
  const { trip, canEdit } = useTrip();
  const avatarIndex = useMemberIndexOf();
  const isDesktop = useIsDesktop();
  const toast = useToast();
  const { data, loading, error, refetch } = useQuery(ItineraryDocument, {
    variables: { id: trip.id },
  });
  // Plans (travel, opening hours) load after the board so it never waits on them.
  const plans = useQuery(DayPlansDocument, { variables: { id: trip.id }, skip: !data });
  const [move] = useMutation(MoveActivityDocument);
  /** Local order while dragging / until the server confirms. */
  const [pending, setPending] = useState<Items | null>(null);
  const [adding, setAdding] = useState<Column | null>(null);
  const [mobileDay, setMobileDay] = useState<string | null>(null);
  const [planFor, setPlanFor] = useState<Column | null>(null);
  const maps = useMaps();
  // Board or Map; kept in the URL so a link (or the back button) returns to the same view.
  const [params, setParams] = useSearchParams();
  const view = maps.mapEnabled && params.get('view') === 'map' ? 'map' : 'board';
  const today = todayIn(trip.timeZone);

  const { columns, serverItems, byId } = useMemo(() => {
    const t = data?.trip;
    const byId = new Map<string, ItineraryActivity>();
    const serverItems: Items = {};
    const columns: Column[] = [];
    if (!t) return { columns, serverItems, byId };
    const timeOf = (id: string) => byId.get(id)?.startTime;
    if (t.unplannedActivities.length) {
      columns.push({ id: UNPLANNED, label: 'Unplanned', sublabel: 'No day yet' });
      t.unplannedActivities.forEach((a) => byId.set(a.id, a));
      serverItems[UNPLANNED] = orderedActivities(
        t.unplannedActivities.map((a) => a.id),
        timeOf,
      );
    }
    for (const d of t.days) {
      columns.push({
        id: d.id,
        label: `Day ${d.position + 1}`,
        sublabel: formatDay(d.date),
        day: d,
        isToday: d.date.slice(0, 10) === today,
      });
      d.activities.forEach((a) => byId.set(a.id, a));
      // Kept in the order the day shows them (time first), so drag positions line up.
      serverItems[d.id] = orderedActivities(
        d.activities.map((a) => a.id),
        timeOf,
      );
    }
    return { columns, serverItems, byId };
  }, [data, today]);

  const items = pending ?? serverItems;

  const { planByDay, issuesById } = useMemo(() => {
    const planByDay = new Map<string, DayPlan>();
    const issuesById = new Map<string, string[]>();
    for (const d of plans.data?.trip?.days ?? []) {
      planByDay.set(d.id, d.plan);
      for (const i of d.plan.issues)
        if (i.activityId)
          issuesById.set(i.activityId, [...(issuesById.get(i.activityId) ?? []), i.message]);
    }
    return { planByDay, issuesById };
  }, [plans.data]);
  const planSettings = plans.data?.trip;
  const refreshAll = () => Promise.all([refetch(), plans.refetch()]);

  const moveTo = async (activityId: string, columnId: string, position: number) => {
    try {
      await move({
        variables: {
          input: { activityId, dayId: columnId === UNPLANNED ? null : columnId, position },
        },
      });
      await refetch();
      setPending(null);
      void plans.refetch();
    } catch (err) {
      setPending(null); // snap back to the server's order
      toast(
        messageFromError(err, "Couldn't move that activity — it's back where it was."),
        'error',
      );
    }
  };

  const header = (
    <PageHeader
      title="Itinerary"
      subtitle={
        view === 'map'
          ? 'Where everything is. Pick a day to see its stops in order.'
          : isDesktop
            ? 'Each day runs in time order. Drag an activity to another day; ones without a time can be reordered.'
            : 'Each day runs in time order. Use Move to for another day.'
      }
      actions={
        canEdit && (
          <Link
            to="../proposals"
            className="flex min-h-11 items-center gap-2 rounded-control bg-sign px-4.5 text-sm font-semibold text-white no-underline hover:bg-sign-raised"
          >
            <PlusIcon />
            Propose activity
          </Link>
        )
      }
    />
  );

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        {header}
        {/* ribbon placeholder, so nothing shifts when the days arrive */}
        <Skeleton className="-mb-2 h-[69px] rounded-card" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: isDesktop ? 4 : 1 }, (_, i) => (
            <div
              key={i}
              className="flex w-full flex-none flex-col gap-2.5 rounded-card bg-surface-column p-3 md:w-68"
            >
              <Skeleton className="h-6 w-24 rounded-control" />
              <Skeleton className="h-11 rounded-control" />
              <Skeleton className="h-23 rounded-card" />
              <Skeleton className="h-23 rounded-card" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState message="We couldn't load the itinerary." onRetry={() => void refetch()} />
      </div>
    );
  if (columns.length === 0)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          title="No days yet"
          body="This trip has no dates, so there's nothing to lay out by day. Ideas can still be proposed and voted on."
          action={
            <Link to="../proposals" className="flex min-h-11 items-center text-sm font-semibold">
              Go to proposals
            </Link>
          }
        />
      </div>
    );

  // Phones open on today while the trip is on, otherwise on the first day.
  const selectedDay =
    mobileDay && items[mobileDay]
      ? mobileDay
      : (columns.find((c) => c.isToday)?.id ??
        columns.find((c) => c.id !== UNPLANNED)?.id ??
        columns[0]!.id);

  return (
    <div className="flex flex-col gap-6">
      {header}

      {(maps.mapEnabled || planSettings) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {maps.mapEnabled && (
            <Segmented
              label="Itinerary view"
              value={view}
              onChange={(v) =>
                setParams(
                  (p) => {
                    if (v === 'map') p.set('view', 'map');
                    else p.delete('view');
                    return p;
                  },
                  { replace: true },
                )
              }
              className="self-start"
              options={[
                { value: 'board', label: 'Board' },
                { value: 'map', label: 'Map' },
              ]}
            />
          )}
          {planSettings && (
            <PlanningSettings
              tripId={trip.id}
              pace={planSettings.pace}
              getAround={planSettings.getAround}
              canEdit={canEdit}
              onChanged={() => plans.refetch()}
            />
          )}
        </div>
      )}

      {view === 'map' && maps.browserKey ? (
        <TripMap
          columns={columns}
          items={items}
          byId={byId}
          browserKey={maps.browserKey}
          mapId={maps.mapId}
        />
      ) : isDesktop ? (
        <Board
          columns={columns}
          items={items}
          byId={byId}
          currency={trip.currency}
          avatarIndex={avatarIndex}
          canEdit={canEdit}
          onItemsChange={setPending}
          onMove={(id, col, pos) => void moveTo(id, col, pos)}
          onAdd={setAdding}
          plans={planByDay}
          plansLoading={plans.loading}
          issuesById={issuesById}
          onOpenPlan={setPlanFor}
        />
      ) : (
        <MobileDayList
          columns={columns}
          items={items}
          byId={byId}
          selected={selectedDay}
          onSelect={setMobileDay}
          currency={trip.currency}
          avatarIndex={avatarIndex}
          canEdit={canEdit}
          onMove={(id, col) => {
            const next = Object.fromEntries(
              Object.entries(items).map(([k, v]) => [k, v.filter((x) => x !== id)]),
            );
            next[col] = [...(next[col] ?? []), id];
            setPending(next);
            void moveTo(id, col, next[col]!.length - 1);
          }}
          onAdd={setAdding}
          plans={planByDay}
          plansLoading={plans.loading}
          issuesById={issuesById}
          onOpenPlan={setPlanFor}
        />
      )}

      {planFor && planSettings && planByDay.get(planFor.id) && (
        <DayPlanDialog
          tripId={trip.id}
          dayId={planFor.id}
          dayName={`${planFor.label} · ${planFor.sublabel}`}
          plan={planByDay.get(planFor.id)!}
          pace={planSettings.pace}
          getAround={planSettings.getAround}
          canEdit={canEdit}
          onClose={() => setPlanFor(null)}
          onChanged={refreshAll}
        />
      )}

      {adding && (
        <AddActivityDialog
          tripId={trip.id}
          dayId={adding.id === UNPLANNED ? null : adding.id}
          dayLabel={adding.label}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

interface MobileProps {
  columns: Column[];
  items: Items;
  byId: Map<string, ItineraryActivity>;
  selected: string;
  onSelect: (id: string) => void;
  currency: string;
  avatarIndex: (userId: string) => number;
  canEdit: boolean;
  onMove: (activityId: string, columnId: string) => void;
  onAdd: (column: Column) => void;
  plans: Map<string, DayPlan>;
  plansLoading: boolean;
  issuesById: Map<string, string[]>;
  onOpenPlan: (column: Column) => void;
}

/** "2 bookings · 3 activities" — every card on the day is counted. */
function dayCount(activities: number, bookings: number) {
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    bookings ? part(bookings, 'booking', 'bookings') : null,
    activities ? part(activities, 'activity', 'activities') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** M1 — one day at a time with a day picker; "Move to" replaces drag on touch. */
function MobileDayList({
  columns,
  items,
  byId,
  selected,
  onSelect,
  currency,
  avatarIndex,
  canEdit,
  onMove,
  onAdd,
  plans,
  plansLoading,
  issuesById,
  onOpenPlan,
}: MobileProps) {
  const column = columns.find((c) => c.id === selected)!;
  const date = column.day?.date.slice(0, 10) ?? '';
  const bookings = column.day ? standaloneBookings(column.day) : [];
  const ids = items[selected] ?? [];
  const entries = dayTimeline(ids, (id) => byId.get(id)?.startTime, bookings, date);

  return (
    <div className="flex flex-col gap-4">
      <TripRibbon
        columns={columns}
        items={items}
        byId={byId}
        active={new Set([selected])}
        mode="select"
        onPick={onSelect}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-xl font-bold">
          {column.label} · {column.sublabel}
          {column.isToday && <span className="sr-only">, today</span>}
        </h2>
        {(ids.length > 0 || bookings.length > 0) && (
          <span className="text-[13px] text-ink-muted">
            {dayCount(ids.length, bookings.length)}
          </span>
        )}
      </div>
      {column.day && <StayStrip day={column.day} />}
      {column.day && (
        <DayCheck
          plan={plans.get(column.id)}
          loading={plansLoading}
          dayName={`${column.label}, ${column.sublabel}`}
          onOpen={() => onOpenPlan(column)}
        />
      )}
      {ids.length === 0 && bookings.length === 0 && (
        <EmptyState
          title="Nothing planned yet"
          body="Add an activity or propose an idea for the group to vote on."
        />
      )}
      <DayDateContext.Provider value={date}>
        {entries.map((e) => {
          if (e.kind === 'booking')
            return <BookingCard key={e.booking.id} booking={e.booking} date={date} />;
          const a = byId.get(e.id);
          if (!a) return null;
          return (
            <ActivityCard
              key={e.id}
              activity={a}
              currency={currency}
              avatarIndex={avatarIndex(a.createdBy.id)}
              issues={issuesById.get(a.id)}
              control={
                canEdit && (
                  <span className="w-36">
                    <Select
                      aria-label={`Move ${a.title} to another day`}
                      placeholder="Move to…"
                      value={undefined}
                      onValueChange={(col) => onMove(e.id, col)}
                      options={columns
                        .filter((c) => c.id !== selected)
                        .map((c) => ({
                          value: c.id,
                          label: c.id === UNPLANNED ? 'Unplanned' : `${c.label} · ${c.sublabel}`,
                        }))}
                    />
                  </span>
                )
              }
            />
          );
        })}
      </DayDateContext.Provider>
      {canEdit && (
        <button
          type="button"
          onClick={() => onAdd(column)}
          className="flex min-h-12 items-center justify-center gap-2 rounded-card border border-border-input bg-surface text-[15px] font-semibold"
        >
          <PlusIcon />
          Add activity
        </button>
      )}
    </div>
  );
}
