/** Shapes resolvers return for non-Prisma GraphQL types (wired up via codegen mappers). */
import type { Expense, ExpenseSplit } from '../generated/prisma/client.js';

export type ExpenseModel = Expense & { splits?: ExpenseSplit[] };
export type ExpenseSplitModel = ExpenseSplit;
export interface BalanceModel {
  userId: string;
  cents: number;
}
export interface SettlementModel {
  fromId: string;
  toId: string;
  cents: number;
}
export interface ExpenseSummaryModel {
  totalCents: number;
  viewerPaidCents: number;
  viewerBalanceCents: number;
  expenseCount: number;
}
export interface ProposalCountsModel {
  proposed: number;
  scheduled: number;
  declined: number;
}
