/**
 * Time-zone helpers. Bookings store UTC instants plus the zone they happen in
 * (an IANA name like "Europe/Lisbon" or a fixed offset like "+01:00"), and the
 * API exchanges wall-clock strings "YYYY-MM-DDTHH:mm" in that zone.
 */

const OFFSET_RE = /^([+-])(\d{2}):?(\d{2})$/;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/;

export function isValidZone(tz: string): boolean {
  if (OFFSET_RE.test(tz) || tz === 'UTC') return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at `instant`, in minutes (Lisbon summer → +60). */
export function zoneOffsetMinutes(instant: Date, tz: string): number {
  const m = OFFSET_RE.exec(tz);
  if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  if (tz === 'UTC') return 0;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** "2027-05-14T06:10" in `tz` → UTC instant. Date-only strings mean 00:00. */
export function localToInstant(local: string, tz: string): Date {
  const m = LOCAL_RE.exec(local.trim());
  if (!m) throw new Error(`"${local}" is not a valid date/time.`);
  const wall = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
  );
  // Two passes handle DST transitions correctly.
  let instant = wall - zoneOffsetMinutes(new Date(wall), tz) * 60000;
  instant = wall - zoneOffsetMinutes(new Date(instant), tz) * 60000;
  return new Date(instant);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC instant → "YYYY-MM-DDTHH:mm" wall clock in `tz`. */
export function instantToLocal(instant: Date, tz: string): string {
  const shifted = new Date(instant.getTime() + zoneOffsetMinutes(instant, tz) * 60000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(
    shifted.getUTCHours(),
  )}:${pad(shifted.getUTCMinutes())}`;
}

/** Calendar date ("YYYY-MM-DD") of an instant in `tz`. */
export const localDate = (instant: Date, tz: string) => instantToLocal(instant, tz).slice(0, 10);

/** "HH:mm" of an instant in `tz`. */
export const localTime = (instant: Date, tz: string) => instantToLocal(instant, tz).slice(11, 16);

/** Prisma @db.Date values are UTC midnights. */
export const dateKey = (d: Date) => d.toISOString().slice(0, 10);

/** Whole days between two "YYYY-MM-DD" strings. */
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
