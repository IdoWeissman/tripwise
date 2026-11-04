/**
 * Bookings from calendar files (.ics / .vcs). Airlines, hotels and ticket sites often attach one
 * event per flight or reservation, with exact times — far more reliable than reading the email body.
 */
import { findConfirmationCode, findDates, findTimes, guessType } from './text.js';
import { flightTitle } from './title.js';
import { withProvenance, type Draft, type SegmentDraft } from './types.js';

export interface CalendarEvent {
  summary: string;
  description: string;
  location: string | null;
  start: CalTime | null;
  end: CalTime | null;
}

/** A DTSTART/DTEND: wall clock + what it is relative to. */
interface CalTime {
  /** "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD" */
  value: string;
  /** "UTC" for …Z values, the TZID parameter, or null for floating times. */
  zone: string | null;
}

const unescape = (v: string) =>
  v
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .trim();

function calTime(params: string, raw: string): CalTime | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{0,2}(Z)?)?$/.exec(raw.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const value = m[4] ? `${date}T${m[4]}:${m[5]}` : date;
  const tzid = /TZID=("?)([^;:"]+)\1/i.exec(params)?.[2] ?? null;
  return { value, zone: m[6] ? 'UTC' : tzid };
}

/** Parses the VEVENTs of an iCalendar / vCalendar file. */
export function parseCalendar(source: string): CalendarEvent[] {
  // Unfold continuation lines (RFC 5545 §3.1).
  const lines = source
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
  const events: CalendarEvent[] = [];
  let cur: CalendarEvent | null = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) {
      cur = { summary: '', description: '', location: null, start: null, end: null };
      continue;
    }
    if (/^END:VEVENT/i.test(line)) {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/i.exec(line);
    if (!m) continue;
    const [, name, params, value] = m as unknown as [string, string, string, string];
    switch (name.toUpperCase()) {
      case 'SUMMARY':
        cur.summary = unescape(value);
        break;
      case 'DESCRIPTION':
        cur.description = unescape(value);
        break;
      case 'LOCATION':
        cur.location = unescape(value) || null;
        break;
      case 'DTSTART':
        cur.start = calTime(params, value);
        break;
      case 'DTEND':
        cur.end = calTime(params, value);
        break;
    }
  }
  return events;
}

const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');

/** "+02:00" for a whole-quarter-hour offset between a local and a UTC wall clock, else null. */
function offsetBetween(local: string, utc: string): string | null {
  const mins = (Date.parse(`${local}:00Z`) - Date.parse(`${utc}:00Z`)) / 60_000;
  if (!Number.isFinite(mins) || mins % 15 !== 0 || Math.abs(mins) > 14 * 60) return null;
  return `${mins < 0 ? '-' : '+'}${pad(Math.trunc(mins / 60))}:${pad(mins % 60)}`;
}

/**
 * Local wall clocks for an event. UTC times are converted using the local times most airline
 * descriptions spell out ("Date: 17 Nov 2026 · Time: 08:30"); when that fails they stay in UTC.
 */
function localTimes(e: CalendarEvent) {
  const toLocal = (t: CalTime | null, i: number) => {
    if (!t) return null;
    if (t.zone !== 'UTC' || t.value.length === 10) return { local: t.value, tz: t.zone };
    const dates = findDates(e.description);
    const times = findTimes(e.description);
    const candidate = dates[i] && times[i] ? `${dates[i]}T${times[i]}` : null;
    const tz = candidate ? offsetBetween(candidate, t.value) : null;
    return tz ? { local: candidate!, tz } : { local: t.value, tz: 'UTC' };
  };
  return { start: toLocal(e.start, 0), end: toLocal(e.end, 1) };
}

const FLIGHTISH = /\b(flight|boarding|airline|departure|terminal)\b/i;

/** Airport names and codes written like "Ben Gurion Intl Arpt (TLV)". */
function namedCodes(text: string): { name: string; code: string }[] {
  return [...text.matchAll(/(?:^|[:\n])\s*([^:\n()]{2,60}?)\s*\(([A-Z]{3})\)/g)].map((m) => ({
    name: m[1]!.trim(),
    code: m[2]!,
  }));
}

function flightSegment(e: CalendarEvent): SegmentDraft | null {
  const text = `${e.summary}\n${e.description}`;
  const route =
    /\b([A-Z]{3})\s*(?:→|->|–|—|-|\bto\b)\s*([A-Z]{3})\b/.exec(e.summary) ??
    /\bfrom\s+([A-Z]{3})\s+to\s+([A-Z]{3})\b/i.exec(text);
  const named = namedCodes(e.description);
  const from = route?.[1] ?? named[0]?.code;
  const to = route?.[2] ?? named[1]?.code;
  if (!from || !to || !e.start || !FLIGHTISH.test(text)) return null;
  const number =
    /\bflight\s*(?:number|no\.?|#)?\s*:?\s*([A-Z0-9]{2})\s?(\d{1,4})\b/i.exec(text) ??
    /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/.exec(e.summary);
  const carrier = /\boperated by:?\s*([^\n]+?)\s*$/im.exec(e.description)?.[1] ?? null;
  const { start, end } = localTimes(e);
  return {
    carrier,
    number: number ? `${number[1]!.toUpperCase()} ${number[2]}` : null,
    fromCode: from,
    fromName: named.find((n) => n.code === from)?.name ?? null,
    toCode: to,
    toName: named.find((n) => n.code === to)?.name ?? null,
    departLocal: start!.local,
    arriveLocal: end?.local ?? null,
    departTz: start!.tz,
    arriveTz: end?.tz ?? null,
  };
}

/**
 * Drafts from calendar events: all flight events become one FLIGHT booking (one segment each,
 * in time order); any other event becomes its own booking.
 */
export function draftsFromCalendar(events: CalendarEvent[]): Draft[] {
  const legs: SegmentDraft[] = [];
  const refs: string[] = [];
  const others: Draft[] = [];
  for (const e of events) {
    const leg = flightSegment(e);
    const ref = findConfirmationCode(`${e.summary}\n${e.description}`);
    if (leg) {
      legs.push(leg);
      if (ref) refs.push(ref);
      continue;
    }
    if (!e.start || !e.summary) continue;
    const { start, end } = localTimes(e);
    others.push(
      withProvenance({
        type: guessType(`${e.summary}\n${e.description}`),
        title: e.summary,
        confirmationCode: ref,
        startLocal: start?.local ?? null,
        endLocal: end?.local ?? null,
        timeZone: start?.tz && start.tz !== 'UTC' ? start.tz : null,
        location: e.location,
        segments: [],
      }),
    );
  }
  if (!legs.length) return others;
  legs.sort((a, b) => a.departLocal.localeCompare(b.departLocal));
  return [
    withProvenance({
      type: 'FLIGHT',
      title: flightTitle(legs),
      provider: legs[0]!.carrier ?? null,
      confirmationCode: refs[0] ?? null,
      segments: legs,
    }),
    ...others,
  ];
}
