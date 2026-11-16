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
import type { IssueKind as PlanIssueKind, Leg as PlanLeg } from '../planning/plan.js';

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

/** The day planner's output, with each stop's activity row attached. */
export interface PlanStopModel {
  activity: Activity;
  start: string;
  end: string;
  durationMinutes: number;
  durationEstimated: boolean;
  travel: PlanLeg | null;
}
export interface DayPlanModel {
  stops: PlanStopModel[];
  issues: {
    kind: PlanIssueKind;
    message: string;
    activityId: string | null;
    blocking: boolean;
  }[];
  travelMinutes: number;
  startTime: string | null;
  endTime: string | null;
  backToStay: PlanLeg | null;
  travelEstimated: boolean;
  freeFrom: string | null;
  freeUntil: string | null;
}
export interface DayArrangementModel {
  better: boolean;
  savedMinutes: number;
  reason: string;
  plan: DayPlanModel;
}
