/** Formatting helpers — docs/design-rules.md §1.7. */

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "May 14 – 19" or "May 30 – Jun 2" (en dash). */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  return `${MONTH.format(start)} – ${sameMonth ? end.getUTCDate() : MONTH.format(end)}`;
}

/** "€1,280.00"; signed adds "+" / "−" (real minus sign). */
export function formatMoney(amount: number, currency = 'EUR', signed = false): string {
  const abs = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    Math.abs(amount),
  );
  if (!signed) return amount < 0 ? `−${abs}` : abs;
  return `${amount < 0 ? '−' : '+'}${abs}`;
}
