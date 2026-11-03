import { GraphQLError } from 'graphql';
import { computeShares, fromCents, MoneyError, toCents } from '../../lib/money.js';
import type { Resolvers } from '../__generated__/resolvers-types.js';
import type { Context } from '../context.js';
import { badInput, forbidden, requireTripRole } from '../errors.js';
import { SETTLEMENT_CATEGORY } from '../loaders.js';
import { publishTripEvent } from '../pubsub.js';

const user = async (ctx: Context, id: string) => {
  const u = await ctx.loaders.userById.load(id);
  if (!u) throw new Error(`User ${id} not found`);
  return u;
};

export const expenseResolvers: Resolvers = {
  Trip: {
    expenses: async (trip, _a, ctx) => (await ctx.loaders.ledgerByTrip.load(trip.id)).expenses,
    expenseSummary: async (trip, _a, ctx) => {
      const ledger = await ctx.loaders.ledgerByTrip.load(trip.id);
      const viewer = ctx.viewerId ?? '';
      return {
        totalCents: ledger.totalCents,
        viewerPaidCents: ledger.paidCentsByUser.get(viewer) ?? 0,
        viewerBalanceCents: ledger.balances.get(viewer) ?? 0,
        expenseCount: ledger.expenses.filter((e) => e.category !== SETTLEMENT_CATEGORY).length,
      };
    },
    balances: async (trip, _a, ctx) => {
      const ledger = await ctx.loaders.ledgerByTrip.load(trip.id);
      return [...ledger.balances].map(([userId, cents]) => ({ userId, cents }));
    },
    settlements: async (trip, _a, ctx) =>
      (await ctx.loaders.ledgerByTrip.load(trip.id)).settlements,
  },

  Expense: {
    amount: (e) => e.amount.toFixed(2),
    paidBy: (e, _a, ctx) => user(ctx, e.paidById),
    splits: (e, _a, ctx) => e.splits ?? ctx.loaders.splitsByExpense.load(e.id),
    viewerShare: async (e, _a, ctx) => {
      const splits = e.splits ?? (await ctx.loaders.splitsByExpense.load(e.id));
      const mine = splits.find((s) => s.userId === ctx.viewerId);
      return mine ? mine.amount.toFixed(2) : '0.00';
    },
    isSettlement: (e) => e.category === SETTLEMENT_CATEGORY,
  },
  ExpenseSplit: {
    user: (s, _a, ctx) => user(ctx, s.userId),
    amount: (s) => s.amount.toFixed(2),
  },
  ExpenseSummary: {
    total: (s) => fromCents(s.totalCents),
    viewerPaid: (s) => fromCents(s.viewerPaidCents),
    viewerBalance: (s) => fromCents(s.viewerBalanceCents),
  },
  Balance: {
    user: (b, _a, ctx) => user(ctx, b.userId),
    amount: (b) => fromCents(b.cents),
  },
  Settlement: {
    from: (s, _a, ctx) => user(ctx, s.fromId),
    to: (s, _a, ctx) => user(ctx, s.toId),
    amount: (s) => fromCents(s.cents),
  },

  Mutation: {
    addExpense: async (_p, { input }, ctx) => {
      await requireTripRole(ctx, input.tripId, 'EDITOR');
      const description = input.description.trim();
      if (!description) throw badInput('Description is required.');

      const memberIds = new Set(
        (
          await ctx.db.tripMember.findMany({
            where: { tripId: input.tripId },
            select: { userId: true },
          })
        ).map((m) => m.userId),
      );
      if (!memberIds.has(input.paidById)) throw badInput('The payer must be a trip member.');
      if (input.splits.some((s) => !memberIds.has(s.userId))) {
        throw badInput('Everyone in the split must be a trip member.');
      }

      let totalCents: number;
      let shares;
      try {
        totalCents = toCents(input.amount);
        shares = computeShares(totalCents, input.splitMethod, input.splits);
      } catch (err) {
        if (err instanceof MoneyError) throw badInput(err.message);
        throw err;
      }

      // Expense + splits are written atomically.
      const expense = await ctx.db.expense.create({
        data: {
          tripId: input.tripId,
          paidById: input.paidById,
          description,
          category: input.category?.trim() || 'Other',
          amount: fromCents(totalCents),
          splitMethod: input.splitMethod,
          spentAt: input.spentAt ?? new Date(),
          splits: {
            create: shares
              .filter((s) => s.cents > 0)
              .map((s) => ({ userId: s.userId, amount: fromCents(s.cents) })),
          },
        },
        include: { splits: true },
      });
      await publishTripEvent(input.tripId, 'EXPENSE_CHANGED', { actorId: ctx.viewerId });
      return expense;
    },

    deleteExpense: async (_p, { id }, ctx) => {
      const expense = await ctx.db.expense.findUnique({ where: { id } });
      if (!expense)
        throw new GraphQLError('Expense not found', { extensions: { code: 'NOT_FOUND' } });
      const role = await requireTripRole(ctx, expense.tripId, 'EDITOR');
      if (role !== 'OWNER' && expense.paidById !== ctx.viewerId) {
        throw forbidden('Only the payer or the trip owner can delete this expense.');
      }
      await ctx.db.expense.delete({ where: { id } });
      await publishTripEvent(expense.tripId, 'EXPENSE_CHANGED', { actorId: ctx.viewerId });
      return true;
    },
  },
};
