import { PubSub } from 'graphql-subscriptions';
import type { Activity } from '../generated/prisma/client.js';

export type TripEventKind = 'ACTIVITY_PROPOSED' | 'ACTIVITY_UPDATED' | 'VOTE_CHANGED';

export interface TripEventPayload {
  tripEvents: { tripId: string; kind: TripEventKind; activity: Activity };
}

// In-memory PubSub is fine for a single instance.
// Swap for graphql-redis-subscriptions (or Postgres LISTEN/NOTIFY) when scaling out.
export const pubsub = new PubSub<Record<string, TripEventPayload>>();

export const tripTopic = (tripId: string) => `TRIP_EVENTS:${tripId}`;

export function publishTripEvent(tripId: string, kind: TripEventKind, activity: Activity) {
  return pubsub.publish(tripTopic(tripId), { tripEvents: { tripId, kind, activity } });
}
