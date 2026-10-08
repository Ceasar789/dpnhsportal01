// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLoginAttempts,
  isCredentialFailure,
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_LOCKOUT_MS,
  loginErrorMessage,
  readLoginAttempts,
  recordLoginFailure,
  remainingLockSeconds,
} from './loginAttemptLimit';

const EMAIL = 'User@Example.com';
const START = 1_800_000_000_000;

beforeEach(() => localStorage.clear());

describe('login attempt limit', () => {
  it('locks the normalized email after five failures for exactly 60 seconds', () => {
    for (let count = 1; count < LOGIN_ATTEMPT_LIMIT; count += 1) {
      const state = recordLoginFailure(EMAIL, START + count);
      expect(state).toEqual({ count, lockedUntil: null });
    }

    const locked = recordLoginFailure(' user@example.com ', START);
    expect(locked.count).toBe(5);
    expect(locked.lockedUntil).toBe(START + LOGIN_LOCKOUT_MS);
    expect(remainingLockSeconds(locked, START)).toBe(60);
    expect(readLoginAttempts(EMAIL, START + 59_000).count).toBe(5);
    expect(remainingLockSeconds(readLoginAttempts(EMAIL, START + 59_000), START + 59_000)).toBe(1);
    expect(readLoginAttempts(EMAIL, START + 60_000)).toEqual({ count: 0, lockedUntil: null });
  });

  it('clears a successful sequence and retires legacy permanent locks', () => {
    recordLoginFailure(EMAIL, START);
    clearLoginAttempts(EMAIL);
    expect(readLoginAttempts(EMAIL, START)).toEqual({ count: 0, lockedUntil: null });

    localStorage.setItem('smartedu-login-attempts:user@example.com', JSON.stringify({ count: 5, updatedAt: START }));
    expect(readLoginAttempts(EMAIL, START)).toEqual({ count: 0, lockedUntil: null });
  });

  it('counts only incorrect credentials and preserves specific user messages', () => {
    expect(isCredentialFailure({ code: 'invalid_credentials' })).toBe(true);
    expect(isCredentialFailure({ message: 'Invalid login credentials' })).toBe(true);
    expect(isCredentialFailure({ message: 'Failed to fetch' })).toBe(false);
    expect(isCredentialFailure({ code: 'over_request_rate_limit' })).toBe(false);

    expect(loginErrorMessage({ userMessage: 'Try again in 60 seconds.' })).toBe('Try again in 60 seconds.');
    expect(loginErrorMessage({ message: 'Invalid login credentials' })).toBe('Invalid email or password');
    expect(loginErrorMessage({ message: 'Too many requests' })).toBe('Too many attempts. Please try again later');
    expect(loginErrorMessage({ code: 'over_request_rate_limit' })).toBe('Too many attempts. Please try again later');
  });
});
