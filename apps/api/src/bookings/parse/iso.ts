/** Splits an ISO-8601 date/time from structured data into wall clock + zone. */
export function splitIso(value: unknown): { local: string; tz: string | null } | null {
  if (typeof value !== 'string') return null;
  const m =
    /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/.exec(
      value.trim(),
    );
  if (!m) return null;
  const [, date, time, zone] = m;
  const tz = zone
    ? zone === 'Z'
      ? 'UTC'
      : zone.length === 5
        ? `${zone.slice(0, 3)}:${zone.slice(3)}`
        : zone
    : null;
  return { local: time ? `${date}T${time}` : date!, tz };
}
