/** In-app paths only: anything else (absolute, protocol-relative) falls back to the trips list. */
export const safeNext = (next: string | null) =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

/**
 * Where to go after signing in or up. A brand-new account with nowhere to go yet starts at
 * /welcome (first trip); an invite (?next=/join/…) or any other destination wins, so invited
 * friends land straight in the trip they were invited to.
 */
export function afterAuthPath(mode: 'signIn' | 'signUp', next: string | null): string {
  if (mode === 'signUp' && !next) return '/welcome';
  return safeNext(next);
}
