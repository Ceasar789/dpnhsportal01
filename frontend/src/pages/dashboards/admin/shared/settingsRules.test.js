import { describe, expect, it } from 'vitest';
import {
  buildSettingsUpdate,
  classifySettingsReadError,
  isActiveMainAdmin,
  isSupportedQuarter,
  isSupportedSessionTimeout,
  quarterFromNumber,
  quarterToNumber,
  validateAcademicYear,
  verifyUpdatedSettingsRows,
} from './settingsRules';

describe('Settings validation rules', () => {
  it.each(['2025-2026', '2026-2027', '9998-9999'])('accepts a contiguous full academic year: %s', (value) => {
    expect(validateAcademicYear(value)).toBe('');
  });

  it.each(['', ' ', '2026', '2026-26', '2026/2027', '2026 - 2027', '2026-2028', '2027-2026', 'abcd-efgh', '2026-2027extra'])(
    'rejects an invalid academic year: %s', (value) => {
      expect(validateAcademicYear(value)).not.toBe('');
    },
  );

  it('maps only the four supported quarter values', () => {
    expect(quarterFromNumber(1)).toBe('1st Quarter');
    expect(quarterFromNumber(4)).toBe('4th Quarter');
    expect(quarterFromNumber(0)).toBeNull();
    expect(quarterFromNumber(5)).toBeNull();
    expect(quarterToNumber('3rd Quarter')).toBe(3);
    expect(quarterToNumber('1st Semester')).toBeNull();
    expect(isSupportedQuarter('4th Quarter')).toBe(true);
  });

  it('accepts only the existing timeout choices', () => {
    for (const value of ['15 min', '30 min', '1 hour', '2 hours']) {
      expect(isSupportedSessionTimeout(value)).toBe(true);
    }
    expect(isSupportedSessionTimeout('30 minutes')).toBe(false);
    expect(isSupportedSessionTimeout('3 hours')).toBe(false);
  });
});

describe('Settings authorization and persistence boundary', () => {
  it('allows only an active raw main_admin profile', () => {
    expect(isActiveMainAdmin({ role: 'main_admin', status: 'active' })).toBe(true);
    expect(isActiveMainAdmin({ role: 'main_admin', status: 'suspended' })).toBe(false);
    expect(isActiveMainAdmin({ role: 'admin', status: 'active' })).toBe(false);
    expect(isActiveMainAdmin({ role: 'main_admin', status: 'active', profile: { role: 'admin', status: 'active' } })).toBe(false);
    expect(isActiveMainAdmin({ role: 'main_admin', status: 'active', profile: { role: 'main_admin', status: 'archived' } })).toBe(false);
    expect(isActiveMainAdmin({ role: 'teacher', status: 'active' })).toBe(false);
  });

  it('builds the minimal update payload', () => {
    const result = buildSettingsUpdate({
      academicYear: '2026-2027', quarter: '2nd Quarter', sessionTimeout: '30 min', updatedAt: '2026-10-10T00:00:00.000Z',
    });
    expect(result.errors).toEqual({ academicYear: '', quarter: '', sessionTimeout: '' });
    expect(result.payload).toEqual({
      school_year: '2026-2027', current_semester: 2, session_timeout: '30 min', updated_at: '2026-10-10T00:00:00.000Z',
    });
  });

  it('does not build a payload from any invalid persisted value', () => {
    expect(buildSettingsUpdate({ academicYear: '2026-2028', quarter: '2nd Quarter', sessionTimeout: '30 min' }).payload).toBeNull();
    expect(buildSettingsUpdate({ academicYear: '2026-2027', quarter: 'Semester 2', sessionTimeout: '30 min' }).payload).toBeNull();
    expect(buildSettingsUpdate({ academicYear: '2026-2027', quarter: '2nd Quarter', sessionTimeout: 'forever' }).payload).toBeNull();
  });

  it('requires exactly the matching singleton row to verify an update', () => {
    const expected = { school_year: '2026-2027', current_semester: 2, session_timeout: '30 min' };
    const row = { id: 1, ...expected };
    expect(verifyUpdatedSettingsRows([row], expected)).toEqual(row);
    expect(verifyUpdatedSettingsRows([], expected)).toBeNull();
    expect(verifyUpdatedSettingsRows([row, row], expected)).toBeNull();
    expect(verifyUpdatedSettingsRows([{ ...row, id: 2 }], expected)).toBeNull();
    expect(verifyUpdatedSettingsRows([{ ...row, school_year: '2025-2026' }], expected)).toBeNull();
    expect(verifyUpdatedSettingsRows(row, expected)).toBeNull();
  });
});

describe('Settings read error classification', () => {
  it.each([
    [{ status: 401 }, 'authentication'],
    [{ status: 403 }, 'authorization'],
    [{ status: 400, code: 'PGRST204' }, 'schema'],
    [{ code: '42703' }, 'schema'],
    [{ offline: true }, 'network'],
    [{ status: 503 }, 'server'],
    [{ status: 400, code: 'XX000' }, 'server'],
    [{ status: 400, code: 'OTHER' }, 'unknown'],
  ])('classifies %o as %s', (error, kind) => {
    expect(classifySettingsReadError(error)).toBe(kind);
  });
});
