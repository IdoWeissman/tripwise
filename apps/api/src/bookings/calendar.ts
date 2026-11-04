import { Router } from 'express';
import ical, { ICalCalendarMethod } from 'ical-generator';
import type { Env } from '../config.js';
import type { Db } from '../db.js';
import { dateKey, localToInstant } from '../lib/time.js';

const LABEL: Record<string, string> = {
  FLIGHT: 'Flight',
  STAY: 'Stay',
  EVENT: 'Event',
  ATTRACTION: 'Attraction',
  TOUR: 'Tour',
  TRANSPORT: 'Transport',
  DINING: 'Dining',
  OTHER: 'Booking',
};

/**
 * Read-only iCalendar feed: GET /cal/:token.ics?include=bookings,activities,proposals
 * The token is a per-trip secret that owners can reset.
 */
export function calendarRouter(env: Env, db: Db) {
  const router = Router();
  router.get('/cal/:token.ics', async (req, res) => {
    const trip = await db.trip.findUnique({
      where: { calendarToken: String(req.params.token) },
      include: {
        bookings: { include: { segments: { orderBy: { position: 'asc' } } } },
        activities: {
          where: { status: { in: ['SCHEDULED', 'PROPOSED'] } },
          include: { day: true },
        },
      },
    });
    if (!trip) {
      res.status(404).type('text/plain').send('Calendar not found');
      return;
    }
    const include = new Set(String(req.query.include ?? 'bookings,activities').split(','));
    const cal = ical({
      name: trip.name,
      method: ICalCalendarMethod.PUBLISH,
      prodId: '//Tripwise//Trip calendar//EN',
      ttl: 60 * 60,
    });
    const tripLink = `${env.WEB_ORIGIN}/trips/${trip.id}`;

    if (include.has('bookings')) {
      for (const b of trip.bookings) {
        if (b.status === 'CANCELLED') continue;
        const ref = b.confirmationCode ? `Confirmation: ${b.confirmationCode}` : null;
        const desc = (extra: (string | null)[]) =>
          [
            ...extra,
            ref,
            b.bookingUrl && `Manage: ${b.bookingUrl}`,
            `Tripwise: ${tripLink}/bookings/${b.id}`,
          ]
            .filter(Boolean)
            .join('\n');
        if (b.segments.length) {
          for (const s of b.segments) {
            cal.createEvent({
              id: `${b.id}-${s.position}@tripwise`,
              start: s.departsAt,
              end: s.arrivesAt ?? new Date(s.departsAt.getTime() + 3_600_000),
              summary:
                `${LABEL[b.type]} ${s.number ?? ''} ${s.fromCode ?? s.fromName ?? ''} → ${s.toCode ?? s.toName ?? ''}`
                  .replace(/\s+/g, ' ')
                  .trim(),
              location: s.fromName ?? s.fromCode ?? undefined,
              description: desc([b.provider]),
            });
          }
        } else if (b.startsAt) {
          cal.createEvent({
            id: `${b.id}@tripwise`,
            start: b.startsAt,
            end: b.endsAt ?? new Date(b.startsAt.getTime() + 2 * 3_600_000),
            summary: b.type === 'STAY' ? `Stay · ${b.title}` : b.title,
            location: b.address ?? b.location ?? undefined,
            description: desc([b.provider, b.travellers ? `${b.travellers} people` : null]),
          });
        }
      }
    }

    for (const a of trip.activities) {
      const wanted =
        a.status === 'SCHEDULED' ? include.has('activities') : include.has('proposals');
      if (!wanted || !a.day) continue;
      const date = dateKey(a.day.date);
      const summary = a.status === 'PROPOSED' ? `Idea: ${a.title}` : a.title;
      if (a.startTime) {
        const start = localToInstant(`${date}T${a.startTime}`, trip.timeZone);
        cal.createEvent({
          id: `${a.id}@tripwise`,
          start,
          end: new Date(start.getTime() + 3_600_000),
          summary,
          location: a.location ?? undefined,
          description: `${tripLink}/itinerary`,
        });
      } else {
        cal.createEvent({
          id: `${a.id}@tripwise`,
          start: new Date(`${date}T00:00:00Z`),
          allDay: true,
          summary,
          location: a.location ?? undefined,
        });
      }
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    res.type('text/calendar; charset=utf-8').send(cal.toString());
  });
  return router;
}
