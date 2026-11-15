import type { Env } from '../config.js';
import type { Db } from '../db.js';
import type { Place } from '../generated/prisma/client.js';
import { googlePlaces, isGooglePlaceId, type PlacesClient } from './google.js';

/** Google's terms: coordinates may be kept for up to 30 days. */
export const COORDS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** A stay whose address didn't match is tried again after this long, not on every view. */
const LOOKUP_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

export function placesFromEnv(
  env: Pick<Env, 'GOOGLE_PLACES_API_KEY'>,
  fetchImpl?: typeof fetch,
): PlacesClient | null {
  return env.GOOGLE_PLACES_API_KEY
    ? googlePlaces({ apiKey: env.GOOGLE_PLACES_API_KEY, fetch: fetchImpl })
    : null;
}

/**
 * The stored place for a Google place ID, created on first use. Coordinates come from Google
 * (never from the browser), so a pin can't be placed somewhere the place isn't.
 */
export async function ensurePlace(
  db: Db,
  places: PlacesClient,
  googlePlaceId: string,
  known?: { lat: number; lng: number },
): Promise<Place | null> {
  if (!isGooglePlaceId(googlePlaceId)) return null;
  const existing = await db.place.findUnique({ where: { googlePlaceId } });
  if (existing && Date.now() - existing.coordsAt.getTime() < COORDS_MAX_AGE_MS) return existing;
  const found = known ?? (await places.location(googlePlaceId));
  if (!found) return existing;
  // Only the coordinates: names and addresses may not be stored (Google's terms).
  const coords = { lat: found.lat, lng: found.lng, coordsAt: new Date() };
  return db.place.upsert({
    where: { googlePlaceId },
    create: { googlePlaceId, ...coords },
    update: coords,
  });
}

/** Refreshes coordinates older than 30 days; falls back to the stored ones if Google is down. */
export async function freshPlace(
  db: Db,
  places: PlacesClient | null,
  place: Place,
): Promise<Place> {
  if (!places || Date.now() - place.coordsAt.getTime() < COORDS_MAX_AGE_MS) return place;
  try {
    return (await ensurePlace(db, places, place.googlePlaceId)) ?? place;
  } catch {
    return place;
  }
}

/**
 * Finds where a stay is from its address, once. The result (or the failed try) is remembered so
 * the itinerary doesn't search Google on every view.
 */
export async function matchStay(
  db: Db,
  places: PlacesClient,
  booking: {
    id: string;
    type: string;
    title: string;
    address: string | null;
    location: string | null;
    placeId: string | null;
    placeLookupAt: Date | null;
  },
): Promise<Place | null> {
  if (booking.type !== 'STAY' || booking.placeId) return null;
  if (booking.placeLookupAt && Date.now() - booking.placeLookupAt.getTime() < LOOKUP_RETRY_MS)
    return null;
  const where = booking.address ?? booking.location;
  if (!where) return null;
  let place: Place | null = null;
  try {
    const [top] = await places.search(`${booking.title}, ${where}`);
    if (top) place = await ensurePlace(db, places, top.googlePlaceId, top);
  } catch (err) {
    console.warn('Stay lookup failed:', err instanceof Error ? err.message : err);
  }
  await db.booking.update({
    where: { id: booking.id },
    data: { placeLookupAt: new Date(), ...(place ? { placeId: place.id } : {}) },
  });
  return place;
}
