import jwt from 'jsonwebtoken';

export const AUTH_COOKIE = 'tw_session';
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

interface TokenPayload {
  sub: string;
}

export function signSession(userId: string, secret: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, secret, { expiresIn: TTL_SECONDS });
}

export function verifySession(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret) as TokenPayload;
    return payload.sub;
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
