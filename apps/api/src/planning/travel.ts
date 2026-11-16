import type { Leg, TravelMode } from './plan.js';

export type GetAround = 'WALK_TRANSIT' | 'DRIVE';
export interface Point {
  lat: number;
  lng: number;
}

/** Travel times between every pair of points: `matrix[from][to]`, null when there's no route. */
export type Matrix = (Leg | null)[][];

const ROUTES_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';

/** Up to 10 points: 100 elements per request, the Routes limit for transit. */
export const MAX_POINTS = 10;

/**
 * Google Routes API, server side (the Places server key, with "Routes API" allowed). Asks only
 * for durations and distances (Compute Route Matrix Essentials).
 */
export function googleRoutes(opts: { apiKey: string; fetch?: typeof fetch }) {
  const doFetch = opts.fetch ?? fetch;
  return {
    async matrix(points: Point[], mode: TravelMode) {
      const waypoint = (p: Point) => ({
        waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } },
      });
      const res = await doFetch(ROUTES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': opts.apiKey,
          'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition',
        },
        body: JSON.stringify({
          origins: points.map(waypoint),
          destinations: points.map(waypoint),
          travelMode: mode === 'WALK' ? 'WALK' : mode === 'TRANSIT' ? 'TRANSIT' : 'DRIVE',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Google Routes ${res.status}`);
      const rows = (await res.json()) as {
        originIndex?: number;
        destinationIndex?: number;
        duration?: string;
        distanceMeters?: number;
        condition?: string;
      }[];
      const out: ({ minutes: number; meters: number | null } | null)[][] = points.map(() =>
        points.map(() => null),
      );
      for (const r of rows) {
        const o = r.originIndex ?? 0;
        const d = r.destinationIndex ?? 0;
        const seconds = Number.parseFloat(r.duration ?? '');
        if (r.condition === 'ROUTE_EXISTS' && Number.isFinite(seconds) && out[o])
          out[o]![d] = {
            minutes: Math.max(1, Math.round(seconds / 60)),
            meters: r.distanceMeters ?? null,
          };
      }
      return out;
    },
  };
}
export type GoogleRoutes = ReturnType<typeof googleRoutes>;

/** Straight-line distance in metres. */
export function metresBetween(a: Point, b: Point) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** A rough leg from distance alone: used without a Routes key, or when Routes fails. */
export function estimateLeg(a: Point, b: Point, getAround: GetAround): Leg {
  const m = metresBetween(a, b);
  if (getAround === 'DRIVE')
    return {
      minutes: Math.round(5 + ((m * 1.4) / 28_000) * 60),
      mode: 'DRIVE',
      meters: null,
      estimated: true,
    };
  const walk = Math.max(1, Math.round(((m * 1.3) / 4_800) * 60));
  const transit = Math.round(10 + ((m * 1.3) / 18_000) * 60);
  return walk <= 20 || walk <= transit
    ? { minutes: walk, mode: 'WALK', meters: null, estimated: true }
    : { minutes: transit, mode: 'TRANSIT', meters: null, estimated: true };
}

/** Matrices kept in memory for an hour so a day isn't paid for twice; never stored. */
const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: Matrix }>();
const keyOf = (points: Point[], getAround: GetAround) =>
  `${getAround}|${points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';')}`;

export function clearTravelCache() {
  cache.clear();
}

/**
 * Travel times between points for how the group gets around. With Routes: walking when the
 * walk is short (≤ 20 min) or quicker, otherwise transit; or driving. Without Routes, or if a
 * request fails, estimates from distance (marked `estimated`).
 */
export async function travelMatrix(
  points: Point[],
  getAround: GetAround,
  routes: GoogleRoutes | null,
): Promise<Matrix> {
  const estimate = (): Matrix =>
    points.map((a, i) => points.map((b, j) => (i === j ? null : estimateLeg(a, b, getAround))));
  if (points.length < 2) return estimate();
  if (!routes || points.length > MAX_POINTS) return estimate();
  const key = keyOf(points, getAround);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  try {
    let value: Matrix;
    if (getAround === 'DRIVE') {
      const drive = await routes.matrix(points, 'DRIVE');
      value = drive.map((row) =>
        row.map((c) =>
          c ? { minutes: c.minutes, mode: 'DRIVE', meters: c.meters, estimated: false } : null,
        ),
      );
    } else {
      const walk = await routes.matrix(points, 'WALK');
      // Transit only when some walk is long.
      const needsTransit = walk.some((row) => row.some((c) => c && c.minutes > 20));
      const transit = needsTransit ? await routes.matrix(points, 'TRANSIT') : null;
      value = walk.map((row, i) =>
        row.map((w, j): Leg | null => {
          const t = transit?.[i]?.[j] ?? null;
          if (w && (w.minutes <= 20 || !t || w.minutes <= t.minutes))
            return { minutes: w.minutes, mode: 'WALK', meters: w.meters, estimated: false };
          if (t) return { minutes: t.minutes, mode: 'TRANSIT', meters: t.meters, estimated: false };
          return i === j ? null : estimateLeg(points[i]!, points[j]!, getAround);
        }),
      );
    }
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.error('Travel times failed, estimating:', err instanceof Error ? err.message : err);
    return estimate();
  }
}
