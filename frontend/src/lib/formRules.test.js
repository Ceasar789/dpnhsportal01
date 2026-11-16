// U2 form kit: lib/formRules.js validators and the LRN input helper.
import { describe, expect, it } from 'vitest';
import {
  compose, email, EMAIL_MESSAGE, LRN_MESSAGES, lrn, lrnInput, maxLength, minLength,
  passwordMeets, passwordRules, phone, PHONE_MESSAGE, required, unmetRules,
} from './formRules';

describe('required', () => {
  const check = required();
  it('refuses empty, null, undefined and spaces only (including a non-breaking space)', () => {
    for (const v of ['', '   ', '\t\n', ' ', null, undefined, []]) expect(check(v), JSON.stringify(v)).toBe('This field is required.');
  });
  it('accepts any real value, and takes a custom message', () => {
    expect(check('a')).toBeNull();
    expect(check(0)).toBeNull();
    expect(check(['x'])).toBeNull();
    expect(required('Enter a name.')('')).toBe('Enter a name.');
  });
});

describe('email', () => {
  const check = email();
  it('accepts normal school addresses, with spaces around them', () => {
    for (const v of ['ana@dpnhs.edu.ph', ' ana.cruz+1@school.edu ', 'a@b.co']) expect(check(v), v).toBeNull();
  });
  it('refuses clearly wrong ones with one friendly message', () => {
    for (const v of ['ana', 'ana@', '@school.edu', 'ana@school', 'ana @school.edu', 'ana@@school.edu', 'ana@school.', 'ana@.edu']) {
      expect(check(v), v).toBe(EMAIL_MESSAGE);
    }
  });
  it('leaves an empty optional field alone', () => {
    expect(check('')).toBeNull();
    expect(compose(required(), email())('')).toBe('This field is required.');
  });
});

describe('min and max length', () => {
  it('count characters, not UTF-16 units, and trim for the minimum', () => {
    expect(minLength(3)('  ab  ')).toBe('Use at least 3 characters.');
    expect(minLength(2)('ñé')).toBeNull();
    expect(maxLength(2)('😀😀')).toBeNull();
    expect(maxLength(2)('abc')).toBe('Use 2 characters or fewer.');
    expect(minLength(3)('')).toBeNull();
  });
});

describe('lrnInput (what the LRN box keeps, and what it tells the person)', () => {
  it('keeps 12 plain digits untouched', () => {
    expect(lrnInput('108123456789')).toEqual({ value: '108123456789', dropped: false, separators: false, truncated: false });
  });
  it('reports dropped letters instead of hiding them', () => {
    expect(lrnInput('12ab34')).toEqual({ value: '1234', dropped: true, separators: false, truncated: false });
  });
  it('a pasted number with spaces or dashes is cleaned and flagged as separators only', () => {
    expect(lrnInput('1081-2345-6789')).toEqual({ value: '108123456789', dropped: true, separators: true, truncated: false });
    expect(lrnInput(' 1081 2345 6789 ')).toMatchObject({ value: '108123456789', separators: true });
  });
  it('13 digits are cut to 12 and flagged', () => {
    expect(lrnInput('1081234567890')).toEqual({ value: '108123456789', dropped: false, separators: false, truncated: true });
  });
  it('non-ASCII digits (fullwidth, Arabic-Indic) are not LRN digits: dropped and flagged', () => {
    expect(lrnInput('１２３')).toMatchObject({ value: '', dropped: true, separators: false });
    expect(lrnInput('١٢3')).toMatchObject({ value: '3', dropped: true });
  });
  it('empty and nullish input', () => {
    expect(lrnInput('')).toEqual({ value: '', dropped: false, separators: false, truncated: false });
    expect(lrnInput(null).value).toBe('');
  });
});

describe('lrn validator', () => {
  const check = lrn();
  it('12 digits pass; spaces around are ignored', () => {
    expect(check('108123456789')).toBeNull();
    expect(check(' 108123456789 ')).toBeNull();
  });
  it('11 and 13 digits say how many were entered', () => {
    expect(check('10812345678')).toBe("The LRN must be 12 digits. You've entered 11.");
    expect(check('1081234567890')).toBe(LRN_MESSAGES.length(13));
  });
  it('letters, inner spaces or unicode digits: digits only', () => {
    for (const v of ['10812345678a', '1081 2345 6789', '１０８１２３４５６７８９']) expect(check(v), v).toBe('Digits only (0-9).');
  });
  it('empty is left to required()', () => {
    expect(check('')).toBeNull();
    expect(compose(required(LRN_MESSAGES.empty), lrn())('')).toBe("Enter the student's 12-digit LRN.");
  });
});

describe('phone (Philippine mobile)', () => {
  const check = phone();
  it('accepts 09 and +639 forms, with spaces, dashes or brackets', () => {
    for (const v of ['09171234567', '0917 123 4567', '0917-123-4567', '+63 917 123 4567', '(0917) 123 4567']) expect(check(v), v).toBeNull();
  });
  it('refuses short, long, landline-looking and lettered numbers', () => {
    for (const v of ['0917123456', '091712345678', '0281234567', '0917abc4567', '639171234567']) expect(check(v), v).toBe(PHONE_MESSAGE);
  });
  it('empty is fine (optional)', () => expect(check('')).toBeNull());
});

describe('password rules builder', () => {
  const rules = passwordRules({ minLength: 12, uppercase: true, number: true, special: true });
  it('builds only the rules asked for, with plain labels', () => {
    expect(rules.map(r => r.id)).toEqual(['length', 'uppercase', 'number', 'special']);
    expect(rules.map(r => r.label)).toEqual(['At least 12 characters', 'One uppercase letter (A-Z)', 'One number (0-9)', 'One special character (like ! or #)']);
    expect(passwordRules()).toEqual([]);
    expect(passwordRules({ lowercase: true }).map(r => r.id)).toEqual(['lowercase']);
  });
  it('reports which rules are still unmet', () => {
    expect(unmetRules(rules, '').map(r => r.id)).toEqual(['length', 'uppercase', 'number', 'special']);
    expect(unmetRules(rules, 'abcdefghijkl').map(r => r.id)).toEqual(['uppercase', 'number', 'special']);
    expect(unmetRules(rules, 'Abcdefghij1!')).toEqual([]);
  });
  it('the length rule counts characters (an emoji is one)', () => {
    expect(passwordRules({ minLength: 2 })[0].test('😀😀')).toBe(true);
  });
  it('passwordMeets turns the checklist into one friendly message', () => {
    const check = passwordMeets(rules);
    expect(check('short')).toBe('Your password does not meet all the rules yet.');
    expect(check('Abcdefghij1!')).toBeNull();
  });
});
