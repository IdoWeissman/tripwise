import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/Bits';
import { PlusIcon } from '../components/Icons';
import { Segmented } from '../components/Segmented';
import { Select } from '../components/Select';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { messageFromError } from '../lib/errors';
import { formatDay, formatDayShort, todayIn } from '../lib/format';
import { useMemberIndexOf, useTrip } from '../lib/trip';
import { useIsDesktop } from '../lib/useMediaQuery';
import { ActivityCard } from './itinerary/ActivityCard';
import { AddActivityDialog } from './itinerary/AddActivityDialog';
import { standaloneBookings } from './itinerary/bookedPlans';
import { Board, type Column } from './itinerary/Board';
import { BookingCard, StayStrip } from './itinerary/DayBookings';
import {
  ItineraryDocument,
  MoveActivityDocument,
  UNPLANNED,
  type ItineraryActivity,
} from './itinerary/queries';
import { dayTimeline, orderedActivities } from './itinerary/timeline';

type Items = Record<string, string[]>;

export function ItineraryPage() {
  const { trip, canEdit } = useTrip();
  const avatarIndex = useMemberIndexOf();
  const isDesktop = useIsDesktop();
  const toast = useToast();
  const { data, loading, error, refetch } = useQuery(ItineraryDocument, {
    variables: { id: trip.id },
  });
  const [move] = useMutation(MoveActivityDocument);
  /** Local order while dragging / until the server confirms. */
  const [pending, setPending] = useState<Items | null>(null);
  const [adding, setAdding] = useState<Column | null>(null);
  const [mobileDay, setMobileDay] = useState<string | null>(null);
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

  const moveTo = async (activityId: string, columnId: string, position: number) => {
    try {
      await move({
        variables: {
          input: { activityId, dayId: columnId === UNPLANNED ? null : columnId, position },
        },
      });
      await refetch();
      setPending(null);
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
        isDesktop
          ? 'Each day runs in time order. Drag an activity to another day; ones without a time can be reordered.'
          : 'Each day runs in time order. Use Move to for another day.'
      }
      actions={
        canEdit && (
          <Link
            to="../proposals"
            className="flex min-h-11 items-center gap-2 rounded-control bg-accent px-4.5 text-sm font-semibold text-white no-underline hover:bg-accent-hover"
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
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: isDesktop ? 4 : 1 }, (_, i) => (
            <div
              key={i}
              className="flex w-full flex-none flex-col gap-2.5 rounded-card bg-surface-column p-3 md:w-68"
            >
              <Skeleton className="h-6 w-24 rounded-control" />
              <Skeleton className="h-11 rounded-control" />
              <Skeleton className="h-23 rounded-xl" />
              <Skeleton className="h-23 rounded-xl" />
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

      {isDesktop ? (
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
}

/** "2 bookings · 3 activities" — every card on the day is counted. */
function dayCount(activities: number, bookings: number) {
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (!activities && !bookings) return 'Nothing yet';
  return [
    bookings ? part(bookings, 'booking', 'bookings') : null,
    activities ? part(activities, 'activity', 'activities') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Picker label: "Today · Sun 16" or "Day 3 · Sun 16" — the date is always visible. */
const pickerLabel = (c: Column) =>
  !c.day ? 'Unplanned' : `${c.isToday ? 'Today' : c.label} · ${formatDayShort(c.day.date)}`;

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
}: MobileProps) {
  const column = columns.find((c) => c.id === selected)!;
  const date = column.day?.date.slice(0, 10) ?? '';
  const bookings = column.day ? standaloneBookings(column.day) : [];
  const ids = items[selected] ?? [];
  const entries = dayTimeline(ids, (id) => byId.get(id)?.startTime, bookings, date);

  // Keep the chosen day visible in the scrolling picker (e.g. today on Day 5).
  const picker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    picker.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [selected]);

  return (
    <div className="flex flex-col gap-4">
      <div ref={picker} className="relative -mx-4 overflow-x-auto px-4 pb-1">
        <Segmented
          label="Day"
          value={selected}
          onChange={onSelect}
          options={columns.map((c) => ({ value: c.id, label: pickerLabel(c) }))}
          className="w-max"
        />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-xl font-bold">
          {column.label} · {column.sublabel}
          {column.isToday && <span className="sr-only">, today</span>}
        </h2>
        <span className="text-[13px] text-ink-muted">{dayCount(ids.length, bookings.length)}</span>
      </div>
      {column.day && <StayStrip day={column.day} />}
      {ids.length === 0 && bookings.length === 0 && (
        <EmptyState
          title="Nothing planned yet"
          body="Add an activity or propose an idea for the group to vote on."
        />
      )}
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
      {canEdit && (
        <button
          type="button"
          onClick={() => onAdd(column)}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border-input bg-surface text-[15px] font-semibold"
        >
          <PlusIcon />
          Add activity
        </button>
      )}
    </div>
  );
}
