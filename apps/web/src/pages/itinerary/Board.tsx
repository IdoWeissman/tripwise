import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GripIcon, PlusIcon } from '../../components/Icons';
import { ActivityCard } from './ActivityCard';
import { DayDateContext } from './dayDate';
import { standaloneBookings } from './bookedPlans';
import { BookingCard, StayStrip } from './DayBookings';
import type { Day, ItineraryActivity } from './queries';
import { dayTimeline } from './timeline';
import { TripRibbon } from './TripRibbon';

export interface Column {
  id: string;
  label: string;
  sublabel: string;
  /** The itinerary day (absent for the Unplanned column). */
  day?: Day;
  isToday?: boolean;
}

type Items = Record<string, string[]>;

interface BoardProps {
  columns: Column[];
  items: Items;
  byId: Map<string, ItineraryActivity>;
  currency: string;
  avatarIndex: (userId: string) => number;
  canEdit: boolean;
  onItemsChange: (items: Items) => void;
  onMove: (activityId: string, columnId: string, position: number) => void;
  onAdd: (column: Column) => void;
}

const findColumn = (items: Items, id: UniqueIdentifier) =>
  String(id) in items ? String(id) : Object.keys(items).find((k) => items[k]!.includes(String(id)));

/** "Sun, May" beside the day numeral (Intl alone would give "May Sun"). */
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const WEEKDAY_MONTH = { format: (d: Date) => `${WEEKDAY.format(d)}, ${MONTH.format(d)}` };

const SCREEN_READER_INSTRUCTIONS =
  'To move an activity to another day, press Space to pick it up, use the arrow keys to move it, ' +
  'then Space to drop it or Escape to cancel. Within a day, the time sets the order; ' +
  'activities without a time can be reordered.';

/** Day columns with drag-and-drop (pointer + keyboard). Each day reads in time order. */
export function Board({
  columns,
  items,
  byId,
  currency,
  avatarIndex,
  canEdit,
  onItemsChange,
  onMove,
  onAdd,
}: BoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Items | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // --- horizontal scrolling: the trip ribbon shows which days are in view and jumps to any day ---
  const scroller = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState<Set<string>>(new Set());
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    const seen = new Set<string>();
    el.querySelectorAll<HTMLElement>('[data-column]').forEach((col) => {
      // at least ~a third of the column visible
      if (col.offsetLeft + col.offsetWidth - 96 > left && col.offsetLeft + 96 < right)
        seen.add(col.dataset.column!);
    });
    setInView((prev) =>
      prev.size === seen.size && [...seen].every((x) => prev.has(x)) ? prev : seen,
    );
  }, []);
  const todayId = columns.find((c) => c.isToday)?.id;
  const scrollToColumn = useCallback((id: string, behavior: ScrollBehavior = 'smooth') => {
    const el = scroller.current;
    const col = el?.querySelector<HTMLElement>(`[data-column="${id}"]`);
    if (el && col) el.scrollTo({ left: col.offsetLeft, behavior });
  }, []);
  useEffect(() => {
    if (todayId) scrollToColumn(todayId, 'auto');
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [todayId, scrollToColumn, measure]);

  // --- screen-reader announcements in the user's terms (never raw ids) ---
  const title = (id: UniqueIdentifier) => byId.get(String(id))?.title ?? 'activity';
  const dayName = (colId: string | undefined) => {
    const c = columns.find((x) => x.id === colId);
    return c ? (c.day ? `${c.label}, ${c.sublabel}` : c.label) : 'no day';
  };
  const position = (id: UniqueIdentifier) => {
    const col = findColumn(items, id);
    const list = col ? items[col]! : [];
    return `${dayName(col)}, position ${list.indexOf(String(id)) + 1} of ${list.length}`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${title(active.id)}. ${position(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${title(active.id)} is over ${dayName(findColumn(items, over.id))}.`
        : `${title(active.id)} is no longer over a day.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${title(active.id)} on ${dayName(findColumn(items, over.id))}.`
        : `Dropped ${title(active.id)}.`,
    onDragCancel: ({ active }) =>
      `Cancelled. ${title(active.id)} is back on ${dayName(snapshot ? findColumn(snapshot, active.id) : undefined)}.`,
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setSnapshot(items);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(items, active.id);
    const to = findColumn(items, over.id);
    if (!from || !to || from === to) return;
    const target = items[to]!;
    const overIndex = target.indexOf(String(over.id));
    const index = overIndex >= 0 ? overIndex : target.length;
    onItemsChange({
      ...items,
      [from]: items[from]!.filter((x) => x !== active.id),
      [to]: [...target.slice(0, index), String(active.id), ...target.slice(index)],
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    setActiveId(null);
    const col = findColumn(items, id);
    if (!over || !col || !snapshot) {
      if (snapshot) onItemsChange(snapshot);
      return;
    }
    let next = items;
    const overIndex = items[col]!.indexOf(String(over.id));
    const curIndex = items[col]!.indexOf(id);
    if (overIndex >= 0 && overIndex !== curIndex) {
      next = { ...items, [col]: arrayMove(items[col]!, curIndex, overIndex) };
      onItemsChange(next);
    }
    const finalIndex = next[col]!.indexOf(id);
    const origCol = findColumn(snapshot, id);
    if (origCol === col && snapshot[col]!.indexOf(id) === finalIndex) return; // no-op
    onMove(id, col, finalIndex);
  };

  const active = activeId ? byId.get(activeId) : undefined;
  const timeOf = (id: string) => byId.get(id)?.startTime;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        if (snapshot) onItemsChange(snapshot);
      }}
    >
      <div className="mb-4">
        <TripRibbon
          columns={columns}
          items={items}
          byId={byId}
          active={inView}
          mode="scroll"
          onPick={(id) => scrollToColumn(id)}
        />
      </div>
      <div ref={scroller} onScroll={measure} className="relative overflow-x-auto pb-2">
        {/* trailing padding so the last column never sits flush against the edge */}
        <div className="flex w-max items-start gap-4 pr-8">
          {columns.map((c) => {
            const date = c.day?.date.slice(0, 10) ?? '';
            const bookings = c.day ? standaloneBookings(c.day) : [];
            const entries = dayTimeline(items[c.id] ?? [], timeOf, bookings, date);
            const ids = entries.flatMap((e) => (e.kind === 'activity' ? [e.id] : []));
            return (
              <DayColumn
                key={c.id}
                column={c}
                ids={ids}
                empty={ids.length === 0 && bookings.length === 0}
                canEdit={canEdit}
                onAdd={() => onAdd(c)}
              >
                <DayDateContext.Provider value={date}>
                  {entries.map((e) => {
                    if (e.kind === 'booking')
                      return <BookingCard key={e.booking.id} booking={e.booking} date={date} />;
                    const a = byId.get(e.id);
                    return a ? (
                      <SortableCard
                        key={e.id}
                        activity={a}
                        currency={currency}
                        avatarIndex={avatarIndex(a.createdBy.id)}
                        disabled={!canEdit}
                      />
                    ) : null;
                  })}
                </DayDateContext.Provider>
              </DayColumn>
            );
          })}
        </div>
      </div>
      <DragOverlay>
        {active && (
          <ActivityCard
            activity={active}
            currency={currency}
            avatarIndex={avatarIndex(active.createdBy.id)}
            lifted
            control={<GripIcon size={16} />}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

function DayColumn({
  column,
  ids,
  empty,
  canEdit,
  onAdd,
  children,
}: {
  column: Column;
  ids: string[];
  empty: boolean;
  canEdit: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      data-column={column.id}
      aria-label={`${column.label}, ${column.sublabel}${column.isToday ? ', today' : ''}`}
      className={`flex w-[272px] flex-none flex-col gap-2.5 rounded-card p-3 transition-colors ${
        isOver ? 'bg-accent-tint' : 'bg-surface-column'
      } ${column.isToday ? 'outline-2 -outline-offset-2 outline-sign' : ''}`}
    >
      {column.day ? (
        // The date is the column's landmark: a big numeral, like the times on a flight card.
        <div className="flex items-end justify-between gap-2 px-1 pt-1">
          <h2 className="flex items-end gap-2.5">
            <span className="sr-only">
              {column.label}, {column.sublabel}
              {column.isToday ? ', today' : ''}
            </span>
            <span
              aria-hidden="true"
              className={`text-[28px] leading-none font-bold tracking-[-0.02em] figures ${column.isToday ? 'text-accent-strong' : ''}`}
            >
              {new Date(column.day.date).getUTCDate()}
            </span>
            <span aria-hidden="true" className="flex flex-col pb-px text-[13px] leading-tight">
              <span className="font-semibold">
                {WEEKDAY_MONTH.format(new Date(column.day.date))}
              </span>
              <span className="text-ink-muted">{column.label}</span>
            </span>
          </h2>
          {column.isToday && (
            <span className="mb-0.5 rounded-full bg-signal px-2 py-0.5 text-xs font-bold text-sign">
              Today
            </span>
          )}
        </div>
      ) : (
        <div className="flex min-h-7 items-center justify-between gap-2 px-1 pt-1">
          <h2 className="text-[15px] font-bold">{column.label}</h2>
          <span className="text-[13px] text-ink-muted">{column.sublabel}</span>
        </div>
      )}
      {column.day && <StayStrip day={column.day} />}
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      {empty && (
        <p className="rounded-card border-[1.5px] border-dashed border-border-input px-3 py-5 text-center text-[13px] text-ink-muted">
          Nothing planned yet
        </p>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-control text-sm font-medium text-ink-secondary hover:bg-surface-muted"
        >
          <PlusIcon size={16} />
          Add activity
        </button>
      )}
    </section>
  );
}

function SortableCard({
  activity,
  currency,
  avatarIndex,
  disabled,
}: {
  activity: ItineraryActivity;
  currency: string;
  avatarIndex: number;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: activity.id,
    disabled,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex h-16 items-center justify-center rounded-card border-[1.5px] border-dashed border-accent bg-accent-tint text-[13px] font-semibold text-accent-strong"
      >
        Drop here
      </div>
    );
  }

  return (
    <ActivityCard
      ref={setNodeRef}
      style={style}
      activity={activity}
      currency={currency}
      avatarIndex={avatarIndex}
      control={
        !disabled && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Drag to move ${activity.title}`}
            className="-mr-2 flex size-11 cursor-grab items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted"
            {...attributes}
            {...listeners}
          >
            <GripIcon size={16} />
          </button>
        )
      }
    />
  );
}
