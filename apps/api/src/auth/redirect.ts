/** An in-app path to return to after auth ("/join/…"), or null for anything else (off-site, protocol-relative). */
export const safeNext = (next: string | null | undefined): string | null =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : null;
