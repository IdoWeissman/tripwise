import { PubSub } from 'graphql-subscriptions';

export type TripEventKind =
  | 'ACTIVITY_PROPOSED'
  | 'ACTIVITY_UPDATED'
  | 'ACTIVITY_MOVED'
  | 'VOTE_CHANGED'
  | 'EXPENSE_CHANGED'
  | 'MEMBER_CHANGED'
  | 'BOOKING_CHANGED'
  | 'TRIP_DELETED';

export interface TripEvent {
  tripId: string;
  kind: TripEventKind;
  activityId: string | null;
  actorId: string | null;
}

export interface TripEventPayload {
  tripEvents: TripEvent;
}

// In-memory PubSub is fine for a single instance.
// Swap for graphql-redis-subscriptions (or Postgres LISTEN/NOTIFY) when scaling out.
export const pubsub = new PubSub<Record<string, TripEventPayload>>();

export const tripTopic = (tripId: string) => `TRIP_EVENTS:${tripId}`;

export function publishTripEvent(
  tripId: string,
  kind: TripEventKind,
  extra: { activityId?: string; actorId?: string | null } = {},
) {
  return pubsub.publish(tripTopic(tripId), {
    tripEvents: {
      tripId,
      kind,
      activityId: extra.activityId ?? null,
      actorId: extra.actorId ?? null,
    },
  });
}
