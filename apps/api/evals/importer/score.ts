import type { Draft } from '../../src/bookings/parse/types.js';
import type { Expected } from './cases.js';

export type Field = keyof Expected | 'count';

export interface Miss {
  booking: number;
  field: Field;
  expected: unknown;
  actual: unknown;
}

export interface CaseScore {
  passed: number;
  total: number;
  /** passed/total per field, for the per-field table. */
  fields: Partial<Record<Field, { passed: number; total: number }>>;
  misses: Miss[];
}

/** Case, spacing and dash style don't matter; everything else does. */
const norm = (v: unknown) =>
  String(v ?? '')
    .normalize('NFKC')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const anyOf = (expected: string | string[], actual: unknown) =>
  (Array.isArray(expected) ? expected : [expected]).some((e) => norm(e) === norm(actual));

/** The values we score, read the same way from every draft. */
function view(d: Draft) {
  const first = d.segments[0];
  const last = d.segments.at(-1);
  return {
    type: d.type,
    title: d.title,
    provider: d.provider ?? null,
    code: d.confirmationCode ?? null,
    start: first?.departLocal ?? d.startLocal ?? null,
    end: last?.arriveLocal ?? d.endLocal ?? null,
    legs: d.segments.map((s) => s.number ?? null),
    travellers: d.travellers ?? null,
    price: d.price ?? null,
    currency: d.currency ?? null,
    location: d.location ?? null,
    address: d.address ?? null,
    bookingUrl: d.bookingUrl ?? null,
  };
}

function fieldOk(field: keyof Expected, expected: unknown, actual: unknown): boolean {
  switch (field) {
    case 'title':
    case 'provider':
    case 'location':
      return anyOf(expected as string | string[], actual);
    case 'code':
      return norm(expected).replace(/\s/g, '') === norm(actual).replace(/\s/g, '');
    case 'price':
      return actual !== null && Number(expected) === Number(actual);
    case 'travellers':
      return expected === actual;
    case 'legs': {
      const e = (expected as string[]).map((x) => norm(x).replace(/\s/g, ''));
      const a = ((actual as (string | null)[]) ?? []).map((x) => norm(x).replace(/\s/g, ''));
      return e.length === a.length && e.every((x, i) => x === a[i]);
    }
    case 'start':
    case 'end':
      return typeof actual === 'string' && actual.slice(0, 16) === expected;
    default:
      return norm(expected) === norm(actual);
  }
}

/** Scores one case: each expected booking is paired with the draft that matches it best. */
export function scoreCase(expected: Expected[], drafts: Draft[]): CaseScore {
  const out: CaseScore = { passed: 0, total: 0, fields: {}, misses: [] };
  const tally = (field: Field, ok: boolean, booking: number, e: unknown, a: unknown) => {
    const f = (out.fields[field] ??= { passed: 0, total: 0 });
    f.total++;
    out.total++;
    if (ok) {
      f.passed++;
      out.passed++;
    } else out.misses.push({ booking, field, expected: e, actual: a });
  };

  tally('count', drafts.length === expected.length, -1, expected.length, drafts.length);

  const views = drafts.map(view);
  const used = new Set<number>();
  expected.forEach((exp, i) => {
    const keys = Object.keys(exp) as (keyof Expected)[];
    let best = -1;
    let bestHits = -1;
    views.forEach((v, j) => {
      if (used.has(j)) return;
      const hits = keys.filter((k) => fieldOk(k, exp[k], v[k])).length;
      if (hits > bestHits) [best, bestHits] = [j, hits];
    });
    if (best >= 0) used.add(best);
    const v = best >= 0 ? views[best]! : null;
    for (const k of keys)
      tally(k, v ? fieldOk(k, exp[k], v[k]) : false, i, exp[k], v ? v[k] : null);
  });
  return out;
}
