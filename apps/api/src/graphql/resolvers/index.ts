import { DateResolver, DateTimeResolver } from 'graphql-scalars';
import type { Resolvers } from '../__generated__/resolvers-types.js';
import { activityResolvers } from './activities.js';
import { authResolvers } from './auth.js';
import { tripResolvers } from './trips.js';

const parts: Resolvers[] = [authResolvers, tripResolvers, activityResolvers];

/** Shallow-merges resolver maps per type. */
export const resolvers: Resolvers = parts.reduce<Resolvers>(
  (acc, part) => {
    for (const [type, fields] of Object.entries(part)) {
      const key = type as keyof Resolvers;
      acc[key] = { ...(acc[key] as object), ...(fields as object) } as never;
    }
    return acc;
  },
  { Date: DateResolver, DateTime: DateTimeResolver },
);
