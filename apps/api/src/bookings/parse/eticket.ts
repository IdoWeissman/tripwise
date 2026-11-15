import { AIRPORTS } from './airports.js';
import type { SegmentDraft } from './types.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "03MAR2027" → "2027-03-03" (the compact date airline systems print). */
export function compactDate(s: string): string | null {
  const m = /^(\d{2})([A-Z]{3})(\d{4})$/.exec(s.trim());
  const mo = m ? MONTHS.indexOf(m[2]!) + 1 : 0;
  return m && mo ? `${m[3]}-${String(mo).padStart(2, '0')}-${m[1]}` : null;
}

const NUMBER_TIME = /^([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?(\d{1,4})\s+([01]\d|2[0-3]):([0-5]\d)$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PLACE = /^[A-Z][A-Z .'/-]{1,40}$/;

const title = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/**
 * Flight legs from an airline e-ticket receipt (Amadeus and similar GDS layouts). Each leg reads:
 *
 *   TEL AVIV YAFO        ← from city
 *   BEN GURION INTL      ← from airport
 *   ROME                 ← to city
 *   FIUMICINO            ← to airport
 *   XQ381 06:40          ← flight number + departure time
 *   03MAR2027            ← departure date
 *   09:55                ← arrival time
 *   03MAR2027            ← arrival date
 *
 * Airport codes come from the baggage table ("TLVFCO" per leg) when it lists every leg.
 */
export function eticketLegs(text: string): {
  legs: SegmentDraft[];
  cities: Record<string, string>;
} {
  const lines = text.split('\n').map((l) => l.trim());
  const legs: SegmentDraft[] = [];
  const cityOf: { from: string; to: string }[] = [];
  for (let i = 4; i + 3 < lines.length; i++) {
    const head = NUMBER_TIME.exec(lines[i]!);
    if (!head) continue;
    const departDate = compactDate(lines[i + 1]!);
    const arriveTime = TIME.exec(lines[i + 2]!);
    const arriveDate = compactDate(lines[i + 3]!);
    const [fromCity, fromName, toCity, toName] = lines.slice(i - 4, i);
    if (!departDate || ![fromCity, fromName, toCity, toName].every((l) => PLACE.test(l ?? '')))
      continue;
    legs.push({
      carrier: head[1]!,
      number: `${head[1]} ${head[2]}`,
      fromName: title(fromName!),
      toName: title(toName!),
      departLocal: `${departDate}T${head[3]}:${head[4]}`,
      arriveLocal:
        arriveTime && (arriveDate ?? departDate)
          ? `${arriveDate ?? departDate}T${arriveTime[1]}:${arriveTime[2]}`
          : null,
    });
    cityOf.push({ from: title(fromCity!), to: title(toCity!) });
    i += 3;
  }

  // "TLVFCO" / "FCOTLV": one line per leg, in order, under the baggage allowance.
  // Only pairs that head a baggage row ("ISRAEL" is six capitals too).
  const pairs = lines
    .map((l, i) => (/\bbag/i.test(lines[i + 1] ?? '') ? /^([A-Z]{3})([A-Z]{3})$/.exec(l) : null))
    .filter((m) => m !== null);
  const cities: Record<string, string> = {};
  if (pairs.length === legs.length) {
    legs.forEach((leg, i) => {
      leg.fromCode = pairs[i]![1]!;
      leg.toCode = pairs[i]![2]!;
      leg.departTz = AIRPORTS[leg.fromCode]?.tz ?? null;
      leg.arriveTz = AIRPORTS[leg.toCode]?.tz ?? null;
      cities[leg.fromCode] = AIRPORTS[leg.fromCode]?.city ?? cityOf[i]!.from;
      cities[leg.toCode] = AIRPORTS[leg.toCode]?.city ?? cityOf[i]!.to;
    });
  } else {
    // No codes: titles use the city names printed on the ticket.
    legs.forEach((leg, i) => {
      cities[leg.fromName!] = cityOf[i]!.from;
      cities[leg.toName!] = cityOf[i]!.to;
    });
  }
  return { legs, cities };
}
