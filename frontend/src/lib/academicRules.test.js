import { describe, it, expect } from 'vitest';
import {
  GRADE_LEVELS,
  currentSchoolYear,
  normalizeGradeLevel,
  teacherLoadFor,
  subjectsTeacherHolds,
  canTeachSection,
} from './academicRules';

const MATH = 'subject-math';
const ENGLISH = 'subject-english';

const load = [
  { subject_id: MATH,    grade_level: 'Grade 7', school_year: '2025-2026' },
  { subject_id: ENGLISH, grade_level: 'Grade 7', school_year: '2025-2026' },
  { subject_id: ENGLISH, grade_level: 'Grade 8', school_year: '2025-2026' },
  { subject_id: MATH,    grade_level: 'Grade 9', school_year: '2024-2025' },
];

describe('GRADE_LEVELS', () => {
  it('lists the six canonical levels in order', () => {
    expect(GRADE_LEVELS).toEqual([
      'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
    ]);
  });
});

describe('normalizeGradeLevel', () => {
  it('accepts a canonical value unchanged', () => {
    expect(normalizeGradeLevel('Grade 7')).toBe('Grade 7');
  });

  it('accepts a bare number', () => {
    expect(normalizeGradeLevel('7')).toBe('Grade 7');
  });

  it('is case and whitespace insensitive', () => {
    expect(normalizeGradeLevel('  grade 10 ')).toBe('Grade 10');
  });

  it('returns null for a level outside the canonical set', () => {
    expect(normalizeGradeLevel('Grade 13')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(normalizeGradeLevel('')).toBeNull();
    expect(normalizeGradeLevel(null)).toBeNull();
  });
});

describe('teacherLoadFor', () => {
  it('keeps only rows for the requested school year', () => {
    const rows = teacherLoadFor(load, '2025-2026');
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.school_year === '2025-2026')).toBe(true);
  });

  it('returns an empty array when the year has no rows', () => {
    expect(teacherLoadFor(load, '2030-2031')).toEqual([]);
  });

  it('tolerates a missing load', () => {
    expect(teacherLoadFor(null, '2025-2026')).toEqual([]);
  });
});

describe('subjectsTeacherHolds', () => {
  it('returns each subject once even when held at several grade levels', () => {
    const ids = subjectsTeacherHolds(load, '2025-2026');
    expect(ids).toHaveLength(2);
    expect(ids).toContain(MATH);
    expect(ids).toContain(ENGLISH);
  });

  it('excludes subjects held only in another school year', () => {
    expect(subjectsTeacherHolds(load, '2026-2027')).toEqual([]);
  });
});

describe('canTeachSection', () => {
  const g7 = { grade_level: 'Grade 7', school_year: '2025-2026' };
  const g8 = { grade_level: 'Grade 8', school_year: '2025-2026' };

  it('allows a subject and grade level the teacher holds', () => {
    expect(canTeachSection(load, MATH, g7)).toEqual({ ok: true, reason: null });
  });

  it('rejects the right subject at the wrong grade level', () => {
    const result = canTeachSection(load, MATH, g8);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Grade 8/);
  });

  it('rejects a subject the teacher does not hold at all', () => {
    const result = canTeachSection(load, 'subject-science', g7);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not assigned/i);
  });

  it('rejects when the load belongs to a different school year', () => {
    const result = canTeachSection(load, MATH, { grade_level: 'Grade 9', school_year: '2025-2026' });
    expect(result.ok).toBe(false);
  });

  it('rejects when the teacher has no load at all', () => {
    const result = canTeachSection([], MATH, g7);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no teaching load/i);
  });

  it('matches grade levels that differ only in formatting', () => {
    const result = canTeachSection(load, MATH, { grade_level: '7', school_year: '2025-2026' });
    expect(result.ok).toBe(true);
  });
});

describe('currentSchoolYear', () => {
  // June opens the school year, so the month boundary is the whole rule.
  it('uses the calendar year it started in, from June onward', () => {
    expect(currentSchoolYear(new Date(2026, 5, 1))).toBe('2026-2027');   // June
    expect(currentSchoolYear(new Date(2026, 11, 31))).toBe('2026-2027'); // December
  });

  it('is still the previous year before June', () => {
    expect(currentSchoolYear(new Date(2026, 0, 1))).toBe('2025-2026');  // January
    expect(currentSchoolYear(new Date(2026, 4, 31))).toBe('2025-2026'); // May
  });
});
