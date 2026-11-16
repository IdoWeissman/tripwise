import { matchBooking } from '../bookings/match.js';
import { stayNight } from '../bookings/service.js';
import type { Env } from '../config.js';
import type { Activity, Day, Place } from '../generated/prisma/client.js';
import type { Context } from '../graphql/context.js';
import { localDate, localTime, zoneOffsetMinutes } from '../lib/time.js';
import type { PlanInfo, PlacesClient } from '../places/google.js';
import { matchBookingPlace } from '../places/service.js';
import { arrangeDay, hhmm, kindOf, planDay, toMinutes, type DayInput } from './plan.js';
import { googleRoutes, travelMatrix, type Point } from './travel.js';

/** Routes uses the Places server key (with "Routes API" allowed on it). */
export function routesFromEnv(env: Pick<Env, 'GOOGLE_PLACES_API_KEY'>, fetchImpl?: typeof fetch) {
  return env.GOOGLE_PLACES_API_KEY
    ? googleRoutes({ apiKey: env.GOOGLE_PLACES_API_KEY, fetch: fetchImpl })
    : null;
}

/** Hours and type kept in memory for an hour so checking a day twice isn't billed twice. */
const INFO_TTL_MS = 60 * 60 * 1000;
const infoCache = new Map<string, { at: number; value: PlanInfo | null }>();

async function planInfo(places: PlacesClient, googlePlaceId: string) {
  const hit = infoCache.get(googlePlaceId);
  if (hit && Date.now() - hit.at < INFO_TTL_MS) return hit.value;
  try {
    const value = await places.planInfo(googlePlaceId);
    if (infoCache.size > 2000) infoCache.delete(infoCache.keys().next().value!);
    infoCache.set(googlePlaceId, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.warn('Opening hours failed:', err instanceof Error ? err.message.slice(0, 120) : err);
    return null;
  }
}

export function clearPlanInfoCache() {
  infoCache.clear();
}

/** The flight margins the reminders use: 90 min from landing to the city, 2 h 30 min before take-off. */
const AFTER_LANDING = 90;
const BEFORE_DEPARTURE = 150;
/** A booking without an end time blocks this long. */
const BLOCK_MINUTES = 120;

export type DayActivity = Activity & { place: Place | null };

export interface GatheredDay {
  input: DayInput;
  /** The day's scheduled activities in the order the board shows them. */
  activities: DayActivity[];
  freeFrom: string | null;
  freeUntil: string | null;
}

/** Board order: activities with a time by time, then the rest in their saved order. */
export const boardOrder = <A extends { startTime: string | null; position: number }>(list: A[]) =>
  [...list].sort(
    (a, b) =>
      (a.startTime ? 0 : 1) - (b.startTime ? 0 : 1) ||
      (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
      a.position - b.position,
  );

/** Everything the planner needs about one day: stops, the stay, flights, booked events, travel. */
export async function gatherDay(ctx: Context, day: Day): Promise<GatheredDay> {
  const trip = (await ctx.loaders.tripById.load(day.tripId))!;
  const tz = trip.timeZone;
  const date = day.date.toISOString().slice(0, 10);
  const [rows, bookings] = await Promise.all([
    ctx.db.activity.findMany({
      where: { dayId: day.id, status: 'SCHEDULED' },
      include: { place: true },
    }),
    ctx.loaders.bookingsByTrip.load(day.tripId),
  ]);
  const activities = boardOrder(rows);

  // Where the group sleeps anchors the day.
  const stay = stayNight(bookings, date, tz);
  let stayPlace: Place | null = null;
  if (stay?.booking.placeId) stayPlace = await ctx.loaders.placeById.load(stay.booking.placeId);
  else if (stay && ctx.places)
    stayPlace = await matchBookingPlace(ctx.db, ctx.places, stay.booking);

  // Travel points: the stay first, then each distinct place.
  const points: Point[] = [];
  const pointOf = new Map<string, number>();
  const addPoint = (p: Place) => {
    if (!pointOf.has(p.id)) {
      pointOf.set(p.id, points.length);
      points.push({ lat: p.lat, lng: p.lng });
    }
    return pointOf.get(p.id)!;
  };
  const anchor = stayPlace ? addPoint(stayPlace) : null;
  activities.forEach((a) => a.place && addPoint(a.place));

  const [matrix, infos] = await Promise.all([
    travelMatrix(points, trip.getAround, ctx.routes),
    Promise.all(
      activities.map((a) =>
        a.place && ctx.places ? planInfo(ctx.places, a.place.googlePlaceId) : null,
      ),
    ),
  ]);

  // Bookings: a plan that stands for a booking keeps its time; other timed bookings block time;
  // flights set when the day can start and must end.
  const booked = new Set<string>();
  const fixed = activities.map((a) => {
    const b = matchBooking(a, date, bookings, tz);
    if (b) booked.add(b.id);
    return Boolean(b);
  });
  const inTrip = (at: Date, zone: string | null) =>
    zone !== null && zoneOffsetMinutes(at, zone) === zoneOffsetMinutes(at, tz);
  let from: DayInput['from'] = null;
  let until: DayInput['until'] = null;
  const blocks: NonNullable<DayInput['blocks']> = [];
  for (const b of bookings) {
    if (b.status === 'CANCELLED' || b.type === 'STAY' || booked.has(b.id)) continue;
    if (b.type === 'FLIGHT') {
      for (const s of b.segments ?? []) {
        if (s.arrivesAt && localDate(s.arrivesAt, tz) === date && inTrip(s.arrivesAt, s.arriveTz)) {
          const lands = toMinutes(localTime(s.arrivesAt, tz));
          if (!from || lands + AFTER_LANDING > from.at)
            from = { at: lands + AFTER_LANDING, reason: `the flight lands at ${hhmm(lands)}` };
        }
        if (localDate(s.departsAt, tz) === date && inTrip(s.departsAt, s.departTz)) {
          const leaves = toMinutes(localTime(s.departsAt, tz));
          if (!until || leaves - BEFORE_DEPARTURE < until.at)
            until = {
              at: leaves - BEFORE_DEPARTURE,
              reason: `leave for the airport by ${hhmm(leaves - BEFORE_DEPARTURE)} (flight at ${hhmm(leaves)})`,
            };
        }
      }
      continue;
    }
    if (!b.startsAt || localDate(b.startsAt, tz) !== date) continue;
    const start = toMinutes(localTime(b.startsAt, tz));
    const end =
      b.endsAt && localDate(b.endsAt, tz) === date
        ? toMinutes(localTime(b.endsAt, tz))
        : start + BLOCK_MINUTES;
    blocks.push({ title: b.title, from: start, until: Math.max(end, start + 15) });
  }

  const input: DayInput = {
    weekday: day.date.getUTCDay(),
    pace: trip.pace,
    anchor,
    travel: (a, b) => matrix[a]?.[b] ?? null,
    from,
    until,
    blocks,
    stops: activities.map((a, i) => {
      const info = infos[i];
      return {
        id: a.id,
        title: a.title,
        startTime: a.startTime,
        durationMinutes: a.durationMinutes,
        fixed: fixed[i]!,
        point: a.place ? pointOf.get(a.place.id)! : null,
        kind: kindOf(info?.primaryType),
        hours: info?.periods.length ? info.periods : null,
      };
    }),
  };
  return {
    input,
    activities,
    freeFrom: from ? hhmm(from.at) : null,
    freeUntil: until ? hhmm(until.at) : null,
  };
}

const memo = new WeakMap<Context, Map<string, Promise<GatheredDay>>>();
/** One gather per day per request (plan and arrangement share it). */
export function gatherDayOnce(ctx: Context, day: Day) {
  let m = memo.get(ctx);
  if (!m) memo.set(ctx, (m = new Map()));
  let p = m.get(day.id);
  if (!p) m.set(day.id, (p = gatherDay(ctx, day)));
  return p;
}

export { arrangeDay, planDay };
