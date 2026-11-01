import { describe, expect, it } from 'vitest';
import { buildQuickCreatePayload, eligibleQuickCreateSubjects, validateQuickCreateDraft } from './quickCreateModel';

const rows = [
  { subject_id: 'math', grade_level: 'Grade 7', subjects: { id: 'math', name: 'Mathematics' } },
  { subject_id: 'math', grade_level: 'Grade 8', subjects: { id: 'math', name: 'Mathematics' } },
  { subject_id: 'english', grade_level: 'Grade 7', subjects: { id: 'english', name: 'English' } },
];
const subjects = eligibleQuickCreateSubjects(rows);
const context = { subjects, teacherId: 'synthetic-teacher', sourceTeacherId: 'synthetic-teacher', schoolYear: '2026-2027', sourceSchoolYear: '2026-2027' };
const draft = { title: '  Fractions  ', subjectId: 'math', gradeLevel: 'Grade 8', durationMinutes: '60', strategy: 'Pairs', objectives: 'Compare halves\nExplain quarters' };

describe('proposed Quick Create contract', () => {
  it('QC-01 QC-02 groups official-shaped subject rows without losing grade pairs', () => {
    expect(subjects).toEqual([
      { id: 'english', name: 'English', grades: ['Grade 7'] },
      { id: 'math', name: 'Mathematics', grades: ['Grade 7', 'Grade 8'] },
    ]);
    expect(eligibleQuickCreateSubjects([rows[0]])).toHaveLength(1);
  });

  it('QC-07 QC-08 ignores adviser-only and malformed rows instead of inventing subjects', () => {
    expect(eligibleQuickCreateSubjects([])).toEqual([]);
    expect(eligibleQuickCreateSubjects([{ adviser_id: 'synthetic-teacher', grade_level: 'Grade 7' }])).toEqual([]);
    expect(eligibleQuickCreateSubjects([{ subject_id: 'wrong', grade_level: 'Grade 7', subjects: { id: 'math', name: 'Mathematics' } }])).toEqual([]);
  });

  it('QC-10 QC-11 rejects missing title and invalid minute values', () => {
    expect(validateQuickCreateDraft({ ...draft, title: '' }, context).title).toMatch(/title/);
    for (const invalid of ['0', '-1', '1.5', '60 minutes', '9007199254740992']) {
      expect(validateQuickCreateDraft({ ...draft, durationMinutes: invalid }, context).durationMinutes).toMatch(/whole number/);
    }
    expect(validateQuickCreateDraft({ ...draft, durationMinutes: '' }, context)).toEqual({});
  });

  it('QC-12 QC-13 QC-14 preserves objective lines and produces only proposed fields', () => {
    const payload = buildQuickCreatePayload(draft, context);
    expect(payload).toEqual({
      title: 'Fractions', subject: 'Mathematics', subject_id: 'math', grade_level: 'Grade 8',
      duration: '60 minutes', strategy: 'Pairs', objectives: 'Compare halves\nExplain quarters',
      teacher_id: 'synthetic-teacher', ai_generated: false,
    });
    expect(payload).not.toHaveProperty('section_id');
    expect(payload).not.toHaveProperty('duration_minutes');
  });

  it('QC-03 QC-09 rejects stale subject-grade, Teacher, and school-year context', () => {
    expect(validateQuickCreateDraft({ ...draft, subjectId: 'english', gradeLevel: 'Grade 8' }, context).gradeLevel).toMatch(/grade/);
    expect(validateQuickCreateDraft(draft, { ...context, sourceTeacherId: 'other' }).assignment).toMatch(/Teacher/);
    expect(validateQuickCreateDraft(draft, { ...context, sourceSchoolYear: '2025-2026' }).assignment).toMatch(/year/);
    expect(() => buildQuickCreatePayload(draft, { ...context, sourceTeacherId: 'other' })).toThrow();
  });
});
