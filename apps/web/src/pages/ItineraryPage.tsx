import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/Bits';
import { PlusIcon } from '../components/Icons';
import { Segmented } from '../components/Segmented';
import { Select } from '../components/Select';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { messageFromError } from '../lib/errors';
import { formatDay } from '../lib/format';
import { useMemberIndexOf, useTrip } from '../lib/trip';
import { useIsDesktop } from '../lib/useMediaQuery';
import { AddActivityDialog } from './itinerary/AddActivityDialog';
import { ActivityCard } from './itinerary/ActivityCard';
import { Board, type Column } from './itinerary/Board';
import {
  ItineraryDocument,
  MoveActivityDocument,
  UNPLANNED,
  type ItineraryActivity,
} from './itinerary/queries';

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

  const { columns, serverItems, byId } = useMemo(() => {
    const t = data?.trip;
    const byId = new Map<string, ItineraryActivity>();
    const serverItems: Items = {};
    const columns: Column[] = [];
    if (!t) return { columns, serverItems, byId };
    if (t.unplannedActivities.length) {
      columns.push({ id: UNPLANNED, label: 'Unplanned', sublabel: 'No day yet' });
      serverItems[UNPLANNED] = t.unplannedActivities.map((a) => (byId.set(a.id, a), a.id));
    }
    for (const d of t.days) {
      columns.push({ id: d.id, label: `Day ${d.position + 1}`, sublabel: formatDay(d.date) });
      serverItems[d.id] = d.activities.map((a) => (byId.set(a.id, a), a.id));
    }
    return { columns, serverItems, byId };
  }, [data]);

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
      toast(messageFromError(err, "Couldn't move that activity."), 'error');
    }
  };

  const header = (
    <PageHeader
      title="Itinerary"
      subtitle={isDesktop ? 'Drag activities to reorder or move them between days.' : undefined}
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
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-80 w-[272px] flex-none" />
          ))}
        </div>
      </div>
    );
  }
  if (error)
    return <ErrorState message="We couldn't load the itinerary." onRetry={() => void refetch()} />;
  if (columns.length === 0)
    return <EmptyState title="No days yet" body="This trip has no dates." />;

  const selectedDay =
    mobileDay && items[mobileDay]
      ? mobileDay
      : (columns.find((c) => c.id !== UNPLANNED)?.id ?? columns[0]!.id);

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
  const list = items[selected] ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="relative -mx-4 overflow-x-auto px-4 pb-1">
        <Segmented
          label="Day"
          value={selected}
          onChange={onSelect}
          options={columns.map((c) => ({
            value: c.id,
            label: c.id === UNPLANNED ? 'Unplanned' : c.label,
          }))}
          className="w-max"
        />
      </div>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold">
          {column.label} · {column.sublabel}
        </h2>
        <span className="text-[13px] text-ink-muted">
          {list.length} {list.length === 1 ? 'activity' : 'activities'}
        </span>
      </div>
      {list.length === 0 && (
        <EmptyState
          title="Nothing planned yet"
          body="Add an activity or propose an idea for the group to vote on."
        />
      )}
      {list.map((id) => {
        const a = byId.get(id);
        if (!a) return null;
        return (
          <ActivityCard
            key={id}
            activity={a}
            currency={currency}
            avatarIndex={avatarIndex(a.createdBy.id)}
            control={
              canEdit && (
                <Select
                  size="sm"
                  aria-label={`Move ${a.title} to another day`}
                  placeholder="Move to…"
                  value={undefined}
                  onValueChange={(col) => onMove(id, col)}
                  options={columns
                    .filter((c) => c.id !== selected)
                    .map((c) => ({
                      value: c.id,
                      label: c.id === UNPLANNED ? 'Unplanned' : `${c.label} · ${c.sublabel}`,
                    }))}
                />
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
