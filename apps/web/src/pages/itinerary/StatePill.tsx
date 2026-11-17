/**
 * "Now" / "Next" on a day's card (rules §2 · 03 Today): signal yellow is for now and next, so the
 * day being lived reads at a glance. The word carries the state, never the colour alone.
 */
export function StatePill({ state }: { state: 'now' | 'next' }) {
  return (
    <span className="shrink-0 rounded-full bg-signal px-2 py-0.5 text-xs font-extrabold text-sign">
      {state === 'now' ? 'Now' : 'Next'}
    </span>
  );
}
