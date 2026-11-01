import { describe, expect, it } from 'vitest';
import { currentSchoolYear } from '../../../../lib/academicRules';
import { createGeneratedDraft, saveGeneratedWorksheetLocally } from './generatedDraftModel';
import { localDistributionOptions, simulateLocalDistribution } from './localDistributionModel';

const year = currentSchoolYear();
const teacherId = 'synthetic-teacher';
const base = () => createGeneratedDraft({
  status: 'generated-draft', saved: false, title: 'Synthetic science worksheet',
  subjectId: 'science', subjectName: 'Science', gradeLevel: 'Grade 7',
  sourceLessonPlan: { id: 'synthetic-plan', title: 'Science plan' },
  questions: [{ localId: 'q1', question: 'What is a cell?', item_type: 'multiple_choice',
    options: ['Unit of life', 'Rock'], points: 2 }],
  answerKey: [{ localId: 'q1', correct_answer: 'Unit of life' }],
}, 'ai');
const fixture = () => ({
  synthetic: true, teacherId, schoolYear: year,
  teachingLoads: [{ id: 'load-1', teacher_id: teacherId, subject_id: 'science',
    grade_level: 'Grade 7', school_year: year, subjects: { name: 'Science' } }],
  schedules: [
    { id: 'schedule-1', teacher_id: teacherId, subject_id: 'science', section_id: 'section-1', school_year: year },
    { id: 'schedule-2', teacher_id: teacherId, subject_id: 'science', section_id: 'section-2', school_year: year },
  ],
  sections: [
    { id: 'section-1', name: 'Orchid', grade_level: 'Grade 7', school_year: year },
    { id: 'section-2', name: 'Jasmine', grade_level: 'Grade 7', school_year: year },
  ],
  enrollments: [
    { section_id: 'section-1', student_id: 'synthetic-a', status: 'active' },
    { section_id: 'section-1', student_id: 'synthetic-a', status: 'active' },
    { section_id: 'section-1', student_id: 'synthetic-b', status: 'dropped' },
    { section_id: 'section-1', student_id: '', status: 'active' },
    { section_id: 'section-2', student_id: 'synthetic-c', status: 'active' },
  ],
});

describe('development-only distribution contract', () => {
  it('requires an explicitly saved valid local worksheet with source and subject identity', () => {
    const draft = base();
    expect(localDistributionOptions(draft, fixture(), teacherId, year)).toEqual([]);
    const saved = saveGeneratedWorksheetLocally(draft);
    expect(localDistributionOptions(saved, fixture(), teacherId, year)).toHaveLength(2);
    for (const changed of [
      { ...saved, id: 'production-row' }, { ...saved, sourceLessonPlan: {} },
      { ...saved, subjectId: '' }, { ...saved, questions: [] },
    ]) expect(localDistributionOptions(changed, fixture(), teacherId, year)).toEqual([]);
  });

  it('fails closed for adviser-only, wrong teacher, subject, grade, year, section and inactive assignments', () => {
    const saved = saveGeneratedWorksheetLocally(base());
    const cases = [
      data => { data.teachingLoads = []; data.sections[0].adviser_id = teacherId; },
      data => { data.teachingLoads[0].teacher_id = 'other'; },
      data => { data.teachingLoads[0].subject_id = 'filipino'; },
      data => { data.teachingLoads[0].grade_level = 'Grade 8'; },
      data => { data.teachingLoads[0].school_year = '2020-2021'; },
      data => { data.teachingLoads[0].active = false; },
      data => { data.schedules = []; data.sections[0].adviser_id = teacherId; },
      data => { data.schedules.forEach(row => { row.subject_id = 'filipino'; }); },
      data => { data.schedules.forEach(row => { row.school_year = '2020-2021'; }); },
      data => { data.sections.forEach(row => { row.grade_level = 'Grade 8'; }); },
      data => { data.sections.forEach(row => { row.school_year = '2020-2021'; }); },
    ];
    for (const change of cases) {
      const data = fixture(); change(data);
      expect(localDistributionOptions(saved, data, teacherId, year)).toEqual([]);
    }
    expect(localDistributionOptions(saved, { ...fixture(), synthetic: false }, teacherId, year)).toEqual([]);
    expect(localDistributionOptions(saved, fixture(), 'other', year)).toEqual([]);
  });

  it('filters invalid enrollment, prevents duplicates and keeps separate sections under one worksheet identity', () => {
    const saved = saveGeneratedWorksheetLocally(base());
    const options = localDistributionOptions(saved, fixture(), teacherId, year);
    expect(options.map(option => option.sectionName)).toEqual(['Jasmine', 'Orchid']);
    const orchid = options.find(option => option.sectionId === 'section-1');
    expect(orchid.recipientIds).toEqual(['synthetic-a']);
    expect(orchid.excludedCount).toBe(3);
    const first = simulateLocalDistribution(saved, orchid, '', []);
    expect(first).toMatchObject({ worksheetId: saved.draftId, sourceLessonPlanId: 'synthetic-plan',
      sectionId: 'section-1', recipientCount: 1, status: 'simulated-locally' });
    expect(JSON.stringify(first)).not.toContain('answerKey');
    expect(JSON.stringify(first)).not.toContain('correct_answer');
    expect(() => simulateLocalDistribution(saved, orchid, '', [first])).toThrow('already simulated');
    const second = simulateLocalDistribution(saved, options.find(option => option.sectionId === 'section-2'), '', [first]);
    expect(second.worksheetId).toBe(first.worksheetId);
    expect(second.sectionId).toBe('section-2');
    expect(saved.answerKey).toEqual([{ localId: 'q1', correct_answer: 'Unit of life' }]);
  });

  it('rejects zero recipients and invalid dates without changing worksheet content', () => {
    const saved = saveGeneratedWorksheetLocally(base());
    const data = fixture(); data.enrollments = [];
    const [option] = localDistributionOptions(saved, data, teacherId, year);
    expect(() => simulateLocalDistribution(saved, option, '', [])).toThrow('not eligible');
    const valid = localDistributionOptions(saved, fixture(), teacherId, year)[0];
    expect(() => simulateLocalDistribution(saved, valid, 'yesterday', [])).toThrow('valid future');
    expect(() => simulateLocalDistribution(saved, valid, '2026-02-31', [])).toThrow('valid future');
    expect(() => simulateLocalDistribution(saved, valid, '2000-01-01', [])).toThrow('valid future');
    expect(saved.status).toBe('local-saved');
  });
});
