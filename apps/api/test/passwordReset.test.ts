import { describe, expect, it } from 'vitest';
import { resetLinkAccountId, signResetLink, verifyResetLink } from '../src/auth/passwordReset.js';

const SECRET = 'test-secret';
const shir = { id: 'u1', passwordHash: '$argon2id$v=19$m=65536$old-hash' };
const at = (iso: string) => new Date(iso).getTime();
const NOW = at('2027-05-16T09:00:00Z');

describe('reset link', () => {
  it('works for its account for 30 minutes', () => {
    const link = signResetLink(shir, SECRET, NOW);
    expect(resetLinkAccountId(link)).toBe('u1');
    expect(verifyResetLink(link, shir, SECRET, at('2027-05-16T09:29:00Z'))).toBe(true);
    expect(verifyResetLink(link, shir, SECRET, at('2027-05-16T09:31:00Z'))).toBe(false);
  });

  it('stops working once the password changes, so it can only be used once', () => {
    const link = signResetLink(shir, SECRET, NOW);
    const afterReset = { ...shir, passwordHash: '$argon2id$v=19$m=65536$new-hash' };
    expect(verifyResetLink(link, afterReset, SECRET, NOW)).toBe(false);
  });

  it("can't be used for another account, or forged", () => {
    const link = signResetLink(shir, SECRET, NOW);
    expect(verifyResetLink(link, { ...shir, id: 'u2' }, SECRET, NOW)).toBe(false);
    expect(verifyResetLink(link, shir, 'another-secret', NOW)).toBe(false);
    expect(resetLinkAccountId('not-a-link')).toBeNull();
    expect(verifyResetLink('not-a-link', shir, SECRET, NOW)).toBe(false);
  });
});
