import jwt from 'jsonwebtoken';

/** How long a reset link works. */
export const RESET_LINK_MINUTES = 30;

interface ResetPayload {
  sub: string;
  typ: 'reset';
}

/**
 * The signing key includes the account's current password hash, so a reset link stops working the
 * moment the password changes — single-use without storing anything (GLOSSARY: Reset link).
 */
const keyFor = (account: { passwordHash: string }, secret: string) =>
  `${secret}:${account.passwordHash}`;

export function signResetLink(
  account: { id: string; passwordHash: string },
  secret: string,
  now = Date.now(),
): string {
  return jwt.sign(
    { sub: account.id, typ: 'reset', iat: Math.floor(now / 1000) } satisfies ResetPayload & {
      iat: number;
    },
    keyFor(account, secret),
    { expiresIn: RESET_LINK_MINUTES * 60 },
  );
}

/** Which account a link claims to be for — unverified; load that account, then verify. */
export function resetLinkAccountId(link: string): string | null {
  const payload = jwt.decode(link) as Partial<ResetPayload> | null;
  return payload?.typ === 'reset' && typeof payload.sub === 'string' ? payload.sub : null;
}

export function verifyResetLink(
  link: string,
  account: { id: string; passwordHash: string },
  secret: string,
  now = Date.now(),
): boolean {
  try {
    const payload = jwt.verify(link, keyFor(account, secret), {
      clockTimestamp: Math.floor(now / 1000),
    }) as Partial<ResetPayload>;
    return payload.typ === 'reset' && payload.sub === account.id;
  } catch {
    return false;
  }
}
