/**
 * The last Today screen that loaded, kept on this device so a phone that loses its connection at
 * the airport still shows the next departure and its booking code. Browser storage can be missing
 * or full (private windows, blocked site data), so every access is best-effort.
 */
const PREFIX = 'tripwise:overview:';

export interface Snapshot<T> {
  /** When it was saved (ms). */
  at: number;
  data: T;
}

export function saveSnapshot<T>(tripId: string, data: T, now = Date.now()): void {
  try {
    localStorage.setItem(PREFIX + tripId, JSON.stringify({ at: now, data }));
  } catch {
    /* storage unavailable: the page still works online */
  }
}

export function loadSnapshot<T>(tripId: string): Snapshot<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + tripId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot<T>;
    return typeof parsed?.at === 'number' && parsed.data ? parsed : null;
  } catch {
    return null;
  }
}

/** On sign-out: booking codes don't stay on a shared device. */
export function clearSnapshots(): void {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch {
    /* nothing stored */
  }
}
