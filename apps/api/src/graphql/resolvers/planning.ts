import { z } from 'zod';
import { HARD, hhmm, type DayPlan } from '../../planning/plan.js';
import { arrangeDay, gatherDayOnce, planDay, type GatheredDay } from '../../planning/service.js';
import type { Resolvers } from '../__generated__/resolvers-types.js';
import { badInput, requireTripRole, requireViewer } from '../errors.js';
import type { DayPlanModel } from '../models.js';
import { publishTripEvent } from '../pubsub.js';

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 09:30.');
const Minutes = z
  .number()
  .int()
  .min(5, 'At least 5 minutes.')
  .max(16 * 60, 'At most 16 hours.');

function toModel(plan: DayPlan, day: GatheredDay): DayPlanModel {
  const byId = new Map(day.activities.map((a) => [a.id, a]));
  return {
    stops: plan.stops.map((s) => ({
      activity: byId.get(s.id)!,
      start: hhmm(s.start),
      end: hhmm(s.end),
      durationMinutes: s.durationMinutes,
      durationEstimated: s.durationEstimated,
      travel: s.travel,
    })),
    issues: plan.issues.map((i) => ({ ...i, blocking: HARD.has(i.kind) })),
    travelMinutes: plan.travelMinutes,
    startTime: plan.startsAt === null ? null : hhmm(plan.startsAt),
    endTime: plan.endsAt === null ? null : hhmm(plan.endsAt),
    backToStay: plan.backToStay,
    travelEstimated: plan.travelEstimated,
    freeFrom: day.freeFrom,
    freeUntil: day.freeUntil,
  };
}

export const planningResolvers: Resolvers = {
  Trip: {
    day: async (trip, { id }, ctx) => {
      await requireTripRole(ctx, trip.id);
      return ctx.db.day.findFirst({ where: { id, tripId: trip.id } });
    },
  },

  Day: {
    plan: async (day, _a, ctx) => {
      // Days are reached through a trip the viewer belongs to; checked again (cheap) for safety.
      await requireTripRole(ctx, day.tripId);
      const g = await gatherDayOnce(ctx, day);
      return toModel(planDay(g.input), g);
    },
    arrangement: async (day, _a, ctx) => {
      await requireTripRole(ctx, day.tripId);
      const g = await gatherDayOnce(ctx, day);
      const r = arrangeDay(g.input);
      return {
        better: r.better,
        savedMinutes: r.savedMinutes,
        reason: r.reason,
        plan: toModel(r.plan, g),
      };
    },
  },

  Mutation: {
    updateTripPlanning: async (_p, { tripId, pace, getAround }, ctx) => {
      requireViewer(ctx);
      await requireTripRole(ctx, tripId, 'EDITOR');
      const trip = await ctx.db.trip.update({ where: { id: tripId }, data: { pace, getAround } });
      await publishTripEvent(tripId, 'ACTIVITY_UPDATED', { actorId: ctx.viewerId });
      return trip;
    },

    setActivityTiming: async (_p, { activityId, startTime, durationMinutes }, ctx) => {
      requireViewer(ctx);
      const activity = await ctx.db.activity.findUnique({ where: { id: activityId } });
      if (!activity) throw badInput('That activity no longer exists.');
      await requireTripRole(ctx, activity.tripId, 'EDITOR');
      const parsed = z
        .object({ startTime: Time.nullable(), durationMinutes: Minutes.nullable() })
        .safeParse({ startTime: startTime ?? null, durationMinutes: durationMinutes ?? null });
      if (!parsed.success) throw badInput(parsed.error.issues[0]!.message);
      const updated = await ctx.db.activity.update({
        where: { id: activityId },
        data: parsed.data,
      });
      await publishTripEvent(updated.tripId, 'ACTIVITY_UPDATED', {
        activityId,
        actorId: ctx.viewerId,
      });
      return updated;
    },

    arrangeDay: async (_p, { dayId }, ctx) => {
      requireViewer(ctx);
      const day = await ctx.db.day.findUnique({ where: { id: dayId } });
      if (!day) throw badInput('That day no longer exists.');
      await requireTripRole(ctx, day.tripId, 'EDITOR');
      // Recomputed here, never taken from the client: what's applied is what the server checked.
      const g = await gatherDayOnce(ctx, day);
      const r = arrangeDay(g.input);
      if (!r.better) return day;
      const fixed = new Set(g.input.stops.filter((s) => s.fixed).map((s) => s.id));
      await ctx.db.$transaction(
        r.order.map((o, position) =>
          ctx.db.activity.update({
            where: { id: o.id },
            data: fixed.has(o.id) ? { position } : { position, startTime: o.startTime },
          }),
        ),
      );
      await publishTripEvent(day.tripId, 'ACTIVITY_MOVED', { actorId: ctx.viewerId });
      return day;
    },
  },
};
