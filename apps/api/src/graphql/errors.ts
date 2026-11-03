import { GraphQLError } from 'graphql';
import type { Context } from './context.js';
import type { TripRole } from '../generated/prisma/client.js';

export const unauthenticated = () =>
  new GraphQLError('You must be signed in.', { extensions: { code: 'UNAUTHENTICATED' } });

export const forbidden = (message = 'You do not have access to this trip.') =>
  new GraphQLError(message, { extensions: { code: 'FORBIDDEN' } });

export const badInput = (message: string) =>
  new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });

export function requireViewer(ctx: Context): string {
  if (!ctx.viewerId) throw unauthenticated();
  return ctx.viewerId;
}

const RANK: Record<TripRole, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

/** Ensures the viewer is a member of the trip with at least `minRole`. Returns their role. */
export async function requireTripRole(ctx: Context, tripId: string, minRole: TripRole = 'VIEWER') {
  const userId = requireViewer(ctx);
  const member = await ctx.db.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
  });
  if (!member) throw forbidden();
  if (RANK[member.role] < RANK[minRole]) throw forbidden('Your role does not allow this action.');
  return member.role;
}
