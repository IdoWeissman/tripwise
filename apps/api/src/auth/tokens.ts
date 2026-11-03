import jwt from 'jsonwebtoken';

export const AUTH_COOKIE = 'tw_session';
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

interface TokenPayload {
  sub: string;
  typ: 'session';
}

export function signSession(userId: string, secret: string): string {
  return jwt.sign({ sub: userId, typ: 'session' } satisfies TokenPayload, secret, {
    expiresIn: TTL_SECONDS,
  });
}

export function verifySession(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret) as Partial<TokenPayload>;
    return payload.typ === 'session' && payload.sub ? payload.sub : null;
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
