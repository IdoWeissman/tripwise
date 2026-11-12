import { signInvite, verifyInvite } from '../../auth/tokens.js';
import type { Resolvers } from '../__generated__/resolvers-types.js';
import { badInput, forbidden, requireTripRole, requireViewer } from '../errors.js';
import { publishTripEvent } from '../pubsub.js';

const invalidInvite = () => badInput('This invite link is invalid or has expired.');

export const memberResolvers: Resolvers = {
  Query: {
    invitePreview: async (_p, { token }, ctx) => {
      const invite = verifyInvite(token, ctx.env.JWT_SECRET);
      if (!invite) return null;
      const [trip, inviter] = await Promise.all([
        ctx.db.trip.findUnique({ where: { id: invite.tripId } }),
        ctx.loaders.userById.load(invite.inv),
      ]);
      if (!trip) return null;
      const alreadyMember = ctx.viewerId
        ? !!(await ctx.db.tripMember.findUnique({
            where: { tripId_userId: { tripId: trip.id, userId: ctx.viewerId } },
          }))
        : false;
      return {
        tripId: trip.id,
        tripName: trip.name,
        destination: trip.destination,
        role: invite.role,
        invitedBy: inviter?.name ?? 'A friend',
        alreadyMember,
      };
    },
  },

  Mutation: {
    createInviteLink: async (_p, { tripId, role }, ctx) => {
      await requireTripRole(ctx, tripId, 'OWNER');
      if (role === 'OWNER') throw badInput('Invites can grant Editor or Viewer access.');
      // Links are stateless tokens; remember that one was shared so the setup checklist can tick it.
      await ctx.db.tripMember.updateMany({
        where: { tripId, userId: ctx.viewerId!, inviteSharedAt: null },
        data: { inviteSharedAt: new Date() },
      });
      return signInvite({ tripId, role, inv: ctx.viewerId! }, ctx.env.JWT_SECRET);
    },

    joinTrip: async (_p, { token }, ctx) => {
      const userId = requireViewer(ctx);
      const invite = verifyInvite(token, ctx.env.JWT_SECRET);
      if (!invite) throw invalidInvite();
      const trip = await ctx.db.trip.findUnique({ where: { id: invite.tripId } });
      if (!trip) throw invalidInvite();

      const existing = await ctx.db.tripMember.findUnique({
        where: { tripId_userId: { tripId: trip.id, userId } },
      });
      if (!existing) {
        await ctx.db.tripMember.create({ data: { tripId: trip.id, userId, role: invite.role } });
        await publishTripEvent(trip.id, 'MEMBER_CHANGED', { actorId: userId });
      }
      return trip;
    },

    updateMemberRole: async (_p, { tripId, userId, role }, ctx) => {
      await requireTripRole(ctx, tripId, 'OWNER');
      if (userId === ctx.viewerId) throw badInput("You can't change your own role.");
      if (role === 'OWNER') throw badInput('Each trip has a single owner.');
      const member = await ctx.db.tripMember.update({
        where: { tripId_userId: { tripId, userId } },
        data: { role },
      });
      await publishTripEvent(tripId, 'MEMBER_CHANGED', { actorId: ctx.viewerId });
      return member;
    },

    removeMember: async (_p, { tripId, userId }, ctx) => {
      const role = await requireTripRole(ctx, tripId);
      const isSelf = userId === ctx.viewerId;
      if (!isSelf && role !== 'OWNER') throw forbidden('Only the owner can remove members.');
      if (isSelf && role === 'OWNER') throw badInput("The owner can't leave the trip.");

      const balance = (await ctx.loaders.ledgerByTrip.load(tripId)).balances.get(userId) ?? 0;
      if (balance !== 0) throw badInput('Settle up this member’s balance before removing them.');

      await ctx.db.tripMember.delete({ where: { tripId_userId: { tripId, userId } } });
      await publishTripEvent(tripId, 'MEMBER_CHANGED', { actorId: ctx.viewerId });
      return true;
    },
  },
};
