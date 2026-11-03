import { GraphQLError } from 'graphql';
import type { Resolvers } from '../__generated__/resolvers-types.js';
import { badInput, requireTripRole } from '../errors.js';
import { publishTripEvent, pubsub, tripTopic } from '../pubsub.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;

export const activityResolvers: Resolvers = {
  Mutation: {
    proposeActivity: async (_p, { input }, ctx) => {
      await requireTripRole(ctx, input.tripId, 'EDITOR');
      if (!input.title.trim()) throw badInput('Title is required.');
      if (input.startTime && !TIME_RE.test(input.startTime)) throw badInput('Use HH:mm for time.');
      if (input.costPerPerson && !MONEY_RE.test(input.costPerPerson)) {
        throw badInput('Cost must be a number with up to 2 decimals.');
      }

      const activity = await ctx.db.activity.create({
        data: {
          tripId: input.tripId,
          createdById: ctx.viewerId!,
          title: input.title.trim(),
          description: input.description ?? null,
          location: input.location ?? null,
          dayId: input.dayId ?? null,
          startTime: input.startTime ?? null,
          costPerPerson: input.costPerPerson ?? null,
        },
      });
      await publishTripEvent(activity.tripId, 'ACTIVITY_PROPOSED', activity);
      return activity;
    },

    toggleVote: async (_p, { activityId }, ctx) => {
      const target = await ctx.db.activity.findUnique({
        where: { id: activityId },
        include: { trip: { select: { voteThreshold: true } } },
      });
      if (!target)
        throw new GraphQLError('Activity not found', { extensions: { code: 'NOT_FOUND' } });
      await requireTripRole(ctx, target.tripId, 'EDITOR');
      const userId = ctx.viewerId!;

      const activity = await ctx.db.$transaction(async (tx) => {
        const key = { activityId_userId: { activityId, userId } };
        const existing = await tx.vote.findUnique({ where: key });
        if (existing) await tx.vote.delete({ where: key });
        else await tx.vote.create({ data: { activityId, userId } });

        const votes = await tx.vote.count({ where: { activityId } });
        if (target.status === 'PROPOSED' && votes >= target.trip.voteThreshold) {
          return tx.activity.update({ where: { id: activityId }, data: { status: 'SCHEDULED' } });
        }
        return tx.activity.findUniqueOrThrow({ where: { id: activityId } });
      });

      ctx.loaders.voteCountByActivity.clear(activityId);
      ctx.loaders.viewerVoted.clear(activityId);
      await publishTripEvent(activity.tripId, 'VOTE_CHANGED', activity);
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
  },
};
