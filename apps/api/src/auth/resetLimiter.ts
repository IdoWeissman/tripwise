const HOUR = 60 * 60_000;
/** Reset emails one address can receive per rolling hour. */
export const RESET_EMAILS_PER_HOUR = 3;

/**
 * Per-address limit on reset emails, held in memory (one API instance). A sliding hour: another
 * email is allowed while fewer than 3 were *sent* to that address in the last 60 minutes — a
 * request that fails to send (email down) uses nothing up.
 */
export function createResetLimiter(limit = RESET_EMAILS_PER_HOUR, windowMs = HOUR) {
  const sent = new Map<string, number[]>();
  const recent = (key: string, now: number) => {
    const times = (sent.get(key) ?? []).filter((t) => t > now - windowMs);
    sent.set(key, times);
    return times;
  };
  const keyOf = (email: string) => email.trim().toLowerCase();
  return {
    /** Whether another reset email may go to this address now. */
    allows(email: string, now = Date.now()): boolean {
      return recent(keyOf(email), now).length < limit;
    },
    /** Counts a reset email that was actually sent. */
    recordSent(email: string, now = Date.now()): void {
      recent(keyOf(email), now).push(now);
    },
  };
}

export type ResetLimiter = ReturnType<typeof createResetLimiter>;
