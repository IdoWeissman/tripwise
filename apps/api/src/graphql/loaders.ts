import DataLoader from 'dataloader';
import type { Db } from '../db.js';
import type { ExpenseSplit, User } from '../generated/prisma/client.js';
import { computeBalances, decimalToCents, settleUp, type Transfer } from '../lib/money.js';
import type { ExpenseModel } from './models.js';

export const SETTLEMENT_CATEGORY = 'Settlement';

export interface Ledger {
  expenses: ExpenseModel[];
  balances: Map<string, number>;
  settlements: Transfer[];
  totalCents: number;
  paidCentsByUser: Map<string, number>;
}

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

    splitsByExpense: new DataLoader<string, ExpenseSplit[]>(async (ids) => {
      const rows = await db.expenseSplit.findMany({ where: { expenseId: { in: [...ids] } } });
      return ids.map((id) => rows.filter((r) => r.expenseId === id));
    }),

    /** Everything money-related for a trip, computed once per request. */
    ledgerByTrip: new DataLoader<string, Ledger>(async (tripIds) =>
      Promise.all(
        tripIds.map(async (tripId) => {
          const [expenses, members] = await Promise.all([
            db.expense.findMany({
              where: { tripId },
              include: { splits: true },
              orderBy: [{ spentAt: 'desc' }, { createdAt: 'desc' }],
            }),
            db.tripMember.findMany({ where: { tripId }, select: { userId: true } }),
          ]);
          const ledgerRows = expenses.map((e) => ({
            paidById: e.paidById,
            amountCents: decimalToCents(e.amount),
            shares: e.splits.map((s) => ({ userId: s.userId, cents: decimalToCents(s.amount) })),
            isSettlement: e.category === SETTLEMENT_CATEGORY,
          }));
          const balances = computeBalances(
            ledgerRows,
            members.map((m) => m.userId),
          );
          const paidCentsByUser = new Map<string, number>();
          let totalCents = 0;
          for (const r of ledgerRows) {
            if (r.isSettlement) continue;
            totalCents += r.amountCents;
            paidCentsByUser.set(r.paidById, (paidCentsByUser.get(r.paidById) ?? 0) + r.amountCents);
          }
          return {
            expenses,
            balances,
            settlements: settleUp(balances),
            totalCents,
            paidCentsByUser,
          };
        }),
      ),
    ),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
