import jwt from 'jsonwebtoken';

export const AUTH_COOKIE = 'tw_session';
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

interface TokenPayload {
  sub: string;
  typ: 'session';
  /** Issue time in ms — JWT's iat is whole seconds, too coarse to order against a password change. */
  iatMs?: number;
}

export function signSession(userId: string, secret: string, now = Date.now()): string {
  return jwt.sign({ sub: userId, typ: 'session', iatMs: now } satisfies TokenPayload, secret, {
    expiresIn: TTL_SECONDS,
  });
}

/** A validly signed, unexpired session: who, and when it was issued. Use resolveSession() to authenticate. */
export function readSession(
  token: string | undefined,
  secret: string,
): { userId: string; issuedAtMs: number } | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret) as Partial<TokenPayload> & { iat?: number };
    if (payload.typ !== 'session' || !payload.sub) return null;
    // Sessions from before iatMs existed fall back to the second-precision iat.
    return { userId: payload.sub, issuedAtMs: payload.iatMs ?? (payload.iat ?? 0) * 1000 };
  } catch {
    return null;
  }
}

// --- Invite links: stateless signed tokens (no DB table needed) ---

export interface InvitePayload {
  typ: 'invite';
  tripId: string;
  role: 'EDITOR' | 'VIEWER';
  /** inviter user id */
  inv: string;
}

const INVITE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function signInvite(payload: Omit<InvitePayload, 'typ'>, secret: string): string {
  return jwt.sign({ ...payload, typ: 'invite' } satisfies InvitePayload, secret, {
    expiresIn: INVITE_TTL_SECONDS,
  });
}

export function verifyInvite(token: string, secret: string): InvitePayload | null {
  try {
    const payload = jwt.verify(token, secret) as Partial<InvitePayload>;
    if (payload.typ !== 'invite' || !payload.tripId || !payload.role || !payload.inv) return null;
    if (payload.role !== 'EDITOR' && payload.role !== 'VIEWER') return null;
    return payload as InvitePayload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = (secure: boolean) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure,
  maxAge: TTL_SECONDS * 1000,
  path: '/',
});

/** Minimal cookie-header parser for WebSocket upgrade requests. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}
