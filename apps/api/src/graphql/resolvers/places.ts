import type { PlaceDetails } from '../../places/google.js';
import { ensurePlace, freshPlace, matchStay } from '../../places/service.js';
import type { Context } from '../context.js';
import { badInput, requireTripRole, requireViewer } from '../errors.js';
import type { Resolvers } from '../__generated__/resolvers-types.js';

/** Live details, fetched once per request per place (never stored: Google's terms). */
const detailsMemo = new WeakMap<Context, Map<string, Promise<PlaceDetails | null>>>();
function detailsFor(ctx: Context, googlePlaceId: string) {
  if (!ctx.places) return Promise.resolve(null);
  let memo = detailsMemo.get(ctx);
  if (!memo) detailsMemo.set(ctx, (memo = new Map()));
  let pending = memo.get(googlePlaceId);
  if (!pending) {
    pending = ctx.places.details(googlePlaceId).catch((err: unknown) => {
      console.warn('Place details failed:', err instanceof Error ? err.message : err);
      return null;
    });
    memo.set(googlePlaceId, pending);
  }
  return pending;
}

/** "time out market" in a Lisbon trip searches "time out market, Lisbon, Portugal". */
export function nearDestination(query: string, destination: string): string {
  const q = query.trim();
  const city = destination.split(',')[0]!.trim().toLowerCase();
  return city && !q.toLowerCase().includes(city) ? `${q}, ${destination}` : q;
}

/** Resolves a Google place id to our stored place, or explains why it can't be used. */
export async function placeForInput(ctx: Context, googlePlaceId: string) {
  if (!ctx.places) throw badInput('Place search isn’t set up on this server.');
  const place = await ensurePlace(ctx.db, ctx.places, googlePlaceId).catch(() => null);
  if (!place) throw badInput('That place couldn’t be found. Try searching again.');
  return place;
}

export const placeResolvers: Resolvers = {
  Query: {
    placeSuggestions: async (_p, { tripId, query }, ctx) => {
      await requireTripRole(ctx, tripId, 'EDITOR');
      const q = query.trim();
      if (q.length < 2 || q.length > 120 || !ctx.places) return [];
      const trip = await ctx.db.trip.findUniqueOrThrow({ where: { id: tripId } });
      try {
        return await ctx.places.search(nearDestination(q, trip.destination));
      } catch (err) {
        // Suggestions are a convenience: when Google is down, free text still works.
        console.warn('Place search failed:', err instanceof Error ? err.message : err);
        return [];
      }
    },
    place: async (_p, { tripId, id }, ctx) => {
      await requireTripRole(ctx, tripId, 'VIEWER');
      // Only places this trip uses: an id alone doesn't open any place in the database.
      const used = await ctx.db.place.findFirst({
        where: {
          id,
          OR: [{ activities: { some: { tripId } } }, { bookings: { some: { tripId } } }],
        },
      });
      return used ? freshPlace(ctx.db, ctx.places, used) : null;
    },
    maps: (_p, _a, ctx) => {
      requireViewer(ctx);
      return {
        placesEnabled: ctx.places !== null,
        mapEnabled: Boolean(ctx.env.GOOGLE_MAPS_BROWSER_KEY),
        browserKey: ctx.env.GOOGLE_MAPS_BROWSER_KEY ?? null,
        mapId: ctx.env.GOOGLE_MAPS_MAP_ID,
      };
    },
  },
  Place: {
    details: (p, _a, ctx) => detailsFor(ctx, p.googlePlaceId),
  },
  PlaceDetails: {
    photoUrl: async (d, _a, ctx) =>
      d.photoName && ctx.places ? ctx.places.photoUrl(d.photoName).catch(() => null) : null,
  },
  Activity: {
    place: async (a, _a, ctx) => {
      if (!a.placeId) return null;
      const place = await ctx.loaders.placeById.load(a.placeId);
      return place ? freshPlace(ctx.db, ctx.places, place) : null;
    },
  },
  Booking: {
    place: async (b, _a, ctx) => {
      if (b.placeId) {
        const place = await ctx.loaders.placeById.load(b.placeId);
        return place ? freshPlace(ctx.db, ctx.places, place) : null;
      }
      return ctx.places ? matchStay(ctx.db, ctx.places, b) : null;
    },
  },
};
