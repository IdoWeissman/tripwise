/**
 * Best-effort extraction from plain text (PDF tickets, pasted emails, emails without markup).
 * Conservative on purpose: it only fills fields it is fairly sure about; the user reviews everything.
 */
import { flightTitle } from './title.js';
import { withProvenance, type BookingTypeName, type Draft, type SegmentDraft } from './types.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number | string) => String(n).padStart(2, '0');
/** Hebrew month stems, in order (ינואר/ינו׳ … דצמבר/דצמ׳). */
const HE_MONTHS = [
  'ינו',
  'פבר',
  'מרץ',
  'אפר',
  'מאי',
  'יונ',
  'יול',
  'אוג',
  'ספט',
  'אוק',
  'נוב',
  'דצמ',
];

const TYPE_HINTS: [BookingTypeName, RegExp][] = [
  [
    'FLIGHT',
    /\b(flight|boarding pass|e-?ticket|airline|departure gate|baggage allowance|itinerary receipt)\b|טיסה|טיסות|כרטיס טיסה|כבודה/i,
  ],
  [
    'STAY',
    /\b(hotel|check-?in|check-?out|\d+\s+nights?|apartment|accommodation|guest ?house|airbnb|room type)\b|מלון|לילות|צ[׳']ק-אין|חדר/i,
  ],
  [
    'DINING',
    /\b(restaurant|table for|reservation for \d+ (people|guests)|party of \d+)\b|מסעדה|שולחן ל/i,
  ],
  [
    'TRANSPORT',
    /\b(train|rail|coach|bus|ferry|car rental|pick-?up|drop-?off|platform)\b|רכבת|השכרת רכב|מעבורת/i,
  ],
  [
    'TOUR',
    /\b(tours?|cruise|sail|excursion|guided|walk|walking|tasting|workshop|cooking class|day trip)\b|סיור|סדנה|טיול מאורגן|שייט/i,
  ],
  [
    'ATTRACTION',
    /\b(museum|palace|castle|admission|entry ticket|timed entry|gardens?)\b|מוזיאון|כניסה ל|ארמון/i,
  ],
  [
    'EVENT',
    /\b(concert|show|theatre|theater|performance|tickets?|seat \w+|row \w+)\b|הופעה|קונצרט|הצגה|מופע/i,
  ],
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
  // Hebrew, mid-sentence: "…אישור להזמנתכם אשר מספרה: FW-7770001", "אסמכתא 55120".
  const he =
    /(?:מספר[הו]?|מספר ההזמנה|אסמכתא|קוד אישור)\s*:?\s*#?\s*([A-Z0-9][A-Z0-9-]{3,20})\b/i.exec(
      text,
    )?.[1];
  if (he && /\d/.test(he)) return he.toUpperCase();
  // A reference in brackets, as many ticket sites put it in the subject: "(FW-T5550001)".
  const bracketed = /\(([A-Z]{2,5}-?[A-Z0-9]*\d[A-Z0-9-]{3,18})\)/.exec(text)?.[1];
  return bracketed ?? null;
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
  // Hebrew: "נוב׳ 17, 2026", "17 בנובמבר 2026", "12 בנוב׳ 2026".
  const he = `(${HE_MONTHS.join('|')})[\u05d0-\u05ea]*[׳'’]?`;
  for (const m of text.matchAll(new RegExp(`${he}\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'g')))
    add(m.index!, +m[3]!, HE_MONTHS.indexOf(m[1]!) + 1, +m[2]!);
  for (const m of text.matchAll(new RegExp(`(\\d{1,2})\\s+ב?${he}\\s+(\\d{4})`, 'g')))
    add(m.index!, +m[3]!, HE_MONTHS.indexOf(m[2]!) + 1, +m[1]!);
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
  if (names.size) return names.size;
  // A product line with a quantity: "culinary tour (4)".
  const qty = /^[ \t]*[^\n()]{3,80}\(([1-9]\d?)\)[ \t]*$/m.exec(text);
  return qty ? Number(qty[1]) : null;
}

const PERSONAL_MAIL =
  /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton(mail)?|walla|gmx|mail)\./i;
/** "ITA Airways" from "From: ITA Airways Booking <booking@…>" (forwarded headers) or the sender. */
export interface Sender {
  name?: string | null;
  address?: string | null;
}

export function findProvider(text: string, sender?: Sender | null): string | null {
  // In a forward chain, people forwarding from personal mailboxes aren't the provider:
  // take the original company sender ("EL AL Travel Bookings <noreply@elal-travel.com>").
  const senders = [
    ...text
      .replace(BIDI, '')
      .matchAll(/^\s*>?\s*(?:From|מאת)\s*:\s*"?([^<"\n]+?)"?\s*<\s*([^>\s]+)/gim),
  ]
    .filter((m) => !PERSONAL_MAIL.test(m[2]!))
    .map((m) => m[1]!);
  const forwarded = senders.at(-1);
  const operated = /\boperated by:?\s*([A-Z][^\n,;]{1,40}?)\s*(?:\n|$)/im.exec(text)?.[1];
  // The mail's own sender counts only when it isn't a person forwarding from a personal mailbox.
  const own = sender?.name && !PERSONAL_MAIL.test(sender.address ?? '') ? sender.name : null;
  const raw = operated ?? forwarded ?? own;
  if (!raw || /@/.test(raw)) return null;
  const clean = raw
    .replace(
      /\b(booking|bookings|reservations?|confirmations?|no-?reply|do not reply|team|service|customer care|notifications?)\b(?![.\w])/gi,
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

/** Subject parts that only say "confirmed / thank you", in English and Hebrew. */
const SUBJECT_FILLER =
  /^(?:(?:your\s+)?(?:booking|reservation|order|ticket)s?\s*(?:is\s+)?(?:confirmation|confirmed|details)?|thank you.*|הזמנתך אושרה|ההזמנה (?:שלך )?אושרה|אישור הזמנה|תודה.*)$/i;

function cleanSubject(subject: string | undefined): string | null {
  if (!subject) return null;
  const base = subject
    .replace(BIDI, '')
    .replace(/^((re|fwd?|fw|הועבר|השב):\s*)+/gi, '')
    .replace(
      /\bthank you for (booking|your (booking|order|reservation|purchase))( with us)?\b[\s|:–-]*/i,
      '',
    )
    .replace(
      /^(your\s+)?(booking|reservation|order|ticket)s?\s+(confirmation|confirmed|details)\s*(for|[-:–])?\s*/i,
      '',
    )
    .trim();
  // "הזמנתך אושרה - The Glam" → "The Glam"
  const parts = base
    .split(/\s+[|–—-]\s+|\s*\|\s*/)
    .map((p) => p.trim())
    .filter((p) => p && !SUBJECT_FILLER.test(p));
  return (parts.join(' – ') || base).trim() || null;
}

/** Invisible direction marks that mail clients sprinkle into mixed Hebrew/English text. */
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

/**
 * Removes the headers of forwarded messages ("From: … Sent: Monday, 7 September 2026 14:43"),
 * whose dates and times would otherwise be mistaken for the booking's.
 */
export function stripForwardHeaders(text: string): string {
  const header = /^\s*>?\s*(?:From|Sent|Date|To|Cc|Subject|מאת|נשלח|תאריך|אל|נושא)\s*:/i;
  const lines = text.replace(BIDI, '').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length;) {
    if (/^\s*-{3,}.*(forwarded|original) message/i.test(lines[i]!)) {
      i++;
      continue;
    }
    // A header block: 2+ consecutive header lines, one of them From/Sent. A lone "Date:" stays.
    let j = i;
    while (j < lines.length && header.test(lines[j]!)) j++;
    const block = lines.slice(i, j);
    if (block.length >= 2 && block.some((l) => /^\s*>?\s*(From|Sent|מאת|נשלח)\s*:/i.test(l))) {
      i = j;
      continue;
    }
    out.push(...(j > i ? block : [lines[i]!]));
    i = Math.max(j, i + 1);
  }
  return out.join('\n');
}

const strip = (v: string) =>
  v
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The value after a label, on the same line ("Booking number: 4821-7730") or the next
 * non-empty line ("מספר הזמנה:\n4821-7730"). The label must start the line.
 */
export function labelValue(text: string, label: RegExp): string | null {
  const re = new RegExp(`^[\\s*•-]*(?:${label.source})\\s*:?[ \\t]*(.*)$`, 'gim');
  for (const m of text.matchAll(re)) {
    const same = strip(m[1] ?? '');
    if (same) return same;
    const rest = text.slice(m.index! + m[0].length).split('\n');
    for (const line of rest.slice(0, 4)) {
      const v = strip(line);
      if (v) return v;
    }
  }
  return null;
}

const CODE_LABELS =
  /(?:booking|confirmation|reservation|itinerary|order)\s*(?:number|no\.?|code|#|id)|מספר הזמנה|מס[׳'] הזמנה|קוד הזמנה|מספר אישור|אסמכתא/;

/** "The Glam" from "The Glam ★★★★", or a labelled hotel / property name. */
export function findPlaceName(text: string): string | null {
  const stars = /^\s*([^\n★☆*]{2,80}?)\s*[★☆]{1,5}\s*$/m.exec(text)?.[1];
  return strip(stars ?? '') || labelValue(text, /hotel name|property|accommodation|שם המלון|מלון/);
}

/** "Via Nazionale 82, Rome" — a labelled address, or text that mail clients linked to Maps. */
export function findAddress(text: string): string | null {
  const labelled = labelValue(text, /address|location|כתובת|מיקום/);
  if (labelled && /\d|,/.test(labelled)) return labelled.slice(0, 200);
  for (const m of text.matchAll(
    /^[ \t]*([^\n<]{4,120}?)\s*<https?:\/\/(?:www\.)?google\.[a-z.]+\/maps[^>]*>/gim,
  )) {
    const v = strip(m[1]!);
    if (/\p{L}{3}/u.test(v) && /\d|,/.test(v) && !findDates(v).length) return v;
  }
  return null;
}

/** Room type and length for a stay: "Standard Room · 2 nights". */
function stayDetails(text: string, start: string | null, end: string | null): string | null {
  const room = labelValue(text, /room type|room|סוג חדר|חדר/);
  let nights = Number(/(\d{1,2})\s*[- ]?\s*(?:nights?|לילות|לילה)/i.exec(text)?.[1] ?? 0);
  if (!nights && start && end)
    nights = Math.round(
      (Date.parse(end.slice(0, 10)) - Date.parse(start.slice(0, 10))) / 86_400_000,
    );
  const parts = [
    room && room.length <= 60 ? room : null,
    nights > 0 ? `${nights} night${nights === 1 ? '' : 's'}` : null,
  ];
  return parts.filter(Boolean).join(' · ') || null;
}

/** Names listed under a "Guests" / "Passengers" heading. */
function listedNames(text: string): number | null {
  const m = /^\s*(?:guests?|passengers?|travell?ers?|נוסעים|אורחים)\s*:?\s*$/im.exec(text);
  if (!m) return null;
  let n = 0;
  for (const line of text.slice(m.index + m[0].length).split('\n')) {
    const v = line.trim();
    if (!v) continue;
    if (!/^(?:(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+)?[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,3}$/.test(v))
      break;
    n++;
  }
  return n || null;
}

/** True when a subject is only "Booking: Wed 18 Nov '26 @ 10:00 (code)" — dates, times and codes. */
export function isNoiseSubject(subject: string): boolean {
  const rest = subject
    .replace(BIDI, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(new RegExp(`(?:${HE_MONTHS.join('|')})[\u05d0-\u05ea]*[׳'’]?`, 'g'), ' ')
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/gi, ' ')
    .replace(/\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?/gi, ' ')
    .replace(
      /(?:^|\s)(?:יום|הזמנה|הזמנתך|אישור|ההזמנה|שלך|אושרה|[\u05d0-\u05ea][׳'])(?=\s|:|$)/g,
      ' ',
    )
    .replace(
      /\b(?:booking|order|reservation|confirmation|confirmed|your|ticket|tickets|for|on|at)\b/gi,
      ' ',
    )
    .replace(/[\d\s:.,@'’|/#–—-]+/g, '');
  return rest.length < 4;
}

/** The product as ticket sites print it next to the reference: "Trastevere food walk (FW-T5550001)". */
export function findProductLine(text: string): string | null {
  const m = /^[ \t]*([^\n()]{4,100}?)\s*\(([A-Z]{2,5}-?[A-Z0-9]*\d[A-Z0-9-]{3,18})\)[ \t]*$/m.exec(
    text,
  );
  return m ? m[1]!.trim() : null;
}

/** "10:00 - 14:00" → start and end; or a start plus "Duration 4 hours" / "משך 4 שעות". */
export function findTimeSpan(text: string): { start: string; end: string } | null {
  const range = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(
    text,
  );
  if (range) {
    const p = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;
    return { start: p(range[1]!, range[2]!), end: p(range[3]!, range[4]!) };
  }
  return null;
}

export function findDurationMinutes(text: string): number | null {
  const m =
    /(?:duration|length|משך)\s*:?\s*(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|שעות|שעה|minutes?|mins?|דקות)\b/i.exec(
      text,
    );
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  return /^(min|דק)/i.test(m[2]!) ? n : Math.round(n * 60);
}

/** Link captions that mean "open in Maps", not a place. */
const MAP_CAPTION =
  /^(ניווט ליעד|ניווט|הוראות הגעה|get directions|directions|navigate|open (in )?(google )?maps|view (on )?map|map)$/i;

/**
 * The meeting point / venue under a label: the place name and, on the next line, its address.
 * "נקודת מפגש <maps> ניווט ליעד\nCaffe Example\nPiazza Example 5, Roma" →
 * { place: "Caffe Example", address: "Piazza Example 5, Roma" }
 */
export function findMeetingPoint(text: string): { place: string | null; address: string | null } {
  const label =
    /meeting point|meeting place|venue|location|where|נקודת מפגש|מקום המפגש|מיקום|כתובת/;
  const m = new RegExp(`^[\\s*•-]*(?:${label.source})\\s*:?[ \\t]*(.*)$`, 'im').exec(text);
  if (!m) return { place: null, address: null };
  const values: string[] = [];
  const same = strip(m[1] ?? '');
  if (same && !MAP_CAPTION.test(same)) values.push(same);
  for (const line of text
    .slice(m.index + m[0].length)
    .split('\n')
    .slice(0, 5)) {
    const v = strip(line);
    if (!v || MAP_CAPTION.test(v)) continue;
    values.push(v);
    if (values.length === 2) break;
  }
  const looksLikeAddress = (v: string | undefined) => !!v && /\d/.test(v) && /\p{L}{3}/u.test(v);
  const [a, b] = values;
  if (looksLikeAddress(a) && !looksLikeAddress(b))
    return { place: null, address: a!.slice(0, 200) };
  return {
    place: a && a.length <= 120 && !findDates(a).length ? a : null,
    address: looksLikeAddress(b) ? b!.slice(0, 200) : null,
  };
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
  /\b(confirm\w*|reference|booking|reservation|order|invoice|receipt|date|time|total|price|paid|tickets?\s*x|dear|hello|hi|thank|passengers?|guests?)\b|@|https?:|\bwww\.|\.(?:com|org|net|io|co\.\w{2})\b/i;

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
  raw: string,
  opts: { subject?: string; fallbackTitle?: string; sender?: Sender | null } = {},
): Draft | null {
  // Dates, times, codes and amounts come from the message itself, not forwarding headers.
  const text = stripForwardHeaders(raw);
  const haystack = `${(opts.subject ?? '').replace(BIDI, '')}\n${text}`.slice(0, 50_000);
  const type = guessType(haystack);
  const labelledCode = labelValue(text, CODE_LABELS)
    ?.match(/^#?\s*([A-Z0-9][A-Z0-9-]{3,20})\b/i)?.[1]
    ?.toUpperCase();
  const code = labelledCode ?? findConfirmationCode(haystack);
  const dates = findDates(haystack);
  const times = findTimes(haystack);
  const money = findPrice(haystack);
  if (!code && !dates.length && type === 'OTHER') return null;

  const segments =
    type === 'FLIGHT' || type === 'TRANSPORT' ? flightSegments(haystack, dates, times) : [];
  const first = segments[0];
  const at = (date: string | undefined, time: string | undefined) =>
    date ? `${date}${time ? `T${time}` : ''}` : null;

  let start = first?.departLocal ?? at(dates[0], times[0]);
  let end: string | null = null;
  let provider = findProvider(raw, opts.sender);
  let notes: string | null = null;
  let title: string | null = first
    ? flightTitle(segments, cityNames(text, opts.subject, segments))
    : null;
  if (type === 'STAY') {
    // Prefer labelled values ("Check-in: Nov 17, 2026", "Check-in time: from 14:00").
    const inDate =
      findDates(
        labelValue(text, /check-?in(?: date)?|arrival(?: date)?|צ[׳']ק-אין|תאריך הגעה/) ?? '',
      )[0] ?? dates[0];
    const outDate =
      findDates(
        labelValue(text, /check-?out(?: date)?|departure(?: date)?|צ[׳']ק-אאוט|תאריך עזיבה/) ?? '',
      )[0] ?? dates[1];
    const inTime =
      findTimes(labelValue(text, /check-?in time|check-?in from|שעת צ[׳']ק-אין/) ?? '')[0] ??
      times[0];
    const outTime =
      findTimes(labelValue(text, /check-?out time|check-?out until|שעת צ[׳']ק-אאוט/) ?? '')[0] ??
      times[1];
    start = at(inDate, inTime);
    end = at(outDate, outTime);
    title = findPlaceName(text);
    // For stays the card shows what was booked; the agency goes into the notes.
    if (provider) notes = `Booked via ${provider}`;
    provider = stayDetails(text, start, end);
  }
  let location: string | null = null;
  let address = findAddress(text);
  if (type !== 'STAY' && !segments.length) {
    // "10:00 - 14:00" or "Duration 4 hours" gives the end; the meeting point gives the place.
    const span = findTimeSpan(text);
    const day = dates[0];
    if (span && day) {
      start = at(day, span.start);
      const next =
        span.end < span.start
          ? new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
          : day;
      end = at(next, span.end);
    } else if (start && start.length > 10) {
      const mins = findDurationMinutes(text);
      if (mins)
        end = new Date(Date.parse(`${start}:00Z`) + mins * 60_000).toISOString().slice(0, 16);
    }
    const where = findMeetingPoint(text);
    location = where.place;
    address = where.address ?? address;
    title ??= findProductLine(text);
  }
  const subject =
    opts.subject && !isNoiseSubject(cleanSubject(opts.subject) ?? '') ? opts.subject : undefined;
  title ??=
    routeFromSubject(subject) ??
    cleanSubject(subject) ??
    titleFromLines(text) ??
    opts.fallbackTitle ??
    'Booking';

  return withProvenance({
    type,
    title,
    confirmationCode: code,
    startLocal: start,
    endLocal: end,
    provider,
    location,
    address,
    bookingUrl: findManageUrl(text),
    travellers: findTravellers(haystack) ?? listedNames(text),
    price: money?.price ?? null,
    currency: money?.currency ?? null,
    notes,
    segments,
  });
}
