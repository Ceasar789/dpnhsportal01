// @vitest-environment jsdom
// X2: the school offers Grades 7-10 only. The grade list, the retired-grade
// rule and the frontend save rules that read it.
import { describe, expect, it } from 'vitest';
import { GRADE_LEVELS, NO_TEACHING_LOAD_MESSAGE, canTeachSection, isRetiredGradeLevel, normalizeGradeLevel } from './academicRules';
import { buildManualTaskRow } from '../pages/dashboards/teacher/worksheets/manualTaskSave';
import { draftProblem, subjectOptions } from '../components/clarity/teacher/materials/materialRules';
import { eligibleQuickCreateSubjects, validateQuickCreateDraft } from '../pages/dashboards/teacher/lessonPlans/quickCreateModel';

const row = (grade) => ({ subject_id: 'eng', grade_level: grade, subjects: { id: 'eng', name: 'English' } });

describe('the grade list', () => {
  it('is exactly Grade 7 to Grade 10, in order', () => {
    expect(GRADE_LEVELS).toEqual(['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']);
  });

  it('Grade 11 and 12, in any spelling, are not a known grade and count as retired', () => {
    for (const value of ['Grade 11', 'Grade 12', 'grade 11', '12', 'G11', 'Grade 12 - STEM']) {
      expect(normalizeGradeLevel(value)).toBeNull();
      expect(isRetiredGradeLevel(value)).toBe(true);
    }
  });

  it('Grade 7-10 behave exactly as before', () => {
    expect(['Grade 7', 'grade 8', '9', 'G10', 'Grade 10 - Rizal'].map(normalizeGradeLevel))
      .toEqual(['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 10']);
    for (const value of ['Grade 7', '8', 'Grade 10', '', null, undefined, 'No grade']) expect(isRetiredGradeLevel(value)).toBe(false);
  });

  it('a teacher can never be scheduled into a Grade 11 section, even with an old Grade 11 load row', () => {
    const load = [{ subject_id: 'eng', grade_level: 'Grade 11', school_year: '2026-2027' }];
    expect(canTeachSection(load, 'eng', { grade_level: 'Grade 11', school_year: '2026-2027' }).ok).toBe(false);
  });

  it('the no-load sentence is plain and friendly', () => {
    expect(NO_TEACHING_LOAD_MESSAGE).toBe('You have no classes assigned yet. Ask your admin to assign your subjects and sections.');
  });
});

describe('frontend save rules refuse Grade 11/12', () => {
  const task = gradeLevel => buildManualTaskRow({ teacherId: 't', title: 'Read', taskType: 'quiz', directions: '',
    checkingMode: 'manual', subject: { id: 'eng', name: 'English' }, gradeLevel });

  it('a hand-made task (worksheets row)', () => {
    expect(task('Grade 11')).toBeNull();
    expect(task('Grade 12')).toBeNull();
    expect(task('Grade 10')?.grade_level).toBe('Grade 10');
  });

  it('a learning material with a subject', () => {
    const draft = { kind: 'link', title: 'Notes', description: '', subjectId: 'eng', url: 'https://example.com/notes' };
    expect(draftProblem({ ...draft, gradeLevel: 'Grade 12' })).toBe('Choose a grade level from Grade 7 to Grade 10.');
    expect(draftProblem({ ...draft, gradeLevel: 'Grade 9' })).toBeNull();
  });

  it('a quick-create lesson plan only offers Grade 7-10 from the load', () => {
    const subjects = eligibleQuickCreateSubjects([row('Grade 7'), row('Grade 11')]);
    expect(subjects).toEqual([{ id: 'eng', name: 'English', grades: ['Grade 7'] }]);
    const errors = validateQuickCreateDraft({ title: 'A', subjectId: 'eng', gradeLevel: 'Grade 11' },
      { subjects, teacherId: 't', sourceTeacherId: 't', schoolYear: 'y', sourceSchoolYear: 'y' });
    expect(errors.gradeLevel).toBeTruthy();
  });
});

describe('an old Grade 11/12 row in a read is ignored without a crash', () => {
  it('materials subject choices', () => {
    expect(subjectOptions([row('Grade 12'), row('Grade 8')])).toEqual([{ id: 'eng', name: 'English', grades: ['Grade 8'] }]);
    expect(subjectOptions([row('Grade 11')])).toEqual([]);
  });

  it('quick-create subjects, when every row is Grade 11/12', () => {
    expect(eligibleQuickCreateSubjects([row('Grade 11'), row('Grade 12')])).toEqual([]);
  });
});
