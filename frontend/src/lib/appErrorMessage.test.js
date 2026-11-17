// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { appErrorMessage } from './appErrorMessage';
import { BackendRequestError } from './backendApi';
import { MESSAGES } from './friendlyError';

const FALLBACK = 'The thing could not be done. Please try again.';

describe('appErrorMessage (U5)', () => {
  it("shows the app's own sentence as it is", () => {
    expect(appErrorMessage(new Error('This draft file is not valid JSON. The current draft was kept.'), FALLBACK))
      .toBe('This draft file is not valid JSON. The current draft was kept.');
  });

  it("shows a backend request error's fixed sentence", () => {
    expect(appErrorMessage(new BackendRequestError('This saved lesson plan is unavailable.'), FALLBACK))
      .toBe('This saved lesson plan is unavailable.');
  });

  it('never shows a database error object', () => {
    const db = { message: 'permission denied for table lesson_plans', code: '42501', details: '', hint: 'GRANT ...' };
    expect(appErrorMessage(db, FALLBACK)).toBe(MESSAGES.permission);
    expect(appErrorMessage({ message: 'duplicate key value violates unique constraint "x"' }, FALLBACK)).toBe(FALLBACK);
  });

  it('never shows an Error subclass from a library (PostgrestError, TypeError)', () => {
    class PostgrestError extends Error {}
    expect(appErrorMessage(new PostgrestError('relation "worksheets" does not exist'), FALLBACK)).toBe(FALLBACK);
    expect(appErrorMessage(new TypeError("Cannot read properties of undefined (reading 'id')"), FALLBACK)).toBe(FALLBACK);
    expect(appErrorMessage(new TypeError('Failed to fetch'), FALLBACK)).toBe(MESSAGES.network);
  });

  it('uses the fallback for nothing, a string or an empty message', () => {
    expect(appErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(appErrorMessage('raw server text', FALLBACK)).toBe(FALLBACK);
    expect(appErrorMessage(new Error('   '), FALLBACK)).toBe(FALLBACK);
  });
});
