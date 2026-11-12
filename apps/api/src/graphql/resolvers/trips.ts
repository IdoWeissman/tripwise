import type { Resolvers } from '../__generated__/resolvers-types.js';
import { badInput, forbidden, requireTripRole, requireViewer } from '../errors.js';
import { isValidZone } from '../../lib/time.js';
import { publishTripEvent } from '../pubsub.js';
import { searchPlaces } from '../../places/search.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const tripResolvers: Resolvers = {
  Query: {
    placeSearch: async (_p, { query }, ctx) => {
      requireViewer(ctx);
      try {
        return await searchPlaces(query);
      } catch {
        // Suggestions are a convenience: when the geocoder is down, free text still works.
        return [];
      }
    },
    trips: (_p, _a, ctx) => {
      const userId = requireViewer(ctx);
      return ctx.db.trip.findMany({
        where: { members: { some: { userId } } },
        orderBy: { startDate: 'asc' },
      });
    },
    trip: async (_p, { id }, ctx) => {
      await requireTripRole(ctx, id);
      return ctx.db.trip.findUnique({ where: { id } });
    },
  },

  Mutation: {
    hideTripSetup: async (_p, { tripId }, ctx) => {
      await requireTripRole(ctx, tripId);
      await ctx.db.tripMember.update({
        where: { tripId_userId: { tripId, userId: ctx.viewerId! } },
        data: { setupHiddenAt: new Date() },
      });
      return ctx.db.trip.findUniqueOrThrow({ where: { id: tripId } });
    },
    createTrip: async (_p, { input }, ctx) => {
      const userId = requireViewer(ctx);
      const start = input.startDate;
      const end = input.endDate;
      if (end < start) throw badInput('End date must be on or after the start date.');
      const dayCount = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
      if (dayCount > 60) throw badInput('Trips can be at most 60 days long.');
      const currency = input.currency?.trim().toUpperCase();
      if (currency && !/^[A-Z]{3}$/.test(currency))
        throw badInput('Currency must be a 3-letter code.');

      return ctx.db.trip.create({
        data: {
          name: input.name.trim(),
          destination: input.destination.trim(),
          startDate: start,
          endDate: end,
          currency: currency ?? 'EUR',
          timeZone: input.timeZone && isValidZone(input.timeZone) ? input.timeZone : 'UTC',
          members: { create: { userId, role: 'OWNER' } },
          days: {
            create: Array.from({ length: dayCount }, (_, i) => ({
              position: i,
              date: new Date(start.getTime() + i * DAY_MS),
            })),
          },
        },
      });
    },

    deleteTrip: async (_p, { id }, ctx) => {
      await requireTripRole(ctx, id, 'OWNER');
      // Rows go with the trip (ON DELETE CASCADE); stored files have to be removed explicitly.
      const files = await ctx.db.attachment.findMany({
        where: { tripId: id },
        select: { storageKey: true },
      });
      await ctx.db.trip.delete({ where: { id } });
      await Promise.all(
        files.map((f) =>
          ctx.storage
            .delete(f.storageKey)
            .catch((err) => console.warn('Could not delete stored file', f.storageKey, err)),
        ),
      );
      // Members looking at the trip are sent back to their trips list.
      await publishTripEvent(id, 'TRIP_DELETED', { actorId: ctx.viewerId });
      return true;
    },
  },

  Trip: {
    members: (trip, _a, ctx) =>
      ctx.db.tripMember.findMany({ where: { tripId: trip.id }, orderBy: { joinedAt: 'asc' } }),
    days: (trip, _a, ctx) =>
      ctx.db.day.findMany({ where: { tripId: trip.id }, orderBy: { position: 'asc' } }),
    proposals: (trip, { status }, ctx) =>
      ctx.db.activity.findMany({
        where: { tripId: trip.id, status: status ?? 'PROPOSED' },
        orderBy: { createdAt: 'desc' },
      }),
    proposalCounts: async (trip, _a, ctx) => {
      const rows = await ctx.db.activity.groupBy({
        by: ['status'],
        where: { tripId: trip.id },
        _count: { _all: true },
      });
      const count = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
      return {
        proposed: count('PROPOSED'),
        scheduled: count('SCHEDULED'),
        declined: count('DECLINED'),
      };
    },
    unplannedActivities: (trip, _a, ctx) =>
      ctx.db.activity.findMany({
        where: { tripId: trip.id, status: 'SCHEDULED', dayId: null },
        orderBy: { position: 'asc' },
      }),
    myRole: (trip, _a, ctx) => requireTripRole(ctx, trip.id),
    // One member query covers auth, the viewer's flags and the head count; bookings and the
    // ledger come from the per-request loaders Today already uses, so nothing is fetched twice.
    setup: async (trip, _a, ctx) => {
      const userId = requireViewer(ctx);
      const members = await ctx.db.tripMember.findMany({
        where: { tripId: trip.id },
        select: { userId: true, inviteSharedAt: true, setupHiddenAt: true },
      });
      const me = members.find((m) => m.userId === userId);
      if (!me) throw forbidden();
      const hasInvited = members.length > 1 || !!me.inviteSharedAt;
      if (me.setupHiddenAt) {
        return { hasBookings: true, hasInvited, hasExpenses: true, hidden: true };
      }
      const [bookings, ledger] = await Promise.all([
        ctx.loaders.bookingsByTrip.load(trip.id),
        ctx.loaders.ledgerByTrip.load(trip.id),
      ]);
      return {
        hasBookings: bookings.length > 0,
        hasInvited,
        // totalCents leaves out settle-up payments, which aren't expenses.
        hasExpenses: ledger.totalCents > 0,
        hidden: false,
      };
    },
  },

  TripMember: {
    user: async (member, _a, ctx) => {
      const user = await ctx.loaders.userById.load(member.userId);
      if (!user) throw new Error(`User ${member.userId} not found`);
      return user;
    },
  },

  Day: {
    activities: (day, _a, ctx) =>
      ctx.db.activity.findMany({
        where: { dayId: day.id, status: 'SCHEDULED' },
        orderBy: [{ position: 'asc' }, { startTime: 'asc' }],
      }),
  },
};
