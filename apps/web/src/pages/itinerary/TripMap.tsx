import { useEffect, useMemo, useRef, useState } from 'react';
import { PlaceSheet } from '../../components/PlaceSheet';
import { Select } from '../../components/Select';
import { EmptyState, ErrorState, Skeleton } from '../../components/States';
import { loadGoogleMaps } from '../../lib/maps';
import { useTrip } from '../../lib/trip';
import type { Column } from './Board';
import { UNPLANNED, type ItineraryActivity } from './queries';

type Items = Record<string, string[]>;
const ALL = 'all';

/** One thing on the map: a planned stop, an idea without a day, or the stay. */
interface Stop {
  key: string;
  kind: 'stop' | 'idea' | 'stay';
  title: string;
  /** "3" for the third stop of its day; "2·3" when every day is shown. */
  mark: string;
  dayId: string | null;
  placeId: string;
  lat: number;
  lng: number;
  time: string | null;
}

/**
 * Trip map — rules §2 Itinerary · Map. Pins follow the system's state forms, not per-day colours:
 * planned stops are solid sign-blue numbers, ideas without a day are dashed, the stay is a STAY
 * plate. The list beside the map is the same content in order, and the accessible way in.
 */
export function TripMap({
  columns,
  items,
  byId,
  browserKey,
  mapId,
}: {
  columns: Column[];
  items: Items;
  byId: Map<string, ItineraryActivity>;
  browserKey: string;
  mapId: string;
}) {
  const { trip } = useTrip();
  const [dayFilter, setDayFilter] = useState<string>(ALL);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Stop | null>(null);
  const days = columns.filter((c) => c.id !== UNPLANNED);

  const { stops, sections, offMap } = useMemo(() => {
    const stops: Stop[] = [];
    const sections: { id: string; label: string; stops: Stop[] }[] = [];
    let offMap = 0;
    // The stay anchors the map: the first one that has a place.
    const stay = days.map((c) => c.day?.stay?.booking).find((b) => b?.place);
    if (stay?.place) {
      const s: Stop = {
        key: `stay-${stay.id}`,
        kind: 'stay',
        title: stay.title,
        mark: 'STAY',
        dayId: null,
        placeId: stay.place.id,
        lat: stay.place.lat,
        lng: stay.place.lng,
        time: null,
      };
      stops.push(s);
      sections.push({ id: 'stay', label: 'Where you’re staying', stops: [s] });
    }
    for (const c of columns) {
      if (dayFilter !== ALL && c.id !== dayFilter && c.id !== UNPLANNED) continue;
      const list: Stop[] = [];
      let n = 0;
      for (const id of items[c.id] ?? []) {
        const a = byId.get(id);
        if (!a) continue;
        if (!a.place) {
          offMap++;
          continue;
        }
        n++;
        const isIdea = c.id === UNPLANNED;
        const dayNo = c.day ? c.day.position + 1 : null;
        list.push({
          key: a.id,
          kind: isIdea ? 'idea' : 'stop',
          title: a.title,
          mark: isIdea ? '' : dayFilter === ALL ? `${dayNo}·${n}` : String(n),
          dayId: isIdea ? null : c.id,
          placeId: a.place.id,
          lat: a.place.lat,
          lng: a.place.lng,
          time: a.startTime ?? null,
        });
      }
      if (list.length) {
        stops.push(...list);
        sections.push({
          id: c.id,
          label: c.id === UNPLANNED ? 'Ideas without a day' : `${c.label} · ${c.sublabel}`,
          stops: list,
        });
      }
    }
    return { stops, sections, offMap };
  }, [columns, days, items, byId, dayFilter]);

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[320px_1fr] lg:items-start">
      <div className="lg:order-2 lg:col-start-2 lg:row-start-1">
        {stops.length === 0 ? (
          <EmptyState
            title="Nothing on the map yet"
            body="Add an activity or propose an idea and pick a real place for it — it shows up here."
          />
        ) : (
          <GoogleMap
            stops={stops}
            selected={selected}
            onSelect={setSelected}
            browserKey={browserKey}
            mapId={mapId}
            showRoute={dayFilter !== ALL}
          />
        )}
      </div>

      <section
        aria-label="Places on the map"
        className="flex flex-col gap-3 lg:order-1 lg:row-start-1"
      >
        <Select
          aria-label="Show on the map"
          value={dayFilter}
          onValueChange={(v) => {
            setDayFilter(v);
            setSelected(null);
          }}
          options={[
            { value: ALL, label: 'All days' },
            ...days.map((c) => ({ value: c.id, label: `${c.label} · ${c.sublabel}` })),
          ]}
        />
        {sections.length > 0 && (
          <div className="flex flex-col rounded-card bg-surface">
            {sections.map((sec) => (
              <div key={sec.id} className="border-b border-border last:border-b-0">
                <h3 className="px-4 pt-3 pb-1 text-xs font-extrabold tracking-[0.06em] text-ink-muted uppercase">
                  {sec.label}
                </h3>
                <ol>
                  {sec.stops.map((s) => (
                    <li key={s.key}>
                      <button
                        type="button"
                        aria-pressed={selected === s.key}
                        onClick={() => setSelected(s.key)}
                        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-bg aria-pressed:bg-accent-tint"
                      >
                        <Mark stop={s} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold">{s.title}</span>
                          {s.time && (
                            <span className="text-[13px] text-ink-muted figures">{s.time}</span>
                          )}
                        </span>
                      </button>
                      {selected === s.key && (
                        <button
                          type="button"
                          onClick={() => setSheet(s)}
                          className="mb-2 ml-15 flex min-h-11 items-center text-sm font-semibold text-accent-strong"
                        >
                          Place details
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
        {offMap > 0 && (
          <p className="text-[13px] text-ink-muted">
            {offMap} {offMap === 1 ? 'activity has' : 'activities have'} no place yet, so{' '}
            {offMap === 1 ? 'it isn’t' : 'they aren’t'} on the map. Pick a place when you add or
            propose one.
          </p>
        )}
      </section>

      {sheet && (
        <PlaceSheet
          tripId={trip.id}
          placeId={sheet.placeId}
          title={sheet.title}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

/** The list's copy of a pin, so the list and the map read the same. */
function Mark({ stop }: { stop: Stop }) {
  if (stop.kind === 'stay')
    return (
      <span className="flex h-7 w-11 shrink-0 items-center justify-center rounded-chip bg-sign text-xs font-extrabold tracking-[0.06em] text-white">
        STAY
      </span>
    );
  if (stop.kind === 'idea')
    return (
      <span className="flex h-7 w-11 shrink-0 items-center justify-center rounded-chip border-[1.5px] border-dashed border-ink-muted text-xs font-extrabold tracking-[0.06em] text-ink-muted">
        IDEA
      </span>
    );
  return (
    <span className="flex h-7 min-w-11 shrink-0 items-center justify-center rounded-chip bg-sign px-1.5 text-[13px] font-extrabold text-white figures">
      {stop.mark}
    </span>
  );
}

/** The sign-blue token, for the map's route line (Google takes a colour string, not a class). */
const signColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--color-sign').trim() ||
  'currentColor';

/** Pin element for an advanced marker; the same look as `Mark`. */
function pinElement(stop: Stop, active: boolean): HTMLElement {
  const el = document.createElement('div');
  const base =
    'flex h-8 items-center justify-center rounded-chip px-2 text-[13px] font-extrabold tracking-[0.04em] figures transition-transform';
  const look =
    stop.kind === 'idea'
      ? 'border-[1.5px] border-dashed border-ink-muted bg-surface text-ink-muted'
      : 'bg-sign text-white';
  const ring = active ? ' scale-125 outline-2 outline-offset-2 outline-accent' : '';
  el.className = `${base} ${look}${ring}`;
  el.textContent = stop.kind === 'stay' ? 'STAY' : stop.kind === 'idea' ? 'IDEA' : stop.mark;
  return el;
}

function GoogleMap({
  stops,
  selected,
  onSelect,
  browserKey,
  mapId,
  showRoute,
}: {
  stops: Stop[];
  selected: string | null;
  onSelect: (key: string) => void;
  browserKey: string;
  mapId: string;
  showRoute: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef(new Map<string, google.maps.marker.AdvancedMarkerElement>());
  const route = useRef<google.maps.Polyline | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  // Load the API and create the map once.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(browserKey)
      .then(async () => {
        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        await google.maps.importLibrary('marker');
        if (cancelled || !box.current) return;
        map.current ??= new Map(box.current, {
          mapId,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        });
        setState('ready');
      })
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, [browserKey, mapId, attempt]);

  // Pins and the day's route; the view fits whatever is shown.
  useEffect(() => {
    const m = map.current;
    if (state !== 'ready' || !m) return;
    for (const mk of markers.current.values()) mk.map = null;
    markers.current.clear();
    route.current?.setMap(null);

    const bounds = new google.maps.LatLngBounds();
    for (const s of stops) {
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: m,
        position: { lat: s.lat, lng: s.lng },
        content: pinElement(s, s.key === selected),
        title: s.kind === 'stop' ? `${s.mark}. ${s.title}` : s.title,
        gmpClickable: true,
        zIndex: s.key === selected ? 10 : s.kind === 'stay' ? 5 : 1,
      });
      marker.addListener('click', () => onSelect(s.key));
      markers.current.set(s.key, marker);
      bounds.extend({ lat: s.lat, lng: s.lng });
    }
    if (showRoute) {
      const path = stops.filter((s) => s.kind === 'stop').map((s) => ({ lat: s.lat, lng: s.lng }));
      if (path.length > 1)
        route.current = new google.maps.Polyline({
          map: m,
          path,
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, strokeColor: signColor(), scale: 3 },
              offset: '0',
              repeat: '14px',
            },
          ],
        });
    }
    if (stops.length === 1) {
      m.setCenter({ lat: stops[0]!.lat, lng: stops[0]!.lng });
      m.setZoom(15);
    } else {
      m.fitBounds(bounds, 48);
    }
    // Selection is handled below; refitting on every click would make the map jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, stops, showRoute]);

  // Selecting a stop lifts its pin and brings it into view.
  useEffect(() => {
    if (state !== 'ready') return;
    for (const s of stops) {
      const mk = markers.current.get(s.key);
      if (!mk) continue;
      mk.content = pinElement(s, s.key === selected);
      mk.zIndex = s.key === selected ? 10 : s.kind === 'stay' ? 5 : 1;
    }
    const s = stops.find((x) => x.key === selected);
    if (s) map.current?.panTo({ lat: s.lat, lng: s.lng });
  }, [selected, stops, state]);

  return (
    <div className="relative h-[60vh] min-h-80 overflow-hidden rounded-card bg-surface-column lg:h-[640px]">
      <div ref={box} className="absolute inset-0" aria-hidden="true" />
      {state === 'loading' && <Skeleton className="absolute inset-0 rounded-card" />}
      {state === 'error' && (
        <div className="absolute inset-0 flex items-center p-6">
          <ErrorState
            message="The map couldn't load. The list still shows every place."
            onRetry={() => {
              setState('loading');
              setAttempt((n) => n + 1);
            }}
          />
        </div>
      )}
    </div>
  );
}
