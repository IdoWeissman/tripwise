/**
 * The day planner (planning milestone 2): plain, deterministic rules, so results are predictable
 * and testable. No I/O here — `service.ts` gathers the day and the travel times.
 *
 * Times are minutes after local midnight in the trip's time zone.
 */

export type Pace = 'RELAXED' | 'BALANCED' | 'PACKED';
export type TravelMode = 'WALK' | 'TRANSIT' | 'DRIVE';
export type StopKind =
  | 'FOOD'
  | 'CAFE'
  | 'MUSEUM'
  | 'PARK'
  | 'SHOW'
  | 'SHOP'
  | 'SIGHT'
  | 'WORSHIP'
  | 'THEME_PARK'
  | 'OTHER';

export type IssueKind =
  | 'CLOSED'
  | 'TIGHT'
  | 'OVERLAP'
  | 'LONG_TRAVEL'
  | 'OUTSIDE_WINDOW'
  | 'BOOKING_CLASH'
  | 'PACKED'
  | 'NO_LUNCH';

/** Problems that make a day impossible as planned (the rest are advice). */
export const HARD: ReadonlySet<IssueKind> = new Set([
  'CLOSED',
  'TIGHT',
  'OVERLAP',
  'OUTSIDE_WINDOW',
  'BOOKING_CLASH',
]);

/** Google's opening-hours period: day 0 = Sunday; no `close` = open around the clock. */
export interface Period {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}

export interface Leg {
  minutes: number;
  mode: TravelMode;
  meters: number | null;
  /** From straight-line distance, not a routing service. */
  estimated: boolean;
}

export interface StopInput {
  id: string;
  title: string;
  /** "HH:mm" set by the group, or null ("Any time"). */
  startTime: string | null;
  durationMinutes: number | null;
  /** Stands for a booking: its time can't move. */
  fixed: boolean;
  /** Index into the travel matrix, or null when the stop has no place. */
  point: number | null;
  kind: StopKind | null;
  /** Null when unknown (no place, or hours not available). */
  hours: Period[] | null;
}

export interface Block {
  title: string;
  from: number;
  until: number;
}

export interface DayInput {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  pace: Pace;
  /** In the order the day shows them (timed first by time, then untimed in saved order). */
  stops: StopInput[];
  /** Matrix index of where the group sleeps, or null. */
  anchor: number | null;
  travel: (from: number, to: number) => Leg | null;
  /** Earliest time plans can start (e.g. 90 min after the flight lands), and why. */
  from?: { at: number; reason: string } | null;
  /** Latest time plans can end (e.g. leave for the airport), and why. */
  until?: { at: number; reason: string } | null;
  /** Timed bookings that aren't on the board as activities (a show, a tour). */
  blocks?: Block[];
  /** When the group leaves in the morning; defaults to the pace's usual start. */
  leaveAt?: number | null;
}

export interface PlannedStop {
  id: string;
  start: number;
  end: number;
  durationMinutes: number;
  durationEstimated: boolean;
  /** How to get here from the previous stop (or the stay); null when unknown. */
  travel: Leg | null;
}

export interface Issue {
  kind: IssueKind;
  activityId: string | null;
  message: string;
}

export interface DayPlan {
  stops: PlannedStop[];
  backToStay: Leg | null;
  issues: Issue[];
  travelMinutes: number;
  startsAt: number | null;
  endsAt: number | null;
  travelEstimated: boolean;
}

export const PACE: Record<
  Pace,
  { dayStart: number; maxStops: number; budget: number; longLeg: number; label: string }
> = {
  RELAXED: { dayStart: 10 * 60, maxStops: 3, budget: 6 * 60, longLeg: 30, label: 'relaxed' },
  BALANCED: { dayStart: 9 * 60 + 30, maxStops: 5, budget: 9 * 60, longLeg: 40, label: 'balanced' },
  PACKED: {
    dayStart: 8 * 60 + 30,
    maxStops: 7,
    budget: 11 * 60 + 30,
    longLeg: 50,
    label: 'packed',
  },
};

/** Typical visit length when the group hasn't set one. */
export const TYPICAL_MINUTES: Record<StopKind, number> = {
  FOOD: 75,
  CAFE: 45,
  MUSEUM: 120,
  PARK: 90,
  SHOW: 150,
  SHOP: 60,
  SIGHT: 60,
  WORSHIP: 45,
  THEME_PARK: 240,
  OTHER: 90,
};

const WEEKDAYS = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];
const WEEK = 7 * 1440;

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};
/** "09:05"; past midnight wraps ("00:30"). */
export const hhmm = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** "1 h 20 min", "45 min". */
export const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};
const MODE_WORD: Record<TravelMode, string> = {
  WALK: 'walk',
  TRANSIT: 'by transit',
  DRIVE: 'drive',
};
export const legText = (leg: Leg) =>
  `${leg.estimated ? 'about ' : ''}${duration(leg.minutes)} ${MODE_WORD[leg.mode]}`;

/** Google primary types → kinds the planner reasons about. */
export function kindOf(primaryType: string | null | undefined): StopKind | null {
  if (!primaryType) return null;
  const t = primaryType;
  if (/restaurant$|^meal_|^food_court$|^diner$|^steak_house$|^pizzeria$/.test(t)) return 'FOOD';
  if (/^(cafe|coffee_shop|bakery|ice_cream_shop|tea_house|dessert_shop|bar|wine_bar|pub)$/.test(t))
    return 'CAFE';
  if (/^(museum|art_gallery|art_museum|history_museum)$/.test(t)) return 'MUSEUM';
  if (/^(amusement_park|water_park|theme_park|zoo|aquarium|wildlife_park)$/.test(t))
    return 'THEME_PARK';
  if (
    /^(park|garden|botanical_garden|beach|national_park|hiking_area|state_park|city_park)$/.test(t)
  )
    return 'PARK';
  if (
    /^(performing_arts_theater|concert_hall|movie_theater|stadium|night_club|opera_house|arena)$/.test(
      t,
    )
  )
    return 'SHOW';
  if (/^(shopping_mall|market|farmers_market)$|_store$/.test(t)) return 'SHOP';
  if (/^(church|mosque|synagogue|hindu_temple|place_of_worship|buddhist_temple|cathedral)$/.test(t))
    return 'WORSHIP';
  if (
    /^(tourist_attraction|historical_landmark|monument|observation_deck|plaza|historical_place|castle|palace|cultural_landmark)$/.test(
      t,
    )
  )
    return 'SIGHT';
  return 'OTHER';
}

const lengthOf = (s: StopInput) => ({
  minutes: s.durationMinutes ?? TYPICAL_MINUTES[s.kind ?? 'OTHER'],
  estimated: s.durationMinutes == null,
});

// ---------- opening hours ----------

/** Open intervals in minutes since Sunday 00:00, unwrapped so close > open. */
function intervals(periods: Period[]): [number, number][] {
  return periods.map((p) => {
    const open = p.open.day * 1440 + p.open.hour * 60 + p.open.minute;
    if (!p.close) return [0, WEEK * 2];
    let close = p.close.day * 1440 + p.close.hour * 60 + p.close.minute;
    if (close <= open) close += WEEK;
    return [open, close];
  });
}

/** Why a visit from `start` to `end` on `weekday` doesn't fit the hours, or null when it does. */
export function closedReason(
  periods: Period[],
  weekday: number,
  start: number,
  end: number,
): string | null {
  if (!periods.length) return null;
  const all = intervals(periods);
  const s = weekday * 1440 + start;
  const e = weekday * 1440 + end;
  const fits = all.some(([o, c]) =>
    [0, WEEK, -WEEK].some((shift) => o + shift <= s && e <= c + shift),
  );
  if (fits) return null;
  // Openings on this weekday, in local minutes.
  const today = all
    .flatMap(([o, c]) =>
      [0, WEEK, -WEEK].map((shift): [number, number] => [
        o + shift - weekday * 1440,
        c + shift - weekday * 1440,
      ]),
    )
    .filter(([o, c]) => c > 0 && o < 1440)
    .sort((x, y) => x[0] - y[0]);
  if (!today.length) return `Closed on ${WEEKDAYS[weekday]}`;
  const during = today.find(([o, c]) => o <= start && start < c);
  if (during) return `Closes at ${hhmm(during[1])}`;
  const next = today.find(([o]) => o > start);
  if (next) return `Opens at ${hhmm(next[0])}`;
  return `Closed after ${hhmm(today[today.length - 1]![1])}`;
}

/** When a place next opens at or after `t` on `weekday` (to wait instead of arriving early). */
function openingAtOrAfter(periods: Period[], weekday: number, t: number): number {
  if (!periods.length) return t;
  const base = weekday * 1440;
  let best: number | null = null;
  for (const [o, c] of intervals(periods)) {
    for (const shift of [0, WEEK, -WEEK]) {
      const open = o + shift - base;
      const close = c + shift - base;
      if (open <= t && t < close) return t;
      if (open > t && open < 1440 && (best === null || open < best)) best = open;
    }
  }
  return best ?? t;
}

// ---------- the day ----------

/**
 * Lays the day out in its order: each stop starts at its set time, or as soon as the group can
 * get there (waiting for opening time). Then checks it.
 */
export function planDay(input: DayInput): DayPlan {
  const pace = PACE[input.pace];
  const stops: PlannedStop[] = [];
  const issues: Issue[] = [];
  let cursor: number | null = null;
  let prevPoint = input.anchor;
  let prevTitle: string | null = null;
  let travelMinutes = 0;
  let estimated = false;
  const earliest = Math.max(input.leaveAt ?? pace.dayStart, input.from?.at ?? 0);

  for (const s of input.stops) {
    const travel =
      prevPoint !== null && s.point !== null && prevPoint !== s.point
        ? input.travel(prevPoint, s.point)
        : null;
    if (travel) {
      travelMinutes += travel.minutes;
      estimated ||= travel.estimated;
    }
    const length = lengthOf(s);
    let start: number;
    if (s.startTime) {
      start = toMinutes(s.startTime);
      if (cursor !== null && prevTitle) {
        if (start < cursor) {
          issues.push({
            kind: 'OVERLAP',
            activityId: s.id,
            message: `Starts before ${prevTitle} ends (${hhmm(cursor)})`,
          });
        } else if (travel && cursor + travel.minutes > start + 5) {
          issues.push({
            kind: 'TIGHT',
            activityId: s.id,
            message: `${legText(travel)} from ${prevTitle}, but only ${duration(start - cursor)} between them`,
          });
        }
      }
    } else {
      const ready =
        cursor === null ? earliest + (travel?.minutes ?? 0) : cursor + (travel?.minutes ?? 0);
      start = s.hours ? openingAtOrAfter(s.hours, input.weekday, ready) : ready;
    }
    const end = start + length.minutes;
    if (travel && travel.minutes > pace.longLeg)
      issues.push({
        kind: 'LONG_TRAVEL',
        activityId: s.id,
        message: `${legText(travel)}${prevTitle ? ` from ${prevTitle}` : ' from where you stay'}`,
      });
    if (s.hours) {
      const why = closedReason(s.hours, input.weekday, start, end);
      if (why)
        issues.push({
          kind: 'CLOSED',
          activityId: s.id,
          message: `${why} (planned ${hhmm(start)}–${hhmm(end)})`,
        });
    }
    if (input.from && start < input.from.at)
      issues.push({
        kind: 'OUTSIDE_WINDOW',
        activityId: s.id,
        message: `Before you're free: ${input.from.reason}`,
      });
    if (input.until && end > input.until.at)
      issues.push({
        kind: 'OUTSIDE_WINDOW',
        activityId: s.id,
        message: `Too late: ${input.until.reason}`,
      });
    if (!s.fixed)
      for (const b of input.blocks ?? [])
        if (start < b.until && b.from < end)
          issues.push({
            kind: 'BOOKING_CLASH',
            activityId: s.id,
            message: `Clashes with ${b.title} (${hhmm(b.from)}–${hhmm(b.until)})`,
          });
    stops.push({
      id: s.id,
      start,
      end,
      durationMinutes: length.minutes,
      durationEstimated: length.estimated,
      travel,
    });
    cursor = Math.max(cursor ?? 0, end);
    if (s.point !== null) prevPoint = s.point;
    else prevPoint = null; // somewhere we can't locate: the next leg is unknown
    prevTitle = s.title;
  }

  const backToStay =
    input.anchor !== null && prevPoint !== null && prevPoint !== input.anchor
      ? input.travel(prevPoint, input.anchor)
      : null;
  if (backToStay) estimated ||= backToStay.estimated;

  const startsAt = stops.length ? Math.min(...stops.map((s) => s.start)) : null;
  const endsAt = stops.length ? Math.max(...stops.map((s) => s.end)) : null;

  // The whole day.
  if (startsAt !== null && endsAt !== null) {
    const out = endsAt - startsAt + (stops[0]?.travel?.minutes ?? 0) + (backToStay?.minutes ?? 0);
    if (stops.length > pace.maxStops || out > pace.budget)
      issues.push({
        kind: 'PACKED',
        activityId: null,
        message: `${stops.length} stops and ${duration(out)} out — a lot for a ${pace.label} pace`,
      });
    const lunch = [11 * 60 + 30, 14 * 60 + 30];
    if (startsAt <= 12 * 60 && endsAt >= 14 * 60 + 30) {
      const eats = input.stops.some((s, i) => {
        const p = stops[i]!;
        return (s.kind === 'FOOD' || s.kind === 'CAFE') && p.start < lunch[1]! && p.end > lunch[0]!;
      });
      const sorted = [...stops].sort((a, b) => a.start - b.start);
      const gap = sorted.some((p, i) => {
        const next = sorted[i + 1];
        if (!next) return false;
        const free = next.start - p.end - (next.travel?.minutes ?? 0);
        return free >= 45 && p.end < lunch[1]! - 45 && next.start > lunch[0]!;
      });
      if (!eats && !gap)
        issues.push({
          kind: 'NO_LUNCH',
          activityId: null,
          message: 'No time for lunch between 11:30 and 14:30',
        });
    }
  }

  return {
    stops,
    backToStay,
    issues,
    travelMinutes: travelMinutes + (backToStay?.minutes ?? 0),
    startsAt,
    endsAt,
    travelEstimated: estimated,
  };
}

const problems = (n: number) => (n === 1 ? 'a timing problem' : `${n} timing problems`);

export const hardIssues = (plan: DayPlan) => plan.issues.filter((i) => HARD.has(i.kind)).length;

// ---------- arrange ----------

export interface Arrangement {
  /** The stops in their new order, with the times they'd get. */
  order: { id: string; startTime: string }[];
  plan: DayPlan;
  better: boolean;
  savedMinutes: number;
  reason: string;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]),
  );
}

/**
 * Re-orders the day by route, starting and ending at the stay, and gives each stop a time.
 * Stops that stand for a booking keep their time and slot, and so do stops without a place
 * (we can't know where they are). Never returns an arrangement with more travel, a later end or
 * more hard problems than the day has now.
 */
export function arrangeDay(input: DayInput): Arrangement {
  const before = planDay(input);
  const keep = (s: StopInput) => s.fixed || s.point === null;
  const slots = input.stops.flatMap((s, i) => (keep(s) ? [] : [i]));
  const movable = slots.map((i) => input.stops[i]!);

  const same = (reason: string): Arrangement => ({
    order: before.stops.map((p) => ({ id: p.id, startTime: hhmm(p.start) })),
    plan: before,
    better: false,
    savedMinutes: 0,
    reason,
  });
  if (movable.length < 2)
    return same('There’s nothing to re-order: it needs two stops with a place.');

  // Keep the day's start: leave the stay when the group does now.
  const leaveAt =
    before.startsAt !== null ? before.startsAt - (before.stops[0]?.travel?.minutes ?? 0) : null;
  const build = (order: StopInput[]): StopInput[] => {
    const stops = [...input.stops];
    slots.forEach((slot, i) => (stops[slot] = order[i]!));
    // Every stop that isn't a booking gets a new time, so the board shows the new order.
    return stops.map((s) => (s.fixed ? s : { ...s, startTime: null }));
  };
  const score = (plan: DayPlan) =>
    hardIssues(plan) * 10_000 + plan.travelMinutes * 10 + (plan.endsAt ?? 0) / 100;
  const search = (leave: number | null) => {
    const tryOrder = (order: StopInput[]) => {
      const stops = build(order);
      return { order, stops, plan: planDay({ ...input, stops, leaveAt: leave }) };
    };
    let best = tryOrder(movable);
    const consider = (order: StopInput[]) => {
      const r = tryOrder(order);
      if (score(r.plan) < score(best.plan)) best = r;
    };
    if (movable.length <= 7) {
      for (const p of permutations(movable)) consider(p);
    } else {
      // Too many to try every order: improve by reversing stretches (2-opt) until nothing helps.
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < best.order.length - 1; i++)
          for (let j = i + 1; j < best.order.length; j++) {
            const o = best.order;
            const was = score(best.plan);
            consider([...o.slice(0, i), ...o.slice(i, j + 1).reverse(), ...o.slice(j + 1)]);
            if (score(best.plan) < was) improved = true;
          }
      }
    }
    return best;
  };

  let best = search(leaveAt);
  // Starting at the pace's usual time is tried only to fix something (a place that closes early).
  const usual = PACE[input.pace].dayStart;
  if (hardIssues(best.plan) > 0 && leaveAt !== null && usual < leaveAt) {
    const earlier = search(usual);
    if (hardIssues(earlier.plan) < hardIssues(best.plan)) best = earlier;
  }

  // The window check uses the real constraint, not the shifted start.
  const plan = planDay({
    ...input,
    stops: best.stops.map((s, i) =>
      s.fixed ? s : { ...s, startTime: hhmm(best.plan.stops[i]!.start) },
    ),
  });
  const saved = before.travelMinutes - plan.travelMinutes;
  const fewerProblems = hardIssues(plan) < hardIssues(before);
  const noWorse =
    hardIssues(plan) <= hardIssues(before) &&
    (fewerProblems || (saved >= 3 && (plan.endsAt ?? 0) <= (before.endsAt ?? 0)));
  const sameOrder = best.stops.every((s, i) => s.id === input.stops[i]!.id);
  if (!noWorse || (sameOrder && !fewerProblems))
    return same('This day is already in a good order.');
  return {
    order: plan.stops.map((p) => ({ id: p.id, startTime: hhmm(p.start) })),
    plan,
    better: true,
    savedMinutes: Math.max(0, saved),
    reason: fewerProblems
      ? `Fixes ${problems(hardIssues(before) - hardIssues(plan))}${saved > 0 ? ` and saves ${duration(saved)} of travel` : ''}`
      : `Saves ${duration(saved)} of travel`,
  };
}
