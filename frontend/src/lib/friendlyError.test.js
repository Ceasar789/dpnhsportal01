// U2 form kit: lib/friendlyError.js never shows raw server or database text.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CODE_TABLE, friendlyError, GENERIC, MESSAGES } from './friendlyError';

const SENTENCES = new Set([...Object.values(MESSAGES), GENERIC]);

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('known codes', () => {
  it.each([
    [{ code: '23505', message: 'duplicate key value violates unique constraint "students_lrn_key"' }, MESSAGES.duplicate],
    [{ code: '23503', message: 'update or delete on table "sections" violates foreign key constraint' }, MESSAGES.inUse],
    [{ code: '23502', message: 'null value in column "name" violates not-null constraint' }, MESSAGES.invalid],
    [{ code: '23514', message: 'new row violates check constraint "sections_grade_level_7_10"' }, MESSAGES.invalid],
    [{ code: '22P02', message: 'invalid input syntax for type uuid: "abc"' }, MESSAGES.invalid],
    [{ code: '22001', message: 'value too long for type character varying(50)' }, MESSAGES.tooLong],
    [{ code: '42501', message: 'new row violates row-level security policy for table "worksheets"' }, MESSAGES.permission],
    [{ code: '57014', message: 'canceling statement due to statement timeout' }, MESSAGES.timeout],
    [{ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, MESSAGES.notFound],
    [{ code: 'PGRST301', message: 'JWT expired' }, MESSAGES.session],
    [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, MESSAGES.wrongLogin],
    [{ code: 'email_exists', message: 'A user with this email address has already been registered' }, MESSAGES.emailTaken],
    [{ code: 'weak_password', message: 'Password should contain at least one character of each' }, MESSAGES.weakPassword],
    [{ code: 'same_password', message: 'New password should be different from the old password.' }, MESSAGES.samePassword],
    [{ code: 'otp_expired', message: 'Email link is invalid or has expired' }, MESSAGES.linkExpired],
    [{ code: 'assignment_denied' }, MESSAGES.notAssigned],
    [{ code: 'historical_write_blocked' }, MESSAGES.pastYear],
    [{ code: 'not_authenticated' }, MESSAGES.session],
    [{ code: 'payload_too_large' }, MESSAGES.tooLarge],
  ])('%o', (error, sentence) => {
    expect(friendlyError(error)).toBe(sentence);
  });

  it('every code in the table points at a real sentence', () => {
    for (const [code, key] of Object.entries(CODE_TABLE)) expect(MESSAGES[key], code).toBeTruthy();
  });
});

describe('network, offline, timeout, permission and HTTP status', () => {
  it('a browser network failure', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toBe(MESSAGES.network);
    expect(friendlyError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(MESSAGES.network);
    expect(friendlyError(new TypeError('Load failed'))).toBe(MESSAGES.network);
  });
  it('offline wins over anything else', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(friendlyError({ code: '23505' })).toBe(MESSAGES.offline);
    expect(friendlyError(null)).toBe(MESSAGES.offline);
  });
  it('aborts and timeouts', () => {
    expect(friendlyError(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))).toBe(MESSAGES.timeout);
    expect(friendlyError({ name: 'TimeoutError', message: 'signal timed out' })).toBe(MESSAGES.timeout);
    expect(friendlyError(new Error('Request timed out after 30000ms'))).toBe(MESSAGES.timeout);
  });
  it.each([
    [401, MESSAGES.session], [403, MESSAGES.permission], [404, MESSAGES.notFound], [408, MESSAGES.timeout],
    [409, MESSAGES.conflict], [413, MESSAGES.tooLarge], [429, MESSAGES.rateLimit], [500, MESSAGES.server],
    [502, MESSAGES.server], [503, MESSAGES.server], [504, MESSAGES.timeout],
  ])('HTTP %i', (status, sentence) => {
    expect(friendlyError({ status, message: `HTTP ${status}: <html>internal detail</html>` })).toBe(sentence);
    expect(friendlyError({ statusCode: status })).toBe(sentence);
  });
  it('a code wins over a status', () => {
    expect(friendlyError({ code: '23505', status: 409 })).toBe(MESSAGES.duplicate);
  });
});

describe('unknown input gets the safe generic sentence', () => {
  it.each([
    [undefined], [null], [''], ['some raw server text'], [{}], [{ message: 'relation "public.x" does not exist' }],
    [new Error('column students.lrn does not exist')], [{ code: 'XX000', message: 'internal error' }], [42], [[1, 2]],
    [{ status: 200 }], [{ status: 'abc' }],
  ])('%o', (input) => {
    expect(friendlyError(input)).toBe(GENERIC);
  });
  it('the generic sentence is the agreed one', () => {
    expect(GENERIC).toBe('Something went wrong. Please try again.');
  });
});

describe('overrides and fallback are the caller\'s words', () => {
  it('an override by code replaces the default sentence', () => {
    expect(friendlyError({ code: '23505' }, { overrides: { 23505: 'This LRN is already used by another student.' } }))
      .toBe('This LRN is already used by another student.');
  });
  it('an override by sentence key, and a custom fallback', () => {
    expect(friendlyError(new TypeError('Failed to fetch'), { overrides: { network: 'The invite was not sent. Check your connection.' } }))
      .toBe('The invite was not sent. Check your connection.');
    expect(friendlyError({ message: 'weird' }, { fallback: 'The user could not be saved. Try again.' })).toBe('The user could not be saved. Try again.');
  });
});

describe('property: never returns raw text', () => {
  // A seeded generator: messages made of SQL, HTML, stack traces and random
  // characters, with random codes and statuses. Every answer must be one of
  // the app's own sentences, and must never contain the input message.
  const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const rand = seeded(20261116);
  const pick = list => list[Math.floor(rand() * list.length)];
  const PIECES = ['duplicate key value violates', 'relation "x" does not exist', '<b>500</b>', 'at Object.<anonymous> (file.js:1:2)',
    'SELECT * FROM profiles', 'token=abc.def.ghi', 'ñandú 😀', 'Error:', 'permission denied for table', 'null', '{"code":"P0001"}'];
  const CODES = [undefined, '23505', 'P0001', 'XX000', 'PGRST100', 'invalid_credentials', 'weird', 42501, '', null];
  const STATUSES = [undefined, 200, 302, 400, 401, 418, 500, 'x'];

  it('500 generated errors all map to known sentences', () => {
    for (let i = 0; i < 500; i += 1) {
      const message = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => pick(PIECES)).join(' ') + ` #${i}`;
      const shape = pick(['error', 'object', 'string']);
      const input = shape === 'string' ? message
        : shape === 'error' ? Object.assign(new Error(message), { code: pick(CODES) })
          : { message, code: pick(CODES), status: pick(STATUSES), details: message, hint: message };
      const out = friendlyError(input);
      expect(SENTENCES.has(out), `${JSON.stringify(input)} -> ${out}`).toBe(true);
      expect(out.includes(`#${i}`)).toBe(false);
    }
  });
});
