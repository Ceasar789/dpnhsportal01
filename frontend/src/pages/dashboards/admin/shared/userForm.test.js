// U3: the admin user form rules and the server-error mapping (pure).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  INVITE_SERVER_MESSAGES, USER_FIELDS, USER_MESSAGES, resendInviteError, userSaveError,
  validateEmail, validateLrn, validateName, validateUserForm,
} from './userForm';
import { LRN_REQUIRED, LRN_TAKEN } from './lrn';
import { GENERIC, MESSAGES } from '../../../../lib/friendlyError';
import { lrnInput, passwordRules, unmetRules } from '../../../../lib/formRules';
import { validatePassword } from '../../../../lib/passwordPolicy';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../../..');
const onboarding = readFileSync(join(ROOT, 'backend/src/routes/onboarding.js'), 'utf8');

const form = (extra = {}) => ({ name: 'Ana Cruz', email: 'ana@school.edu.ph', role: 'student', lrn: '108123456789', editing: false, ...extra });
const ids = list => list.map(p => p.fieldId);

describe('validateUserForm', () => {
  it('a complete create form has no problems', () => {
    expect(validateUserForm(form())).toEqual([]);
  });

  it('create: name, email and (for a student) LRN are required, in field order', () => {
    expect(validateUserForm(form({ name: ' ', email: '', lrn: '' }))).toEqual([
      { fieldId: USER_FIELDS.name, message: 'Enter the full name.' },
      { fieldId: USER_FIELDS.email, message: 'Enter the email address.' },
      { fieldId: USER_FIELDS.lrn, message: "Enter the student's 12-digit LRN." },
    ]);
  });

  it('teacher and admin: no LRN is asked for, even if one was typed', () => {
    for (const role of ['teacher', 'main_admin']) {
      expect(validateUserForm(form({ role, lrn: '' }))).toEqual([]);
      expect(validateUserForm(form({ role, lrn: 'abc' }))).toEqual([]);
    }
  });

  it('edit: the email is not checked (it is locked); a blank LRN is allowed, a bad one is not', () => {
    expect(validateUserForm(form({ editing: true, email: '', lrn: '' }))).toEqual([]);
    expect(ids(validateUserForm(form({ editing: true, lrn: '1234' })))).toEqual([USER_FIELDS.lrn]);
  });
});

describe('field validators', () => {
  it('name', () => {
    expect(validateName('')).toBe('Enter the full name.');
    expect(validateName('  ')).toBe('Enter the full name.');
    expect(validateName('Ñora')).toBeNull();
  });

  it('email', () => {
    expect(validateEmail('')).toBe('Enter the email address.');
    for (const v of ['ana', 'ana@', 'ana@school', 'ana @school.edu']) expect(validateEmail(v), v).toBe('Enter an email address like name@school.edu.ph.');
    expect(validateEmail(' ana@school.edu.ph ')).toBeNull();
  });

  it.each([
    ['', "Enter the student's 12-digit LRN.", null],
    ['1234', "The LRN must be 12 digits. You've entered 4.", "The LRN must be 12 digits. You've entered 4."],
    ['10812345678', "The LRN must be 12 digits. You've entered 11.", "The LRN must be 12 digits. You've entered 11."],
    ['1081234567890', "The LRN must be 12 digits. You've entered 13.", "The LRN must be 12 digits. You've entered 13."],
    ['10812345678a', 'Digits only (0-9).', 'Digits only (0-9).'],
    ['１０８１２３４５６７８９', 'Digits only (0-9).', 'Digits only (0-9).'],
    [' 108123456789 ', null, null],
  ])('LRN %j: create %j, edit %j', (value, create, edit) => {
    expect(validateLrn(false)(value)).toBe(create);
    expect(validateLrn(true)(value)).toBe(edit);
  });

  it('a pasted LRN with dashes or spaces is cleaned to its 12 digits (no maxLength cut)', () => {
    expect(lrnInput('1081-2345-6789')).toMatchObject({ value: '108123456789', separators: true });
    expect(lrnInput('1081 2345 6789')).toMatchObject({ value: '108123456789', separators: true });
    expect(lrnInput('12ab34')).toMatchObject({ value: '1234', dropped: true, separators: false });
  });
});

describe('userSaveError (every server error, never raw text)', () => {
  const backend = (message, kind = 'response') => Object.assign(new Error(message), { name: 'BackendRequestError', kind });

  it.each([
    [backend(LRN_TAKEN), { fieldId: USER_FIELDS.lrn, message: LRN_TAKEN }],
    [new Error(LRN_TAKEN), { fieldId: USER_FIELDS.lrn, message: LRN_TAKEN }],
    [{ code: '23505', message: 'duplicate key value violates unique constraint "students_lrn_key"' }, { fieldId: USER_FIELDS.lrn, message: LRN_TAKEN }],
    [backend(LRN_REQUIRED), { fieldId: USER_FIELDS.lrn, message: "Enter the student's 12-digit LRN." }],
    [backend(INVITE_SERVER_MESSAGES.emailTaken), { fieldId: USER_FIELDS.email, message: 'An account with this email already exists.' }],
    [backend(INVITE_SERVER_MESSAGES.authEmailTaken), { fieldId: USER_FIELDS.email, message: 'An account with this email already exists.' }],
    [backend(INVITE_SERVER_MESSAGES.invalid), { message: 'Check the name, email and role, then try again.' }],
    [backend(INVITE_SERVER_MESSAGES.inviteFailed), { message: 'The invitation could not be completed. No account was added.' }],
    [backend(INVITE_SERVER_MESSAGES.rateLimited), { message: MESSAGES.rateLimit }],
    [backend('The server response could not be received.', 'transport'), { message: USER_MESSAGES.inviteUnconfirmed }],
    [backend('Your session is unavailable. Sign in again.', 'session'), { message: MESSAGES.session }],
    [{ code: '42501', message: 'new row violates row-level security policy for table "profiles"' }, { message: MESSAGES.permission }],
    [{ code: 'PGRST301', message: 'JWT expired' }, { message: MESSAGES.session }],
    [new TypeError('Failed to fetch'), { message: MESSAGES.network }],
    [backend('Unexpected internal: relation "profiles" does not exist'), { message: 'The user could not be saved. Please try again.' }],
    [new Error('column students.lrn does not exist'), { message: 'The user could not be saved. Please try again.' }],
    [null, { message: 'The user could not be saved. Please try again.' }],
  ])('%o', (error, expected) => {
    expect(userSaveError(error)).toEqual(expected);
  });

  it('300 generated raw errors always map to an app sentence and never echo their text', () => {
    const allowed = new Set([...Object.values(MESSAGES), GENERIC, ...Object.values(USER_MESSAGES),
      LRN_TAKEN, "Enter the student's 12-digit LRN.", 'An account with this email already exists.', INVITE_SERVER_MESSAGES.inviteFailed]);
    let seed = 7;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const pieces = ['SELECT * FROM profiles', '<html>502</html>', 'at handler (onboarding.js:9:1)', 'token=abc.def', 'ñ 😀', 'violates check constraint'];
    for (let i = 0; i < 300; i += 1) {
      const text = `${pieces[Math.floor(rand() * pieces.length)]} #${i}`;
      const out = userSaveError(rand() < 0.5 ? new Error(text) : { message: text, code: ['XX000', 'P0001', undefined][i % 3], name: 'BackendRequestError', kind: 'response' });
      expect(allowed.has(out.message), out.message).toBe(true);
      expect(out.message.includes(`#${i}`)).toBe(false);
    }
  });
});

describe('resendInviteError', () => {
  const backend = (message, kind = 'response') => Object.assign(new Error(message), { name: 'BackendRequestError', kind });
  it.each([
    [backend(INVITE_SERVER_MESSAGES.resendNotPending), INVITE_SERVER_MESSAGES.resendNotPending],
    [backend(INVITE_SERVER_MESSAGES.resendArchived), INVITE_SERVER_MESSAGES.resendArchived],
    [backend(INVITE_SERVER_MESSAGES.notFound), USER_MESSAGES.userGone],
    [backend(INVITE_SERVER_MESSAGES.resendFailed), USER_MESSAGES.resendFailed],
    [backend('x', 'session'), MESSAGES.session],
    [backend('raw server detail: stack trace'), USER_MESSAGES.resendFailed],
    [new TypeError('Failed to fetch'), MESSAGES.network],
  ])('%o', (error, expected) => {
    expect(resendInviteError(error)).toBe(expected);
  });
});

describe('the allow-listed backend sentences are pinned to the route file', () => {
  it.each(Object.entries(INVITE_SERVER_MESSAGES))('%s is word for word in backend/src/routes/onboarding.js', (_, sentence) => {
    expect(onboarding).toContain(`'${sentence}'`);
  });

  it('the LRN sentences are shared word for word with the route', () => {
    expect(onboarding).toContain(`'${LRN_REQUIRED}'`);
    expect(onboarding).toContain(`'${LRN_TAKEN}'`);
  });
});

describe('the real password rules (for U6; no password field in the user dialog)', () => {
  const rules = passwordRules({ minLength: 12, uppercase: true, number: true, special: true });
  it.each(['', 'short', 'abcdefghijkl', 'Abcdefghijkl', 'Abcdefghijk1', 'Abcdefghij1!', 'ABCDEFGHIJ1!', 'Ñandú2026!!x', '😀Abcdefghi1!'])(
    '%j: the checklist agrees with shared/passwordPolicy.validatePassword', (value) => {
      expect(unmetRules(rules, value).length === 0).toBe(validatePassword(value) === null);
    },
  );
});
