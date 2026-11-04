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

import type { Activity, Booking, BookingSegment } from '../generated/prisma/client.js';
import type { Draft, SegmentDraft } from '../bookings/parse/index.js';

export type BookingModel = Booking & { segments?: BookingSegment[] };
export interface UpNextModel {
  booking: BookingModel;
  segment: BookingSegment | null;
  startsAt: Date;
}
export interface AgendaItemModel {
  kind: 'BOOKING' | 'CHECK_IN' | 'CHECK_OUT' | 'ACTIVITY';
  time: string | null;
  title: string;
  subtitle: string | null;
  booking: BookingModel | null;
  activity: Activity | null;
}
export interface StayNightModel {
  booking: BookingModel;
  night: number;
  nights: number;
  isCheckIn: boolean;
  isCheckOut: boolean;
}
export interface ReminderModel {
  key: string;
  kind: 'CHECK_IN_OPENS' | 'LEAVE_FOR_AIRPORT' | 'CHECK_OUT' | 'STARTING_SOON';
  title: string;
  body: string;
  fireAt: Date;
  /** When the thing itself happens; reminders disappear after this. */
  targetAt: Date;
  booking: BookingModel;
}
export type BookingDraftModel = Draft & {
  source: 'EMAIL' | 'PDF' | 'IMAGE' | 'TEXT' | 'MANUAL';
  attachmentId?: string | null;
  sourceName?: string | null;
};
export type SegmentDraftModel = SegmentDraft;
