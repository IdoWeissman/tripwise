import { randomBytes } from 'node:crypto';
import { GraphQLError } from 'graphql';
import { parseText } from '../../bookings/parse/index.js';
import { computeReminders, DEFAULT_PREFS, upcoming } from '../../bookings/reminders.js';
import {
  BookingInputError,
  missingFields,
  timedParts,
  toBookingData,
} from '../../bookings/service.js';
import { dateKey, daysBetween, instantToLocal, localDate, localTime } from '../../lib/time.js';
import type { Resolvers } from '../__generated__/resolvers-types.js';
import type { Context } from '../context.js';
import { badInput, forbidden, requireTripRole } from '../errors.js';
import type { AgendaItemModel, BookingModel } from '../models.js';
import { publishTripEvent } from '../pubsub.js';

const notFound = (what: string) =>
  new GraphQLError(`${what} not found`, { extensions: { code: 'NOT_FOUND' } });

async function tripZone(ctx: Context, tripId: string) {
  return (await ctx.loaders.tripById.load(tripId))?.timeZone ?? 'UTC';
}
const zoneOf = async (ctx: Context, b: BookingModel) =>
  b.timeZone ?? (await tripZone(ctx, b.tripId));

async function loadBooking(ctx: Context, id: string) {
  const b = await ctx.db.booking.findUnique({
    where: { id },
    include: { segments: { orderBy: { position: 'asc' } } },
  });
  if (!b) throw notFound('Booking');
  return b;
}

function wrapInput<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof BookingInputError) throw badInput(err.message);
    throw err;
  }
}

async function myPrefs(ctx: Context, tripId: string) {
  const row = await ctx.db.reminderPreference.findUnique({
    where: { tripId_userId: { tripId, userId: ctx.viewerId! } },
  });
  return row ?? { tripId, userId: ctx.viewerId!, ...DEFAULT_PREFS };
}

export const bookingResolvers: Resolvers = {
  Trip: {
    timeZone: (t) => t.timeZone,
    bookings: (t, _a, ctx) => ctx.loaders.bookingsByTrip.load(t.id),
    booking: async (t, { id }, ctx) =>
      (await ctx.loaders.bookingsByTrip.load(t.id)).find((b) => b.id === id) ?? null,
    bookingStats: async (t, _a, ctx) => {
      const all = (await ctx.loaders.bookingsByTrip.load(t.id)).filter(
        (b) => b.status !== 'CANCELLED',
      );
      return {
        total: all.length,
        needsDetails: all.filter((b) => b.status === 'NEEDS_DETAILS').length,
      };
    },
    upNext: async (t, _a, ctx) => {
      const now = Date.now();
      let best: {
        booking: BookingModel;
        segment: BookingModel['segments'] extends (infer S)[] | undefined ? S | null : null;
        startsAt: Date;
      } | null = null;
      for (const b of await ctx.loaders.bookingsByTrip.load(t.id)) {
        for (const p of timedParts(b)) {
          if (p.at.getTime() > now && (!best || p.at < best.startsAt))
            best = { booking: b, segment: p.segment, startsAt: p.at };
        }
      }
      return best;
    },
    agenda: async (t, { dayId }, ctx) => {
      const day = await ctx.db.day.findUnique({ where: { id: dayId } });
      if (!day || day.tripId !== t.id) throw notFound('Day');
      const date = dateKey(day.date);
      const items: AgendaItemModel[] = [];
      for (const b of await ctx.loaders.bookingsByTrip.load(t.id)) {
        if (b.status === 'CANCELLED') continue;
        const tz = b.timeZone ?? t.timeZone;
        if (b.type === 'STAY') {
          if (b.startsAt && localDate(b.startsAt, tz) === date)
            items.push({
              kind: 'CHECK_IN',
              time: localTime(b.startsAt, tz),
              title: `Check in · ${b.title}`,
              subtitle: b.address ?? b.location,
              booking: b,
              activity: null,
            });
          if (b.endsAt && localDate(b.endsAt, tz) === date)
            items.push({
              kind: 'CHECK_OUT',
              time: localTime(b.endsAt, tz),
              title: `Check out · ${b.title}`,
              subtitle: b.address ?? b.location,
              booking: b,
              activity: null,
            });
          continue;
        }
        if (b.segments?.length) {
          for (const s of b.segments) {
            const dz = s.departTz ?? tz;
            if (localDate(s.departsAt, dz) !== date) continue;
            const route = [s.fromCode ?? s.fromName, s.toCode ?? s.toName]
              .filter(Boolean)
              .join(' → ');
            const arrive = s.arrivesAt
              ? ` · arrives ${localTime(s.arrivesAt, s.arriveTz ?? dz)} local`
              : '';
            items.push({
              kind: 'BOOKING',
              time: localTime(s.departsAt, dz),
              title: `${b.type === 'FLIGHT' ? 'Flight' : 'Train'} ${route}`.trim(),
              subtitle: `${s.number ?? b.provider ?? ''}${arrive}`.trim() || null,
              booking: b,
              activity: null,
            });
          }
        } else if (b.startsAt && localDate(b.startsAt, tz) === date) {
          items.push({
            kind: 'BOOKING',
            time: localTime(b.startsAt, tz),
            title: b.title,
            subtitle:
              [b.location, b.confirmationCode && `ref. ${b.confirmationCode}`]
                .filter(Boolean)
                .join(' · ') || null,
            booking: b,
            activity: null,
          });
        }
      }
      const activities = await ctx.db.activity.findMany({
        where: { dayId, status: 'SCHEDULED' },
        orderBy: { position: 'asc' },
      });
      for (const a of activities)
        items.push({
          kind: 'ACTIVITY',
          time: a.startTime,
          title: a.title,
          subtitle: a.location,
          booking: null,
          activity: a,
        });
      // By time; at the same time, fixed bookings come before flexible plans. Untimed plans last.
      const rank = (i: AgendaItemModel) => (i.kind === 'ACTIVITY' ? 1 : 0);
      return items.sort(
        (x, y) => (x.time ?? '99:99').localeCompare(y.time ?? '99:99') || rank(x) - rank(y),
      );
    },
    reminders: async (t, { limit }, ctx) => {
      await requireTripRole(ctx, t.id);
      const list = computeReminders(
        await ctx.loaders.bookingsByTrip.load(t.id),
        await myPrefs(ctx, t.id),
        t.timeZone,
      );
      return upcoming(list).slice(0, Math.max(1, Math.min(limit ?? 5, 50)));
    },
    myReminderPreferences: async (t, _a, ctx) => {
      await requireTripRole(ctx, t.id);
      return myPrefs(ctx, t.id);
    },
    attachments: (t, { limit }, ctx) =>
      ctx.db.attachment.findMany({
        where: { tripId: t.id },
        orderBy: { createdAt: 'desc' },
        take: Math.max(1, Math.min(limit ?? 20, 100)),
      }),
    calendarUrl: async (t, _a, ctx) => {
      await requireTripRole(ctx, t.id);
      let token = t.calendarToken;
      if (!token) {
        token = randomBytes(18).toString('base64url');
        await ctx.db.trip.update({ where: { id: t.id }, data: { calendarToken: token } });
      }
      return `${ctx.env.PUBLIC_API_URL}/cal/${token}.ics`;
    },
  },

  Day: {
    bookings: async (day, _a, ctx) => {
      const tz = await tripZone(ctx, day.tripId);
      const date = dateKey(day.date);
      return (await ctx.loaders.bookingsByTrip.load(day.tripId)).filter((b) => {
        if (b.type === 'STAY' || b.status === 'CANCELLED') return false;
        return timedParts(b).some(
          (p) => localDate(p.at, p.segment?.departTz ?? b.timeZone ?? tz) === date,
        );
      });
    },
    stay: async (day, _a, ctx) => {
      const tz = await tripZone(ctx, day.tripId);
      const date = dateKey(day.date);
      for (const b of await ctx.loaders.bookingsByTrip.load(day.tripId)) {
        if (b.type !== 'STAY' || b.status === 'CANCELLED' || !b.startsAt || !b.endsAt) continue;
        const zone = b.timeZone ?? tz;
        const inDate = localDate(b.startsAt, zone);
        const outDate = localDate(b.endsAt, zone);
        if (date < inDate || date > outDate) continue;
        const nights = Math.max(1, daysBetween(inDate, outDate));
        const isCheckOut = date === outDate;
        return {
          booking: b,
          nights,
          night: isCheckOut ? 0 : daysBetween(inDate, date) + 1,
          isCheckIn: date === inDate,
          isCheckOut,
        };
      }
      return null;
    },
  },

  Booking: {
    price: (b) => b.price?.toFixed(2) ?? null,
    segments: async (b, _a, ctx) =>
      b.segments ??
      ctx.db.bookingSegment.findMany({ where: { bookingId: b.id }, orderBy: { position: 'asc' } }),
    attachments: (b, _a, ctx) => ctx.loaders.attachmentsByBooking.load(b.id),
    startLocal: async (b, _a, ctx) =>
      b.startsAt ? instantToLocal(b.startsAt, await zoneOf(ctx, b)) : null,
    endLocal: async (b, _a, ctx) =>
      b.endsAt ? instantToLocal(b.endsAt, await zoneOf(ctx, b)) : null,
    missingFields: (b) => missingFields(b),
    createdBy: async (b, _a, ctx) => {
      const u = await ctx.loaders.userById.load(b.createdById);
      if (!u) throw notFound('User');
      return u;
    },
  },

  BookingSegment: {
    departLocal: (s) => instantToLocal(s.departsAt, s.departTz ?? 'UTC'),
    arriveLocal: (s) =>
      s.arrivesAt ? instantToLocal(s.arrivesAt, s.arriveTz ?? s.departTz ?? 'UTC') : null,
  },

  Attachment: {
    url: (a, _x, ctx) => ctx.storage.signedUrl(a.storageKey, a.fileName, a.mimeType),
    uploadedBy: async (a, _x, ctx) => {
      const u = await ctx.loaders.userById.load(a.uploadedById);
      if (!u) throw notFound('User');
      return u;
    },
    booking: (a, _x, ctx) =>
      a.bookingId
        ? ctx.db.booking.findUnique({
            where: { id: a.bookingId },
            include: { segments: { orderBy: { position: 'asc' } } },
          })
        : null,
  },

  BookingDraft: {
    segments: (d) => d.segments,
  },

  Mutation: {
    createBooking: async (_p, { tripId, input, source, attachmentIds }, ctx) => {
      await requireTripRole(ctx, tripId, 'EDITOR');
      // Times without an explicit zone are in the trip's zone.
      const tz = await tripZone(ctx, tripId);
      const final = wrapInput(() => toBookingData(input, tz));
      const ids = [...new Set(attachmentIds ?? [])];
      if (ids.length) {
        const owned = await ctx.db.attachment.count({ where: { id: { in: ids }, tripId } });
        if (owned !== ids.length) throw badInput('Attachments must belong to this trip.');
      }
      const booking = await ctx.db.$transaction(async (tx) => {
        const created = await tx.booking.create({
          data: {
            ...final.data,
            tripId,
            createdById: ctx.viewerId!,
            source: source ?? 'MANUAL',
            segments: { create: final.segments },
          },
          include: { segments: { orderBy: { position: 'asc' } } },
        });
        if (ids.length)
          await tx.attachment.updateMany({
            where: { id: { in: ids } },
            data: { bookingId: created.id },
          });
        return created;
      });
      ctx.loaders.bookingsByTrip.clear(tripId);
      await publishTripEvent(tripId, 'BOOKING_CHANGED', { actorId: ctx.viewerId });
      return booking;
    },

    updateBooking: async (_p, { id, input }, ctx) => {
      const existing = await loadBooking(ctx, id);
      await requireTripRole(ctx, existing.tripId, 'EDITOR');
      const fallback = existing.timeZone ?? (await tripZone(ctx, existing.tripId));
      const { data, segments } = wrapInput(() => toBookingData(input, fallback));
      const booking = await ctx.db.$transaction(async (tx) => {
        await tx.bookingSegment.deleteMany({ where: { bookingId: id } });
        return tx.booking.update({
          where: { id },
          data: { ...data, segments: { create: segments } },
          include: { segments: { orderBy: { position: 'asc' } } },
        });
      });
      ctx.loaders.bookingsByTrip.clear(existing.tripId);
      await publishTripEvent(existing.tripId, 'BOOKING_CHANGED', { actorId: ctx.viewerId });
      return booking;
    },

    deleteBooking: async (_p, { id }, ctx) => {
      const existing = await loadBooking(ctx, id);
      const role = await requireTripRole(ctx, existing.tripId, 'EDITOR');
      if (role !== 'OWNER' && existing.createdById !== ctx.viewerId)
        throw forbidden('Only the person who added it or the owner can delete this booking.');
      await ctx.db.booking.delete({ where: { id } });
      await publishTripEvent(existing.tripId, 'BOOKING_CHANGED', { actorId: ctx.viewerId });
      return true;
    },

    attachToBooking: async (_p, { attachmentId, bookingId }, ctx) => {
      const a = await ctx.db.attachment.findUnique({ where: { id: attachmentId } });
      if (!a) throw notFound('Document');
      await requireTripRole(ctx, a.tripId, 'EDITOR');
      if (bookingId) {
        const b = await ctx.db.booking.findUnique({ where: { id: bookingId } });
        if (!b || b.tripId !== a.tripId) throw badInput('That booking is not part of this trip.');
      }
      const updated = await ctx.db.attachment.update({
        where: { id: attachmentId },
        data: { bookingId: bookingId ?? null },
      });
      await publishTripEvent(a.tripId, 'BOOKING_CHANGED', { actorId: ctx.viewerId });
      return updated;
    },

    deleteAttachment: async (_p, { id }, ctx) => {
      const a = await ctx.db.attachment.findUnique({ where: { id } });
      if (!a) throw notFound('Document');
      const role = await requireTripRole(ctx, a.tripId, 'EDITOR');
      if (role !== 'OWNER' && a.uploadedById !== ctx.viewerId)
        throw forbidden('Only the uploader or the owner can delete this document.');
      await ctx.db.attachment.delete({ where: { id } });
      await ctx.storage
        .delete(a.storageKey)
        .catch((err) => console.warn('Could not delete stored file', a.storageKey, err));
      await publishTripEvent(a.tripId, 'BOOKING_CHANGED', { actorId: ctx.viewerId });
      return true;
    },

    parseBookingText: async (_p, { tripId, text }, ctx) => {
      await requireTripRole(ctx, tripId, 'EDITOR');
      if (text.length > 200_000)
        throw badInput('That text is too long — paste just the confirmation email.');
      return parseText(text).map((d) => ({
        ...d,
        source: 'TEXT' as const,
        attachmentId: null,
        sourceName: 'Pasted text',
      }));
    },

    updateReminderPreferences: async (_p, { tripId, input }, ctx) => {
      await requireTripRole(ctx, tripId);
      const patch = Object.fromEntries(
        Object.entries(input).filter(([, v]) => typeof v === 'boolean'),
      );
      return ctx.db.reminderPreference.upsert({
        where: { tripId_userId: { tripId, userId: ctx.viewerId! } },
        create: { tripId, userId: ctx.viewerId!, ...DEFAULT_PREFS, ...patch },
        update: patch,
      });
    },

    resetCalendarLink: async (_p, { tripId }, ctx) => {
      await requireTripRole(ctx, tripId, 'OWNER');
      const token = randomBytes(18).toString('base64url');
      await ctx.db.trip.update({ where: { id: tripId }, data: { calendarToken: token } });
      return `${ctx.env.PUBLIC_API_URL}/cal/${token}.ics`;
    },
  },
};
