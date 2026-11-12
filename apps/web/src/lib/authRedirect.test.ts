import { describe, expect, it } from 'vitest';
import { afterAuthPath } from './authRedirect';

describe('afterAuthPath', () => {
  it('starts a new account at /welcome', () => {
    expect(afterAuthPath('signUp', null)).toBe('/welcome');
  });
  it('lets an invite (or any next) win over onboarding', () => {
    expect(afterAuthPath('signUp', '/join/abc')).toBe('/join/abc');
    expect(afterAuthPath('signIn', '/trips/1/expenses')).toBe('/trips/1/expenses');
  });
  it('sends sign-ins home and ignores off-site next values', () => {
    expect(afterAuthPath('signIn', null)).toBe('/');
    expect(afterAuthPath('signUp', '//evil.example')).toBe('/');
  });
});
