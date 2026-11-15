import { localToInstant } from '../../lib/time.js';
import type { Draft } from './types.js';

export type Evidence = Partial<
  Record<'confirmationCode' | 'startLocal' | 'endLocal' | 'price', string>
>;

/** Lower-case, no bidi marks, single spaces: how quotes and documents are compared. */
export const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const digits = (s: string) => s.replace(/\D/g, '');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Does the quote plausibly state this value? (The model can't quote one thing and record another.) */
function supports(field: keyof Evidence, value: string, quote: string): boolean {
  const q = normalize(quote);
  switch (field) {
    case 'confirmationCode':
      return q.replace(/[\s-]/g, '').includes(value.toLowerCase().replace(/[\s-]/g, ''));
    case 'price': {
      // "1450.00" is supported by "USD 1,450.00", "1450" or "1.450,00".
      const whole = value.split('.')[0]!;
      return digits(q).includes(whole);
    }
    default: {
      // A date is supported when its day appears as a number and its month as a number or name.
      const [, mo, d] = /^\d{4}-(\d{2})-(\d{2})/.exec(value) ?? [];
      if (!mo || !d) return false;
      const day = String(Number(d));
      const hasDay = new RegExp(`(^|\\D)0?${day}(\\D|$)`).test(q);
      const hasMonth =
        q.includes(MONTHS[Number(mo) - 1]!) || new RegExp(`(^|\\D)0?${Number(mo)}(\\D|$)`).test(q);
      return hasDay && hasMonth;
    }
  }
}

const instant = (local: string | null | undefined, tz: string | null | undefined) => {
  if (!local || local.length < 16) return null;
  try {
    return localToInstant(local, tz || 'UTC').getTime();
  } catch {
    return null;
  }
};

/**
 * Fields of an AI draft that need a human look. A value is trusted when its quote appears in the
 * document and states that value, and when it passes simple consistency checks.
 * `docText` is null for photos and scanned PDFs: then only the consistency checks run.
 */
export function fieldsToCheck(d: Draft, evidence: Evidence, docText: string | null): string[] {
  const out = new Set<string>();
  const doc = docText ? normalize(docText) : null;

  for (const field of ['confirmationCode', 'startLocal', 'endLocal', 'price'] as const) {
    const value = d[field];
    // Legs carry their own times; the booking's start/end are derived from them.
    if (!value || (d.segments.length && (field === 'startLocal' || field === 'endLocal'))) continue;
    const quote = evidence[field]?.trim() ?? '';
    if (!quote || !supports(field, value, quote)) out.add(field);
    else if (doc && !doc.includes(normalize(quote))) out.add(field);
  }

  // Consistency: things that can't be true of a real booking.
  const start = instant(d.startLocal, d.timeZone);
  const end = instant(d.endLocal, d.timeZone);
  if (start !== null && end !== null && end < start) out.add('endLocal');
  if (
    d.type === 'STAY' &&
    d.startLocal &&
    d.endLocal &&
    d.endLocal.slice(0, 10) <= d.startLocal.slice(0, 10)
  )
    out.add('endLocal');
  if ((d.price && !d.currency) || (!d.price && d.currency)) out.add('price');
  let previous: number | null = null;
  for (const s of d.segments) {
    const dep = instant(s.departLocal, s.departTz);
    const arr = instant(s.arriveLocal, s.arriveTz);
    if (dep !== null && arr !== null && arr < dep) out.add('segments');
    if (dep !== null && previous !== null && dep < previous) out.add('segments');
    previous = arr ?? dep ?? previous;
  }
  if (doc) {
    // Flight numbers must appear in the document ("XQ 381" matches "XQ381").
    const compact = doc.replace(/\s/g, '');
    for (const s of d.segments)
      if (s.number && !compact.includes(s.number.toLowerCase().replace(/\s/g, '')))
        out.add('segments');
  }
  return [...out];
}
