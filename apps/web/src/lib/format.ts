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
  if (!signed || amount === 0) return amount < 0 ? `−${abs}` : abs;
  return `${amount < 0 ? '−' : '+'}${abs}`;
}

/** "Fri, May 14" */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** Parses a decimal string from the API. Display only — never do money math with it. */
export const toNumber = (decimal: string | null | undefined) => (decimal ? Number(decimal) : 0);

/** "2m ago", "1h ago", "Yesterday", then a date. */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
}

/** Whole days from today (UTC) until the date. */
export function daysUntil(iso: string, now = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((new Date(iso).getTime() - today) / 86_400_000);
}
