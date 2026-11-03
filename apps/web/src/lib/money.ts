/** Client-side cents math for live previews. The server re-validates everything. */

const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;

export function parseCents(value: string): number | null {
  const v = value.trim();
  if (!MONEY_RE.test(v)) return null;
  const [whole = '0', frac = ''] = v.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Equal split; leftover cents go to the first people (same rule as the API). */
export function equalShares(totalCents: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalCents / count);
  const rest = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rest ? 1 : 0));
}
