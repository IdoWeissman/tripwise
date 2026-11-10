import { describe, expect, it } from 'vitest';
import { generateToken, hashToken, readBearer, TOKEN_PREFIX } from '../src/auth/apiTokens.js';

describe('personal access tokens', () => {
  it('generates prefixed, random, base62 tokens', () => {
    const tokens = Array.from({ length: 200 }, () => generateToken());
    for (const { token, hash, prefix } of tokens) {
      expect(token).toMatch(/^tw_pat_[A-Za-z0-9]{32}$/);
      expect(hash).toBe(hashToken(token));
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(prefix).toBe(token.slice(0, TOKEN_PREFIX.length + 4));
    }
    expect(new Set(tokens.map((t) => t.token)).size).toBe(200);
  });

  it('reads only well-formed bearer tokens', () => {
    const { token } = generateToken();
    expect(readBearer(`Bearer ${token}`)).toBe(token);
    expect(readBearer(`bearer ${token} `)).toBe(token);
    expect(readBearer(undefined)).toBeNull();
    expect(readBearer(token)).toBeNull();
    expect(readBearer(`Basic ${token}`)).toBeNull();
    expect(readBearer('Bearer eyJhbGciOiJIUzI1NiJ9.e30.x')).toBeNull();
    expect(readBearer(`Bearer ${token}x`)).toBeNull();
  });
});
