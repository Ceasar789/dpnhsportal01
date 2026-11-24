// 4c: a saved plan never reads "Draft" (R37), whatever the storage column says.
import { describe, expect, it } from 'vitest';
import { planState, planStateLabel } from './savedPlanType';

const T = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', P = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const week = () => Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => [d, '']));
const manual = workflowState => ({
  id: P, teacher_id: T, ai_generated: false, status: 'draft',
  objectives: JSON.stringify({
    kind: 'eduscribe.manual-ilaw', version: 2, teacherId: T, planId: P, title: 'Matter', workflowState,
    assignment: { subjectId: '11111111-1111-4111-8111-111111111111', subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear: '2026-2027' },
    document: { info: { nameOfLesson: 'Matter', teachingDate: '', learningArea: 'Science', termWeek: '', designedBy: '', gradeSection: 'Grade 7',
      sessions: '', references: '', aiUseDeclaration: '' }, learningCompetency: '',
    weekly: Object.fromEntries(['learningObjectives', 'learnerContext', 'preLesson', 'flow', 'learningResources', 'integration',
      'formativeAssessment', 'extendedLearning', 'reflections'].map(k => [k, week()])),
    signatures: { preparedBy: { name: '', role: '' }, checkedBy: { name: '', role: '' }, notedBy: { name: '', role: '' } } },
    sourceDetails: { classDuration: '', teachingStrategy: '', learningObjectives: '' },
  }),
});

describe('planState', () => {
  it('a saved Manual ILAW plan reads Saved although status is draft', () => {
    expect(planState(manual('saved'))).toBe('saved');
    expect(planStateLabel(manual('saved'))).toBe('Saved');
  });
  it('a Manual draft reads Draft', () => {
    expect(planStateLabel(manual('draft'))).toBe('Draft');
  });
  it('a stored AI plan reads Saved; published and archived keep their names', () => {
    expect(planStateLabel({ ai_generated: true, status: 'draft' })).toBe('Saved');
    expect(planStateLabel({ ai_generated: true, status: 'published' })).toBe('Published');
    expect(planStateLabel({ ai_generated: false, status: 'archived', objectives: '<p>x</p>' })).toBe('Archived');
  });
  it('an unreadable or legacy plan with status draft reads Draft', () => {
    expect(planStateLabel({ ai_generated: false, status: 'draft', objectives: '<p>legacy</p>' })).toBe('Draft');
    expect(planStateLabel({ ...manual('saved'), teacher_id: 'someone-else' })).toBe('Draft');
    expect(planStateLabel({})).toBe('Draft');
  });
});
