import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { GripIcon, PlusIcon } from '../../components/Icons';
import { ActivityCard } from './ActivityCard';
import type { ItineraryActivity } from './queries';

export interface Column {
  id: string;
  label: string;
  sublabel: string;
  /** Read-only bookings for the day (stay strip + booking cards), shown above the activities. */
  extra?: React.ReactNode;
  /** Booking cards shown on their own that day (for the day's item count). */
  bookings?: number;
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

const findColumn = (items: Items, id: string) =>
  id in items ? id : Object.keys(items).find((k) => items[k]!.includes(id));

/** Day columns with drag-and-drop (pointer + keyboard). */
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

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setSnapshot(items);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(items, String(active.id));
    const to = findColumn(items, String(over.id));
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        if (snapshot) onItemsChange(snapshot);
      }}
    >
      <div className="relative overflow-x-auto pb-2">
        <div className="flex w-max items-start gap-4">
          {columns.map((c) => (
            <DayColumn
              key={c.id}
              column={c}
              ids={items[c.id] ?? []}
              canEdit={canEdit}
              onAdd={() => onAdd(c)}
            >
              {(items[c.id] ?? []).map((id) => {
                const a = byId.get(id);
                return a ? (
                  <SortableCard
                    key={id}
                    activity={a}
                    currency={currency}
                    avatarIndex={avatarIndex(a.createdBy.id)}
                    disabled={!canEdit}
                  />
                ) : null;
              })}
            </DayColumn>
          ))}
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
  canEdit,
  onAdd,
  children,
}: {
  column: Column;
  ids: string[];
  canEdit: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.label}, ${column.sublabel}`}
      className={`flex w-[272px] flex-none flex-col gap-2.5 rounded-card p-3 transition-colors ${isOver ? 'bg-accent-tint' : 'bg-surface-column'}`}
    >
      <div className="flex items-baseline justify-between px-1 pt-1">
        <h2 className="text-[15px] font-bold">{column.label}</h2>
        <span className="text-[13px] text-ink-muted">{column.sublabel}</span>
      </div>
      {column.extra}
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      {ids.length === 0 && !column.extra && (
        <p className="rounded-xl border-[1.5px] border-dashed border-border-input px-3 py-5 text-center text-[13px] text-ink-muted">
          Nothing planned yet
        </p>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-control text-sm font-medium text-ink-secondary hover:bg-surface-muted"
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
        className="flex h-16 items-center justify-center rounded-xl border-[1.5px] border-dashed border-accent bg-accent-tint text-[13px] font-semibold text-accent-strong"
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
