import type { Db } from '../db.js';
import { AUTH_COOKIE, readSession } from './tokens.js';

/**
 * The signed-in account for a session cookie, or null. Beyond the signature, a session issued
 * before the account's password last changed is rejected — a password reset signs the account out
 * everywhere else (ADR 0001). One indexed lookup by primary key per request.
 */
export async function resolveSession(
  token: string | undefined,
  secret: string,
  db: Db,
): Promise<string | null> {
  const session = readSession(token, secret);
  if (!session) return null;
  const account = await db.user.findUnique({
    where: { id: session.userId },
    select: { passwordChangedAt: true },
  });
  if (!account) return null;
  if (account.passwordChangedAt && session.issuedAtMs < account.passwordChangedAt.getTime()) {
    return null;
  }
  return session.userId;
}

/** resolveSession for an HTTP request's session cookie. */
export const sessionFromRequest = (
  req: { cookies?: Record<string, unknown> },
  secret: string,
  db: Db,
) => resolveSession(req.cookies?.[AUTH_COOKIE] as string | undefined, secret, db);
