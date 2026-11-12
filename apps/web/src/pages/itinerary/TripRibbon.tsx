import { useEffect, useRef } from 'react';
import type { BookingType } from '../../gql/graphql';
import { formatDayShort } from '../../lib/format';
import { standaloneBookings } from './bookedPlans';
import type { Column } from './Board';
import type { ItineraryActivity } from './queries';
import { dayTimeline } from './timeline';

/** Mark colour per booking type: the type's ink, so marks match the chips. Plans are accent. */
const MARK: Record<BookingType, string> = {
  FLIGHT: 'bg-member-blue-ink',
  STAY: 'bg-member-teal-ink',
  EVENT: 'bg-member-purple-ink',
  ATTRACTION: 'bg-member-amber-ink',
  TOUR: 'bg-member-amber-ink',
  TRANSPORT: 'bg-member-orange-ink',
  DINING: 'bg-ink-muted',
  OTHER: 'bg-ink-muted',
};
const MAX_MARKS = 6;

interface Props {
  columns: Column[];
  items: Record<string, string[]>;
  byId: Map<string, ItineraryActivity>;
  /** Days currently shown: the chosen day on phones, the days in view on the board. */
  active: Set<string>;
  onPick: (columnId: string) => void;
  /** Phones: the ribbon chooses the one day shown (tabs). Desktop: it scrolls the board. */
  mode: 'select' | 'scroll';
}

/**
 * The whole trip in one row — rules §2 · 03. One cell per day: date, "Today", and a mark for
 * every booking and plan in time order, so the shape of the trip (busy days, empty days) reads
 * before any card. The dashboard's day strip, at full strength, doubling as the day navigator.
 */
export function TripRibbon({ columns, items, byId, active, onPick, mode }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const first = [...active][0];
  // Keep the active day visible inside the ribbon. Scrolls only the ribbon's own track,
  // never the page (scrollIntoView would yank a scrolled-down page back up).
  useEffect(() => {
    const el = track.current;
    const cell = el?.querySelector<HTMLElement>(`[data-ribbon="${first}"]`);
    if (!el || !cell || el.scrollWidth <= el.clientWidth) return;
    const left = cell.offsetLeft - el.offsetLeft;
    if (left < el.scrollLeft || left + cell.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollTo({ left: left - (el.clientWidth - cell.offsetWidth) / 2 });
  }, [first]);

  // Tabs pattern on phones: arrows / Home / End move between days; only the chosen day is tabbable.
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (mode !== 'select') return;
    const last = columns.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? Math.min(last, index + 1)
        : e.key === 'ArrowLeft'
          ? Math.max(0, index - 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    const id = columns[next]!.id;
    onPick(id);
    track.current?.querySelector<HTMLElement>(`[data-ribbon="${id}"]`)?.focus();
  };

  return (
    <div
      ref={track}
      role={mode === 'select' ? 'tablist' : undefined}
      aria-label="Trip days"
      className="relative -mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
    >
      <div className="flex min-w-full gap-1 rounded-xl bg-surface-muted p-1">
        {columns.map((c, index) => {
          const date = c.day?.date.slice(0, 10) ?? '';
          const bookings = c.day ? standaloneBookings(c.day) : [];
          const ids = items[c.id] ?? [];
          const entries = dayTimeline(ids, (id) => byId.get(id)?.startTime, bookings, date);
          const on = active.has(c.id);
          const summary = [
            bookings.length && `${bookings.length} booking${bookings.length === 1 ? '' : 's'}`,
            ids.length && `${ids.length} activit${ids.length === 1 ? 'y' : 'ies'}`,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <button
              key={c.id}
              type="button"
              data-ribbon={c.id}
              role={mode === 'select' ? 'tab' : undefined}
              aria-selected={mode === 'select' ? on : undefined}
              tabIndex={mode === 'select' && !on ? -1 : undefined}
              onKeyDown={(e) => onKeyDown(e, index)}
              aria-current={c.isToday ? 'date' : undefined}
              aria-label={`${c.day ? `${c.label}, ${c.sublabel}` : c.label}${c.isToday ? ', today' : ''}. ${summary || 'Nothing planned'}.`}
              onClick={() => onPick(c.id)}
              className={`flex min-h-11 min-w-[60px] flex-1 flex-col items-start gap-1 rounded-control px-2.5 py-2 text-left transition-colors ${
                on ? 'bg-surface shadow-segment' : 'hover:bg-surface/60'
              }`}
            >
              <span
                className={`text-xs ${c.isToday ? 'font-bold text-accent-strong' : 'font-medium text-ink-muted'}`}
              >
                {c.isToday ? 'Today' : c.day ? c.label : 'No day'}
              </span>
              <span className="text-[15px] leading-none font-bold whitespace-nowrap tabular-nums">
                {c.day ? formatDayShort(c.day.date) : 'Unplanned'}
              </span>
              <span aria-hidden="true" className="flex h-1.5 w-full gap-0.5">
                {entries.length === 0 ? (
                  <span className="h-full w-3 rounded-full bg-border-input" />
                ) : (
                  entries
                    .slice(0, MAX_MARKS)
                    .map((e, i) => (
                      <span
                        key={i}
                        className={`h-full w-3 shrink-0 rounded-full ${
                          e.kind === 'booking' ? MARK[e.booking.type] : 'bg-accent'
                        }`}
                      />
                    ))
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
