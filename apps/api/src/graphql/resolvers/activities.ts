import { GraphQLError } from 'graphql';
import { matchBooking } from '../../bookings/match.js';
import { dateKey } from '../../lib/time.js';
import type { Resolvers } from '../__generated__/resolvers-types.js';
import { badInput, requireTripRole } from '../errors.js';
import { publishTripEvent, pubsub, tripTopic } from '../pubsub.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;

const notFound = () =>
  new GraphQLError('Activity not found', { extensions: { code: 'NOT_FOUND' } });

export const activityResolvers: Resolvers = {
  Mutation: {
    proposeActivity: async (_p, { input }, ctx) => {
      await requireTripRole(ctx, input.tripId, 'EDITOR');
      if (!input.title.trim()) throw badInput('Title is required.');
      if (input.startTime && !TIME_RE.test(input.startTime)) throw badInput('Use HH:mm for time.');
      if (input.costPerPerson && !MONEY_RE.test(input.costPerPerson)) {
        throw badInput('Cost must be a number with up to 2 decimals.');
      }
      if (input.dayId) {
        const day = await ctx.db.day.findUnique({ where: { id: input.dayId } });
        if (!day || day.tripId !== input.tripId)
          throw badInput('That day is not part of this trip.');
      }

      const schedule = input.scheduleNow === true;
      const position = schedule
        ? await ctx.db.activity.count({
            where: { tripId: input.tripId, dayId: input.dayId ?? null, status: 'SCHEDULED' },
          })
        : 0;

      const activity = await ctx.db.activity.create({
        data: {
          tripId: input.tripId,
          createdById: ctx.viewerId!,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          location: input.location?.trim() || null,
          dayId: input.dayId ?? null,
          startTime: input.startTime || null,
          costPerPerson: input.costPerPerson || null,
          status: schedule ? 'SCHEDULED' : 'PROPOSED',
          position,
        },
      });
      await publishTripEvent(activity.tripId, schedule ? 'ACTIVITY_UPDATED' : 'ACTIVITY_PROPOSED', {
        activityId: activity.id,
        actorId: ctx.viewerId,
      });
      return activity;
    },

    toggleVote: async (_p, { activityId }, ctx) => {
      const target = await ctx.db.activity.findUnique({
        where: { id: activityId },
        include: { trip: { select: { voteThreshold: true } } },
      });
      if (!target) throw notFound();
      await requireTripRole(ctx, target.tripId, 'EDITOR');
      if (target.status !== 'PROPOSED') throw badInput('Voting is closed for this activity.');
      const userId = ctx.viewerId!;

      const activity = await ctx.db.$transaction(async (tx) => {
        const key = { activityId_userId: { activityId, userId } };
        const existing = await tx.vote.findUnique({ where: key });
        if (existing) await tx.vote.delete({ where: key });
        else await tx.vote.create({ data: { activityId, userId } });

        const votes = await tx.vote.count({ where: { activityId } });
        if (votes >= target.trip.voteThreshold) {
          const position = await tx.activity.count({
            where: { tripId: target.tripId, dayId: target.dayId, status: 'SCHEDULED' },
          });
          return tx.activity.update({
            where: { id: activityId },
            data: { status: 'SCHEDULED', position },
          });
        }
        return tx.activity.findUniqueOrThrow({ where: { id: activityId } });
      });

      ctx.loaders.voteCountByActivity.clear(activityId);
      ctx.loaders.viewerVoted.clear(activityId);
      await publishTripEvent(activity.tripId, 'VOTE_CHANGED', { activityId, actorId: userId });
      return activity;
    },

    declineActivity: async (_p, { activityId }, ctx) => {
      const target = await ctx.db.activity.findUnique({ where: { id: activityId } });
      if (!target) throw notFound();
      await requireTripRole(ctx, target.tripId, 'OWNER');
      if (target.status !== 'PROPOSED') throw badInput('Only open proposals can be declined.');
      const activity = await ctx.db.activity.update({
        where: { id: activityId },
        data: { status: 'DECLINED' },
      });
      await publishTripEvent(activity.tripId, 'ACTIVITY_UPDATED', {
        activityId,
        actorId: ctx.viewerId,
      });
      return activity;
    },

    moveActivity: async (_p, { input }, ctx) => {
      const target = await ctx.db.activity.findUnique({ where: { id: input.activityId } });
      if (!target) throw notFound();
      await requireTripRole(ctx, target.tripId, 'EDITOR');
      if (target.status !== 'SCHEDULED') throw badInput('Only scheduled activities can be moved.');
      const toDayId = input.dayId ?? null;
      if (toDayId) {
        const day = await ctx.db.day.findUnique({ where: { id: toDayId } });
        if (!day || day.tripId !== target.tripId)
          throw badInput('That day is not part of this trip.');
      }

      const activity = await ctx.db.$transaction(async (tx) => {
        const siblings = await tx.activity.findMany({
          where: {
            tripId: target.tripId,
            dayId: toDayId,
            status: 'SCHEDULED',
            NOT: { id: target.id },
          },
          orderBy: [{ position: 'asc' }, { startTime: 'asc' }],
          select: { id: true },
        });
        const index = Math.max(0, Math.min(input.position, siblings.length));
        const ordered = [...siblings.map((s) => s.id)];
        ordered.splice(index, 0, target.id);
        for (const [position, id] of ordered.entries()) {
          await tx.activity.update({
            where: { id },
            data: id === target.id ? { position, dayId: toDayId } : { position },
          });
        }

        // Close the gap in the day it came from.
        if (target.dayId !== toDayId) {
          const source = await tx.activity.findMany({
            where: { tripId: target.tripId, dayId: target.dayId, status: 'SCHEDULED' },
            orderBy: { position: 'asc' },
            select: { id: true },
          });
          for (const [position, { id }] of source.entries()) {
            await tx.activity.update({ where: { id }, data: { position } });
          }
        }
        return tx.activity.findUniqueOrThrow({ where: { id: target.id } });
      });

      await publishTripEvent(activity.tripId, 'ACTIVITY_MOVED', {
        activityId: activity.id,
        actorId: ctx.viewerId,
      });
      return activity;
    },
  },

  Subscription: {
    tripEvents: {
      subscribe: async (_p, { tripId }, ctx) => {
        await requireTripRole(ctx, tripId);
        return pubsub.asyncIterableIterator(tripTopic(tripId));
      },
    },
  },

  Activity: {
    costPerPerson: (a) => a.costPerPerson?.toFixed(2) ?? null,
    createdBy: async (a, _args, ctx) => {
      const user = await ctx.loaders.userById.load(a.createdById);
      if (!user) throw new Error(`User ${a.createdById} not found`);
      return user;
    },
    voteCount: (a, _args, ctx) => ctx.loaders.voteCountByActivity.load(a.id),
    viewerHasVoted: (a, _args, ctx) => ctx.loaders.viewerVoted.load(a.id),
    voters: (a, _args, ctx) => ctx.loaders.votersByActivity.load(a.id),
    booking: async (a, _args, ctx) => {
      if (a.status !== 'SCHEDULED' || !a.dayId) return null;
      const [day, trip, bookings] = await Promise.all([
        ctx.loaders.dayById.load(a.dayId),
        ctx.loaders.tripById.load(a.tripId),
        ctx.loaders.bookingsByTrip.load(a.tripId),
      ]);
      if (!day || !trip) return null;
      return matchBooking(a, dateKey(day.date), bookings, trip.timeZone);
    },
  },
};
