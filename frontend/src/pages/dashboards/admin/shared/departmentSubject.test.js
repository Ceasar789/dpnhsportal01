import { describe, expect, it } from 'vitest';
import { departmentSubject, isLockedLoadRow, lockedSubjectId } from './departmentSubject';

const ENG = { id: 'eng', name: 'English', code: 'ENG' };
const MATH = { id: 'math', name: 'Mathematics', code: 'MATH' };
const SCI = { id: 'sci', name: 'Science', code: 'SCI', is_active: false };
const SUBJECTS = [ENG, MATH, SCI];

describe('department subject match', () => {
  it('matches the name, ignoring case and surrounding spaces', () => {
    expect(departmentSubject('  english ', SUBJECTS)).toEqual({ subject: ENG, note: null });
  });

  it('matches the code', () => {
    expect(departmentSubject('math', SUBJECTS).subject).toBe(MATH);
  });

  it('a partial match is not a match, and says so', () => {
    expect(departmentSubject(' English Department ', SUBJECTS)).toEqual({
      subject: null,
      note: "Department 'English Department' does not match a subject, so no subject is locked.",
    });
  });

  it('more than one matching subject means no lock', () => {
    const clash = [ENG, { id: 'eng2', name: 'Filipino', code: 'english' }];
    expect(departmentSubject('English', clash)).toEqual({
      subject: null,
      note: "Department 'English' does not match a subject, so no subject is locked.",
    });
  });

  it('an empty department locks nothing and has no note', () => {
    expect(departmentSubject('', SUBJECTS)).toEqual({ subject: null, note: null });
    expect(departmentSubject('   ', SUBJECTS)).toEqual({ subject: null, note: null });
    expect(departmentSubject(null, SUBJECTS)).toEqual({ subject: null, note: null });
  });

  it('an inactive subject is never locked', () => {
    expect(departmentSubject('Science', SUBJECTS).subject).toBeNull();
    expect(departmentSubject('Science', SUBJECTS).note).toMatch(/does not match a subject/);
  });

  it('lockedSubjectId and isLockedLoadRow use the same rule', () => {
    const teachers = [{ id: 'ana', department: 'ENG' }, { id: 'ben', department: '' }];
    expect(lockedSubjectId(teachers[0], SUBJECTS)).toBe('eng');
    expect(lockedSubjectId(teachers[1], SUBJECTS)).toBeNull();
    expect(isLockedLoadRow({ teacher_id: 'ana', subject_id: 'eng' }, teachers, SUBJECTS)).toBe(true);
    expect(isLockedLoadRow({ teacher_id: 'ana', subject_id: 'math' }, teachers, SUBJECTS)).toBe(false);
    expect(isLockedLoadRow({ teacher_id: 'ben', subject_id: 'eng' }, teachers, SUBJECTS)).toBe(false);
    expect(isLockedLoadRow({ teacher_id: 'zed', subject_id: 'eng' }, teachers, SUBJECTS)).toBe(false);
  });
});
