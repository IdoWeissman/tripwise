import type { GetAround, Pace, TravelMode } from '../../gql/graphql';
import type { DayPlan } from './queries';

export const PACES: { value: Pace; label: string; detail: string }[] = [
  { value: 'RELAXED', label: 'Relaxed', detail: 'Up to 3 stops, from 10:00, about 6 h out' },
  { value: 'BALANCED', label: 'Balanced', detail: 'Up to 5 stops, from 09:30, about 9 h out' },
  { value: 'PACKED', label: 'Packed', detail: 'Up to 7 stops, from 08:30, about 11 h out' },
];
export const GET_AROUND: { value: GetAround; label: string }[] = [
  { value: 'WALK_TRANSIT', label: 'Walk & transit' },
  { value: 'DRIVE', label: 'Drive' },
];
export const paceLabel = (p: Pace) => PACES.find((x) => x.value === p)?.label ?? p;
export const getAroundLabel = (g: GetAround) => GET_AROUND.find((x) => x.value === g)?.label ?? g;

/** "1 h 20 min", "45 min" (rules §1.7: figures, no abbreviations beyond h/min). */
export function durationText(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

const MODE: Record<TravelMode, string> = { WALK: 'walk', TRANSIT: 'by transit', DRIVE: 'drive' };
export const legText = (leg: { minutes: number; mode: TravelMode; estimated: boolean }) =>
  `${leg.estimated ? 'About ' : ''}${durationText(leg.minutes)} ${MODE[leg.mode]}`;

/** "3 stops · 40 min travel · 09:30–17:10". */
export const planSummary = (plan: DayPlan) => planSummaryParts(plan).join(' · ');

export function planSummaryParts(plan: DayPlan): string[] {
  const n = plan.stops.length;
  return [
    `${n} ${n === 1 ? 'stop' : 'stops'}`,
    plan.travelMinutes ? `${durationText(plan.travelMinutes)} travel` : null,
    plan.startTime && plan.endTime ? `${plan.startTime}–${plan.endTime}` : null,
  ].filter((x): x is string => Boolean(x));
}

/** Lengths offered when setting how long a stop takes. */
export const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360];
