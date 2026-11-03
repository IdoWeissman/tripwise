import DataLoader from 'dataloader';
import type { Db } from '../db.js';
import type { User } from '../generated/prisma/client.js';

/** Per-request DataLoaders — batch N+1 lookups into single queries. */
export function createLoaders(db: Db, viewerId: string | null) {
  return {
    userById: new DataLoader<string, User | null>(async (ids) => {
      const users = await db.user.findMany({ where: { id: { in: [...ids] } } });
      const byId = new Map(users.map((u) => [u.id, u]));
      return ids.map((id) => byId.get(id) ?? null);
    }),

    voteCountByActivity: new DataLoader<string, number>(async (ids) => {
      const rows = await db.vote.groupBy({
        by: ['activityId'],
        where: { activityId: { in: [...ids] } },
        _count: { _all: true },
      });
      const byId = new Map(rows.map((r) => [r.activityId, r._count._all]));
      return ids.map((id) => byId.get(id) ?? 0);
    }),

    viewerVoted: new DataLoader<string, boolean>(async (ids) => {
      if (!viewerId) return ids.map(() => false);
      const rows = await db.vote.findMany({
        where: { userId: viewerId, activityId: { in: [...ids] } },
        select: { activityId: true },
      });
      const voted = new Set(rows.map((r) => r.activityId));
      return ids.map((id) => voted.has(id));
    }),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
