import type { SegmentDraft } from './types.js';

/** Absolute time of a segment wall clock, if its zone is a fixed offset or UTC. */
function instant(local: string | null | undefined, tz: string | null | undefined): number | null {
  if (!local || local.length < 16) return null;
  if (tz === 'UTC') return Date.parse(`${local}:00Z`);
  if (tz && /^[+-]\d{2}:\d{2}$/.test(tz)) return Date.parse(`${local}:00${tz}`);
  return Date.parse(`${local}:00Z`); // good enough for comparing gaps
}

/**
 * Compact title for a flight booking: "Tel Aviv ⇄ Rome" for a round trip, "Tel Aviv → Rome" one way.
 * The destination is where the longest stop is (connections are short), so
 * TLV→ZRH→FCO … FCO→ZRH→TLV reads "Tel Aviv ⇄ Rome". `names` maps codes to city names.
 */
export function flightTitle(legs: SegmentDraft[], names: Record<string, string> = {}): string {
  const first = legs[0]!;
  const last = legs.at(-1)!;
  let dest = first.toCode ?? first.toName ?? '?';
  let longest = -1;
  for (let i = 0; i < legs.length - 1; i++) {
    const arrive = instant(
      legs[i]!.arriveLocal ?? legs[i]!.departLocal,
      legs[i]!.arriveTz ?? legs[i]!.departTz,
    );
    const depart = instant(legs[i + 1]!.departLocal, legs[i + 1]!.departTz);
    const gap = arrive !== null && depart !== null ? depart - arrive : 0;
    if (gap > longest) {
      longest = gap;
      dest = legs[i]!.toCode ?? legs[i]!.toName ?? dest;
    }
  }
  const origin = first.fromCode ?? first.fromName ?? '?';
  // One way (incl. connections): the destination is simply where the last leg lands.
  if ((last.toCode ?? last.toName) !== origin) dest = last.toCode ?? last.toName ?? dest;
  const label = (code: string) => names[code] ?? code;
  const roundTrip = legs.length > 1 && (last.toCode ?? last.toName) === origin;
  return `${label(origin)} ${roundTrip ? '⇄' : '→'} ${label(dest)}`;
}
