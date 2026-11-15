import { describe, expect, it } from 'vitest';
import { readCookie, readSession, signSession } from '../src/auth/tokens.js';

const secret = 'test-secret-test-secret-test-secret-123';

describe('session tokens', () => {
  it('round-trips a user id', () => {
    expect(readSession(signSession('user-1', secret), secret)?.userId).toBe('user-1');
  });

  it('rejects tampered tokens', () => {
    expect(readSession(signSession('user-1', secret) + 'x', secret)).toBeNull();
  });

  it('reads a cookie from a header', () => {
    expect(readCookie('a=1; tw_session=abc%3D; b=2', 'tw_session')).toBe('abc=');
  });
});
