/**
 * Best-effort extraction from plain text (PDF tickets, pasted emails, emails without markup).
 * Conservative on purpose: it only fills fields it is fairly sure about; the user reviews everything.
 */
import { withProvenance, type BookingTypeName, type Draft, type SegmentDraft } from './types.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number | string) => String(n).padStart(2, '0');

const TYPE_HINTS: [BookingTypeName, RegExp][] = [
  [
    'FLIGHT',
    /\b(flight|boarding pass|e-?ticket|airline|departure gate|baggage allowance|itinerary receipt)\b/i,
  ],
  [
    'STAY',
    /\b(hotel|check-?in|check-?out|\d+\s+nights?|apartment|accommodation|guest ?house|airbnb|room type)\b/i,
  ],
  ['DINING', /\b(restaurant|table for|reservation for \d+ (people|guests)|party of \d+)\b/i],
  ['TRANSPORT', /\b(train|rail|coach|bus|ferry|car rental|pick-?up|drop-?off|platform)\b/i],
  ['TOUR', /\b(tour|cruise|sail|excursion|guided)\b/i],
  ['ATTRACTION', /\b(museum|palace|castle|admission|entry ticket|timed entry|gardens?)\b/i],
  ['EVENT', /\b(concert|show|theatre|theater|performance|tickets?|seat \w+|row \w+)\b/i],
];

export function guessType(text: string): BookingTypeName {
  let best: BookingTypeName = 'OTHER';
  let score = 0;
  for (const [type, re] of TYPE_HINTS) {
    const hits = text.match(new RegExp(re.source, 'gi'))?.length ?? 0;
    if (hits > score) {
      best = type;
      score = hits;
    }
  }
  return best;
}

export function findConfirmationCode(text: string): string | null {
  // Airline-style record locators may be all letters; everything else must contain a digit.
  const pnr = /\b(?:PNR|record locator|booking reference|booking ref)\b\s*[:#]?\s*([A-Z0-9]{6})\b/i;
  const labelled =
    /\b(?:booking|confirmation|reservation|order|ticket)\s*(?:code|number|no\.?|reference|ref|id)?\b\s*[:#]?\s*#?\s*([A-Z0-9][A-Z0-9-]{4,15})\b/i;
  const p = pnr.exec(text)?.[1]?.toUpperCase();
  if (p && (/\d/.test(p) || /^[A-Z]{6}$/.test(p)) && !/^(NUMBER|DETAILS|PLEASE)$/.test(p)) return p;
  for (const m of text.matchAll(new RegExp(labelled.source, 'gi'))) {
    const code = m[1]!.toUpperCase();
    if (/\d/.test(code)) return code;
  }
  return null;
}

/** First date in the text as "YYYY-MM-DD". Numeric dates are read day-first (14/05/2027). */
export function findDates(text: string): string[] {
  const out: { at: number; v: string }[] = [];
  const add = (at: number, y: number, mo: number, d: number) => {
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y < 2100)
      out.push({ at, v: `${y}-${pad(mo)}-${pad(d)}` });
  };
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g))
    add(m.index!, +m[1]!, +m[2]!, +m[3]!);
  for (const m of text.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/g)) {
    const mo = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase()) + 1;
    if (mo) add(m.index!, +m[3]!, mo, +m[1]!);
  }
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const mo = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()) + 1;
    if (mo) add(m.index!, +m[3]!, mo, +m[2]!);
  }
  for (const m of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g))
    add(m.index!, +m[3]!, +m[2]!, +m[1]!);
  return out.sort((a, b) => a.at - b.at).map((x) => x.v);
}

export function findTimes(text: string): string[] {
  return [...text.matchAll(/\b([01]?\d|2[0-3])[:.h]([0-5]\d)\s*(am|pm)?\b/gi)].map((m) => {
    let h = Number(m[1]);
    const ampm = m[3]?.toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${pad(h)}:${m[2]}`;
  });
}

const SYMBOLS: Record<string, string> = { '€': 'EUR', $: 'USD', '£': 'GBP', '₪': 'ILS' };

export function findPrice(text: string): { price: string; currency: string } | null {
  const re =
    /(total|amount paid|price|grand total)?[^\n\d€$£₪]{0,20}(€|\$|£|₪|EUR|USD|GBP|ILS)\s?(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?)\s?(€|EUR|USD|GBP|ILS|₪)/gi;
  let best: { price: string; currency: string; weight: number } | null = null;
  for (const m of text.matchAll(re)) {
    const raw = m[3] ?? m[4]!;
    const cur = (m[2] ?? m[5]!).toUpperCase();
    // "1.248,00" vs "1,248.00": the last separator followed by 2 digits is the decimal mark.
    const normalized = /[.,]\d{2}$/.test(raw)
      ? raw.slice(0, -3).replace(/[.,\s]/g, '') + '.' + raw.slice(-2)
      : raw.replace(/[.,\s]/g, '');
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) continue;
    const weight = (m[1] ? 1_000_000 : 0) + value; // prefer labelled totals, then the largest amount
    if (!best || weight > best.weight)
      best = { price: value.toFixed(2), currency: SYMBOLS[cur] ?? cur, weight };
  }
  return best ? { price: best.price, currency: best.currency } : null;
}

function flightSegments(text: string, dates: string[], times: string[]): SegmentDraft[] {
  const route = [...text.matchAll(/\b([A-Z]{3})\s*(?:→|->|–|—|-|to)\s*([A-Z]{3})\b/g)];
  const numbers = [...text.matchAll(/\b([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?(\d{2,4})\b/g)].filter(
    (m) => !/^(EUR|USD|GBP|ILS)$/.test(m[1]! + m[2]!),
  );
  return route
    .slice(0, 4)
    .map((r, i) => ({
      fromCode: r[1]!,
      toCode: r[2]!,
      number: numbers[i] ? `${numbers[i]![1]} ${numbers[i]![2]}` : null,
      departLocal: `${dates[i] ?? dates[0] ?? ''}${times[i * 2] ? `T${times[i * 2]}` : ''}`,
      arriveLocal:
        times[i * 2 + 1] && (dates[i] ?? dates[0])
          ? `${dates[i] ?? dates[0]}T${times[i * 2 + 1]}`
          : null,
    }))
    .filter((s) => s.departLocal);
}

function cleanSubject(subject: string | undefined): string | null {
  if (!subject) return null;
  return (
    subject
      .replace(/^(re|fwd?|fw):\s*/gi, '')
      .replace(
        /^(your\s+)?(booking|reservation|order|ticket)s?\s+(confirmation|confirmed|details)\s*(for|[-:–])?\s*/i,
        '',
      )
      .trim() || null
  );
}

/** One draft from free text. Returns null when the text clearly isn't a booking. */
export function draftFromText(
  text: string,
  opts: { subject?: string; fallbackTitle?: string } = {},
): Draft | null {
  const haystack = `${opts.subject ?? ''}\n${text}`.slice(0, 50_000);
  const type = guessType(haystack);
  const code = findConfirmationCode(haystack);
  const dates = findDates(haystack);
  const times = findTimes(haystack);
  const money = findPrice(haystack);
  if (!code && !dates.length && type === 'OTHER') return null;

  const segments =
    type === 'FLIGHT' || type === 'TRANSPORT' ? flightSegments(haystack, dates, times) : [];
  const first = segments[0];
  const start =
    first?.departLocal ?? (dates[0] ? `${dates[0]}${times[0] ? `T${times[0]}` : ''}` : null);
  const end = type === 'STAY' && dates[1] ? `${dates[1]}${times[1] ? `T${times[1]}` : ''}` : null;
  const title =
    (first ? `${first.fromCode} → ${segments.at(-1)!.toCode}` : null) ??
    cleanSubject(opts.subject) ??
    opts.fallbackTitle ??
    'Booking';

  return withProvenance({
    type,
    title,
    confirmationCode: code,
    startLocal: start,
    endLocal: end,
    price: money?.price ?? null,
    currency: money?.currency ?? null,
    segments,
  });
}
