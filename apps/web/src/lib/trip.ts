import { useMemo } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { graphql } from '../gql';
import type { TripShellQuery } from '../gql/graphql';

export const TripShellDocument = graphql(`
  query TripShell($id: ID!) {
    me {
      id
      name
    }
    trip(id: $id) {
      id
      name
      destination
      startDate
      endDate
      currency
      voteThreshold
      myRole
      proposalCounts {
        proposed
      }
      members {
        role
        joinedAt
        user {
          id
          name
          email
        }
      }
    }
  }
`);

export const TripEventsDocument = graphql(`
  subscription TripEvents($tripId: ID!) {
    tripEvents(tripId: $tripId) {
      kind
      activityId
      actorId
    }
  }
`);

export type TripShell = NonNullable<TripShellQuery['trip']>;

export interface TripContext {
  trip: TripShell;
  viewerId: string;
  /** userId → join-order index, so a member keeps the same avatar color everywhere (rules §1.1). */
  memberIndex: Map<string, number>;
  canEdit: boolean;
  isOwner: boolean;
}

export function buildMemberIndex(members: { user: { id: string } }[]) {
  return new Map(members.map((m, i) => [m.user.id, i]));
}

export function useTripId(): string {
  const { tripId } = useParams();
  if (!tripId) throw new Error('useTripId used outside /trips/:tripId');
  return tripId;
}

export const useTrip = () => useOutletContext<TripContext>();

export function useMemberIndexOf() {
  const { memberIndex } = useTrip();
  return useMemo(() => (userId: string) => memberIndex.get(userId) ?? 0, [memberIndex]);
}
