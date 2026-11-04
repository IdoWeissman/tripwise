/**
 * Best-effort extraction from plain text (PDF tickets, pasted emails, emails without markup).
 * Conservative on purpose: it only fills fields it is fairly sure about; the user reviews everything.
 */
import { flightTitle } from './title.js';
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

/** Amount labels, strongest first. A total beats a fare, a fare beats an unlabelled amount. */
const PRICE_LABELS: [RegExp, number][] = [
  [
    /\b(final price|grand total|total price|total amount|total paid|amount paid|amount charged|you paid|total)\b/i,
    3,
  ],
  [/\b(price|amount|cost)\b/i, 1],
];

export function findPrice(text: string): { price: string; currency: string } | null {
  const re =
    /(€|\$|£|₪|\b(?:EUR|USD|GBP|ILS|CHF|JPY)\b)[ \t\u00a0]{0,3}(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)|(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)[ \t\u00a0]{0,3}(€|₪|\b(?:EUR|USD|GBP|ILS|CHF|JPY)\b)/gi;
  let best: { price: string; currency: string; weight: number } | null = null;
  for (const m of text.matchAll(re)) {
    const raw = (m[2] ?? m[3]!).trim();
    const cur = (m[1] ?? m[4]!).toUpperCase();
    // "1.248,00" vs "1,248.00": the last separator followed by 2 digits is the decimal mark.
    const normalized = /[.,]\d{2}$/.test(raw)
      ? raw.slice(0, -3).replace(/[.,\s]/g, '') + '.' + raw.slice(-2)
      : raw.replace(/[.,\s]/g, '');
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) continue;
    // Legal footers ("Share capital EUR 792.682.926,83") are not prices.
    const lineStart = text.lastIndexOf('\n', m.index!) + 1;
    const line = text.slice(lineStart, text.indexOf('\n', m.index!) >>> 0);
    if (/\b(share capital|capital stock|registered|company no|vat (no|number)|iban)\b/i.test(line))
      continue;
    // The label may sit on the previous line ("Final price\nUSD 324.97").
    const before = text
      .slice(Math.max(0, m.index! - 60), m.index!)
      .split('\n')
      .slice(-2)
      .join(' ');
    const label = PRICE_LABELS.find(([l]) => l.test(before))?.[1] ?? 0;
    const weight = label * 1_000_000_000 + value; // labelled totals first, then the largest amount
    if (!best || weight > best.weight)
      best = { price: value.toFixed(2), currency: SYMBOLS[cur] ?? cur, weight };
  }
  return best ? { price: best.price, currency: best.currency } : null;
}

/** How many people the booking is for. */
export function findTravellers(text: string): number | null {
  const counted =
    /(?<![\d.,])\b([1-9]\d?)[ \t]*(?:x[ \t]*)?(?:adults?|passengers?|travell?ers?|guests?|people|persons|tickets?)\b/i.exec(
      text,
    ) ??
    /\b(?:tickets?|adults?|passengers?|guests?)[ \t]*(?:x|:)[ \t]*([1-9]\d?)\b/i.exec(text) ??
    /\b(?:table|party) (?:for|of) ([1-9]\d?)\b/i.exec(text);
  if (counted) return Number(counted[1]);
  // Named passengers: "Ms Adi Cohen", "MR JOHN SMITH" (two or more name words).
  const names = new Set(
    [
      ...text.matchAll(
        /\b(?:Mr|Mrs|Ms|Miss|Mstr|Dr)\.?[ \t]+([A-Z][a-zA-Z'-]+(?:[ \t]+[A-Z][a-zA-Z'-]+)+)\b/g,
      ),
    ].map((m) => m[1]!.toLowerCase()),
  );
  return names.size || null;
}

/** "ITA Airways" from "From: ITA Airways Booking <booking@…>" (forwarded headers) or the sender. */
export function findProvider(text: string, sender?: string | null): string | null {
  const forwarded = /^\s*From:\s*"?([^<"\n]+?)"?\s*<[^>\n]+>/im.exec(text)?.[1];
  const operated = /\boperated by:?\s*([A-Z][^\n,;]{1,40}?)\s*(?:\n|$)/im.exec(text)?.[1];
  const raw = operated ?? forwarded ?? sender ?? null;
  if (!raw || /@/.test(raw)) return null;
  const clean = raw
    .replace(
      /\b(booking|bookings|reservations?|confirmations?|no-?reply|do not reply|team|service|customer care|notifications?)\b/gi,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean.length >= 2 ? clean : null;
}

/** The provider's "manage booking" link, if the text has one. */
export function findManageUrl(text: string): string | null {
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const url = m[0].replace(/[.,;]+$/, '');
    if (/\.(png|jpe?g|gif|svg)(\?|$)/i.test(url)) continue;
    if (
      /(manage|mmb|my-?booking|myflights|my-?trips?|reservation|itinerary|booking-?details|view-?booking)/i.test(
        url,
      )
    )
      return url;
  }
  return null;
}

/**
 * City names for airport codes, from "From Tel Aviv to Rome" (subject) or
 * "Departure IATA Code TLV … Departure City Tel Aviv" style itineraries.
 */
export function cityNames(
  text: string,
  subject: string | null | undefined,
  legs: SegmentDraft[],
): Record<string, string> {
  const names: Record<string, string> = {};
  const first = legs[0];
  if (!first) return names;
  const pair =
    /\bfrom\s+([A-Z][\p{L} .'-]{1,30}?)\s+to\s+([A-Z][\p{L} .'-]{1,30}?)(?=\s+on\b|\s*[|,(]|\s*$)/imu.exec(
      subject ?? '',
    );
  if (pair) {
    if (first.fromCode) names[first.fromCode] = pair[1]!.trim();
    if (first.toCode) names[first.toCode] = pair[2]!.trim();
  }
  // "… Code TLV … City Tel Aviv": pair each departure/arrival code with the city that follows it.
  for (const m of text.matchAll(/\b(Departure|Arrival)\s+(?:IATA\s+)?Code:?\s+([A-Z]{3})\b/g)) {
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 300);
    const city = new RegExp(`\\b${m[1]}\\s+City:?[ \\t]+([^\\n]{2,40}?)[ \\t]*(?:\\n|$)`).exec(
      after,
    )?.[1];
    if (city) names[m[2]!] ??= city.trim();
  }
  return names;
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
      .replace(/^((re|fwd?|fw):\s*)+/gi, '')
      .replace(
        /\bthank you for (booking|your (booking|order|reservation|purchase))( with us)?\b[\s|:–-]*/i,
        '',
      )
      .replace(/^\s*[|:–-]\s*/, '')
      .replace(
        /^(your\s+)?(booking|reservation|order|ticket)s?\s+(confirmation|confirmed|details)\s*(for|[-:–])?\s*/i,
        '',
      )
      .trim() || null
  );
}

/** "From Tel Aviv to Rome on 17 November 2026" → "Tel Aviv → Rome". */
export function routeFromSubject(subject: string | null | undefined): string | null {
  const m =
    /\bfrom\s+([A-Z][\p{L} .'-]{1,30}?)\s+to\s+([A-Z][\p{L} .'-]{1,30}?)(?=\s+on\b|\s*[|,(]|\s*$)/imu.exec(
      subject ?? '',
    );
  return m ? `${m[1]!.trim()} → ${m[2]!.trim()}` : null;
}

/** Words that mark boilerplate lines rather than the name of the thing that was booked. */
const BOILERPLATE =
  /\b(confirm\w*|reference|booking|reservation|order|invoice|receipt|date|time|total|price|paid|tickets?\s*x|dear|hello|hi|thank|passengers?|guests?)\b|@|https?:/i;

/** First line that reads like a name ("Oceanario de Lisboa - Timed entry"), for files without a subject. */
export function titleFromLines(text: string): string | null {
  // "Your reservation at Cervejaria Ramiro is confirmed" → the place's name.
  const at =
    /\b(?:reservation|booking|table|tickets?|stay)\s+(?:at|for)\s+([A-Z][\p{L}'’&.\- ]{2,40}?)(?=\s+(?:is|has|was|on|for)\b|[.,!\n]|$)/mu.exec(
      text,
    );
  if (at) return at[1]!.trim();
  for (const raw of text.split(/\r?\n/).slice(0, 15)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 4 || line.length > 80 || !/[a-z]{3}/i.test(line) || BOILERPLATE.test(line))
      continue;
    if ((line.match(/\d/g) ?? []).length > line.length / 3) continue;
    if (/\b\d{1,2}\s+[a-z]{3,9}\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\btable for\b/i.test(line))
      continue;
    return line.replace(/\s+[-–|·]\s+(timed entry|e-?tickets?|tickets?|admission)$/i, '');
  }
  return null;
}

/** One draft from free text. Returns null when the text clearly isn't a booking. */
export function draftFromText(
  text: string,
  opts: { subject?: string; fallbackTitle?: string; sender?: string | null } = {},
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
    (first ? flightTitle(segments, cityNames(text, opts.subject, segments)) : null) ??
    routeFromSubject(opts.subject) ??
    cleanSubject(opts.subject) ??
    (opts.subject ? null : titleFromLines(text)) ??
    opts.fallbackTitle ??
    'Booking';

  return withProvenance({
    type,
    title,
    confirmationCode: code,
    startLocal: start,
    endLocal: end,
    provider: findProvider(text, opts.sender),
    bookingUrl: findManageUrl(text),
    travellers: findTravellers(haystack),
    price: money?.price ?? null,
    currency: money?.currency ?? null,
    segments,
  });
}
