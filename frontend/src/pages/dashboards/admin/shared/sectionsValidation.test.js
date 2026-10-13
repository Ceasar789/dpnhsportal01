import { describe, expect, it } from 'vitest';
import {
  isActiveSectionAdviser,
  validateCapacityAgainstEnrollment,
  validateSectionAdviser,
  validateSectionCapacity,
} from './sectionsValidation';

describe('validateSectionCapacity', () => {
  it.each([
    ['', 'required'],
    [' ', 'required'],
    ['0', 'whole number'],
    ['-1', 'whole number'],
    ['61', 'whole number'],
    ['1.5', 'whole number'],
    ['abc', 'whole number'],
    ['12abc', 'whole number'],
    ['Infinity', 'whole number'],
    ['NaN', 'whole number'],
  ])('rejects %j without coercion', (input, message) => {
    expect(validateSectionCapacity(input)).toMatchObject({ valid: false, value: null });
    expect(validateSectionCapacity(input).message).toMatch(new RegExp(message, 'i'));
  });

  it.each([['1', 1], ['40', 40], ['60', 60], [' 25 ', 25]])('accepts %j as the exact integer %i', (input, value) => {
    expect(validateSectionCapacity(input)).toEqual({ valid: true, value, message: '' });
  });

  it('does not round, clamp, or fall back to 40', () => {
    expect(validateSectionCapacity('1.9').value).toBeNull();
    expect(validateSectionCapacity('999').value).toBeNull();
    expect(validateSectionCapacity('').value).toBeNull();
  });
});

describe('section adviser eligibility', () => {
  const teachers = [
    { id: 'active', role: 'teacher', status: 'active' },
    { id: 'inactive', role: 'teacher', status: 'inactive' },
    { id: 'suspended', role: 'teacher', status: 'suspended' },
    { id: 'archived', role: 'teacher', status: 'archived' },
    { id: 'student', role: 'student', status: 'active' },
  ];

  it('recognizes only active teachers as newly eligible', () => {
    expect(teachers.map(isActiveSectionAdviser)).toEqual([true, false, false, false, false]);
  });

  it('allows no adviser and an unchanged legacy adviser', () => {
    expect(validateSectionAdviser({ adviserId: '', teachers, existingAdviserId: null }).valid).toBe(true);
    expect(validateSectionAdviser({ adviserId: 'inactive', teachers, existingAdviserId: 'inactive' }).valid).toBe(true);
  });

  it('rejects a newly selected ineligible or unknown adviser', () => {
    for (const adviserId of ['inactive', 'suspended', 'archived', 'student', 'missing']) {
      expect(validateSectionAdviser({ adviserId, teachers, existingAdviserId: null }).valid).toBe(false);
    }
  });

  it('allows a newly selected active teacher', () => {
    expect(validateSectionAdviser({ adviserId: 'active', teachers, existingAdviserId: null }).valid).toBe(true);
  });
});

describe('capacity against enrollment', () => {
  it.each([[1, 0], [1, 1], [35, 35], [40, 35], [60, 60]])('allows capacity %i with enrollment %i', (capacity, count) => {
    expect(validateCapacityAgainstEnrollment(capacity, count).valid).toBe(true);
  });

  it.each([[1, 2], [30, 35], [59, 60]])('rejects capacity %i below enrollment %i', (capacity, count) => {
    const result = validateCapacityAgainstEnrollment(capacity, count);
    expect(result.valid).toBe(false);
    expect(result.message).toContain(String(count));
  });
});
