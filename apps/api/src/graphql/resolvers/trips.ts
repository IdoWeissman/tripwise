import type { Resolvers } from '../__generated__/resolvers-types.js';
import { badInput, requireTripRole, requireViewer } from '../errors.js';
import { isValidZone } from '../../lib/time.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const tripResolvers: Resolvers = {
  Query: {
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
    createTrip: async (_p, { input }, ctx) => {
      const userId = requireViewer(ctx);
      const start = input.startDate;
      const end = input.endDate;
      if (end < start) throw badInput('End date must be on or after the start date.');
      const dayCount = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
      if (dayCount > 60) throw badInput('Trips can be at most 60 days long.');

      return ctx.db.trip.create({
        data: {
          name: input.name.trim(),
          destination: input.destination.trim(),
          startDate: start,
          endDate: end,
          currency: input.currency ?? 'EUR',
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
