import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db.js';

/** Personal access tokens for AI assistants (MCP). Format: `tw_pat_` + 32 base62 characters. */
export const TOKEN_PREFIX = 'tw_pat_';
const BODY_LENGTH = 32;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Don't write `lastUsedAt` on every request: once a minute per token is plenty. */
const LAST_USED_THROTTLE_MS = 60_000;
/** Each user can hold a handful of live tokens; enough for several assistants, not a leak magnet. */
export const MAX_TOKENS_PER_USER = 10;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function generateToken(): { token: string; hash: string; prefix: string } {
  // Rejection sampling keeps every character equally likely (no modulo bias).
  let body = '';
  while (body.length < BODY_LENGTH) {
    for (const byte of randomBytes(BODY_LENGTH)) {
      if (byte < 248 && body.length < BODY_LENGTH) body += ALPHABET[byte % 62];
    }
  }
  const token = TOKEN_PREFIX + body;
  return { token, hash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 4) };
}

/** Reads `Authorization: Bearer tw_pat_…`. Returns null for anything else. */
export function readBearer(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  const token = match?.[1];
  return token?.startsWith(TOKEN_PREFIX) && token.length === TOKEN_PREFIX.length + BODY_LENGTH
    ? token
    : null;
}

/** Returns the token owner's user id, or null when the token is unknown or revoked. */
export async function verifyApiToken(db: Db, token: string): Promise<string | null> {
  const row = await db.apiToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.revokedAt) return null;
  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    // Best effort: a failed timestamp write must never fail the request.
    await db.apiToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date(now) } })
      .catch(() => undefined);
  }
  return row.userId;
}
