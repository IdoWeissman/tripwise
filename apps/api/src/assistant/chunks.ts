import type { Db } from '../db.js';
import { instantToLocal } from '../lib/time.js';

/** One searchable piece of a trip. `key` is stable, so unchanged chunks keep their embedding. */
export interface Chunk {
  key: string;
  kind: 'TRIP' | 'BOOKING' | 'ACTIVITY' | 'EXPENSE' | 'DOCUMENT';
  /** Booking / activity / expense / attachment id, for citations and links. */
  sourceId: string | null;
  title: string;
  content: string;
}

const DOC_CHUNK = 1500;
const DOC_OVERLAP = 200;
const MAX_DOC_CHUNKS = 12;

const line = (label: string, value: unknown) =>
  value === null || value === undefined || value === '' ? null : `${label}: ${String(value)}`;
const lines = (...parts: (string | null)[]) => parts.filter(Boolean).join('\n');

/** Splits long document text on paragraph or sentence edges, with a little overlap. */
export function splitText(text: string, size = DOC_CHUNK, overlap = DOC_OVERLAP): string[] {
  const clean = text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const out: string[] = [];
  let start = 0;
  while (start < clean.length && out.length < MAX_DOC_CHUNKS) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start + size / 2, end);
      const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '));
      if (cut > 0) end = start + size / 2 + cut + 1;
    }
    out.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return out;
}

/** Everything the assistant can search, built fresh from the database. */
export async function buildChunks(db: Db, tripId: string): Promise<Chunk[]> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    include: {
      members: { include: { user: { select: { id: true, name: true } } } },
      days: { orderBy: { position: 'asc' } },
      bookings: { include: { segments: { orderBy: { position: 'asc' } } } },
      activities: { include: { _count: { select: { votes: true } } } },
      expenses: { orderBy: { spentAt: 'desc' } },
      attachments: { select: { id: true, fileName: true, bookingId: true, extractedText: true } },
    },
  });
  if (!trip) return [];
  const tz = trip.timeZone;
  const names = new Map(trip.members.map((m) => [m.userId, m.user.name]));
  const dayOf = new Map(trip.days.map((d) => [d.id, d]));
  const local = (d: Date | null, zone?: string | null) =>
    d ? instantToLocal(d, zone || tz).replace('T', ' ') : null;
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  const chunks: Chunk[] = [
    {
      key: 'trip',
      kind: 'TRIP',
      sourceId: null,
      title: trip.name,
      content: lines(
        line('Destination', trip.destination),
        `Dates: ${ymd(trip.startDate)} to ${ymd(trip.endDate)} (${trip.days.length} days)`,
        line('Time zone', tz),
        line('Currency', trip.currency),
        `Members: ${trip.members.map((m) => `${m.user.name} (${m.role.toLowerCase()})`).join(', ')}`,
        `A proposal is scheduled when it reaches ${trip.voteThreshold} votes.`,
      ),
    },
  ];

  for (const b of trip.bookings) {
    const legs = b.segments.map((s, i) =>
      `Leg ${i + 1}: ${[s.carrier, s.number].filter(Boolean).join(' ')} ${s.fromName ?? ''} (${s.fromCode ?? '?'}) ${local(s.departsAt, s.departTz)} → ${s.toName ?? ''} (${s.toCode ?? '?'}) ${local(s.arrivesAt, s.arriveTz) ?? ''}`.replace(
        /\s+/g,
        ' ',
      ),
    );
    chunks.push({
      key: `booking:${b.id}`,
      kind: 'BOOKING',
      sourceId: b.id,
      title: b.title,
      content: lines(
        `${b.type.toLowerCase()} booking, ${b.status.toLowerCase().replace('_', ' ')}`,
        line('Provider', b.provider),
        line(b.type === 'STAY' ? 'Check-in' : 'Starts', local(b.startsAt, b.timeZone)),
        line(b.type === 'STAY' ? 'Check-out' : 'Ends', local(b.endsAt, b.timeZone)),
        ...legs,
        line('Place', b.location),
        line('Address', b.address),
        line('Confirmation code', b.confirmationCode),
        line('Travellers', b.travellers),
        b.price ? `Price: ${b.price.toFixed(2)} ${b.currency ?? trip.currency}` : null,
        line('Notes', b.notes),
      ),
    });
  }

  for (const a of trip.activities) {
    const day = a.dayId ? dayOf.get(a.dayId) : null;
    chunks.push({
      key: `activity:${a.id}`,
      kind: 'ACTIVITY',
      sourceId: a.id,
      title: a.title,
      content: lines(
        a.status === 'SCHEDULED'
          ? `Planned activity${day ? ` on ${ymd(day.date)}` : ' (no day yet)'}`
          : a.status === 'PROPOSED'
            ? `Proposed idea with ${a._count.votes} of ${trip.voteThreshold} votes`
            : 'Declined idea',
        line('Time', a.startTime),
        line('Where', a.location),
        line('Details', a.description),
        a.costPerPerson ? `Cost per person: ${a.costPerPerson.toFixed(2)} ${trip.currency}` : null,
        line('Suggested by', names.get(a.createdById)),
      ),
    });
  }

  for (const e of trip.expenses) {
    chunks.push({
      key: `expense:${e.id}`,
      kind: 'EXPENSE',
      sourceId: e.id,
      title: e.description,
      content: lines(
        `Expense of ${e.amount.toFixed(2)} ${trip.currency} (${e.category})`,
        line('Paid by', names.get(e.paidById)),
        line('Date', ymd(e.spentAt)),
      ),
    });
  }

  for (const att of trip.attachments) {
    if (!att.extractedText) continue;
    const parts = splitText(att.extractedText);
    parts.forEach((part, i) =>
      chunks.push({
        key: `doc:${att.id}#${i}`,
        kind: 'DOCUMENT',
        // Documents attached to a booking cite (and link to) that booking.
        sourceId: att.bookingId,
        title: parts.length > 1 ? `${att.fileName} (part ${i + 1})` : att.fileName,
        content: part,
      }),
    );
  }
  return chunks;
}
