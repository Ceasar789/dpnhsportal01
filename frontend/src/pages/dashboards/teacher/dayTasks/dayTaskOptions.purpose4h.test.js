// R39 (4h): Formative / Summative / Essay over the current task types.
import { describe, expect, it } from 'vitest';
import { ASSESSMENT_PURPOSE_LABELS, ASSESSMENT_PURPOSES, buildRequestBody, purposeFits, taskTypeForPurpose } from './dayTaskOptions';

const base = { lessonPlanId: 'p', day: 'Monday' };

describe('assessment purpose', () => {
  it('the design list, in order', () => {
    expect(ASSESSMENT_PURPOSES.map(p => ASSESSMENT_PURPOSE_LABELS[p])).toEqual(['Formative', 'Summative', 'Essay']);
  });
  it('which task types each purpose fits', () => {
    expect([purposeFits('formative', 'activity'), purposeFits('formative', 'quiz'), purposeFits('formative', 'assignment')]).toEqual([true, true, false]);
    expect([purposeFits('summative', 'quiz'), purposeFits('summative', 'activity')]).toEqual([true, false]);
    expect([purposeFits('essay', 'assignment'), purposeFits('essay', 'quiz')]).toEqual([true, false]);
  });
  it('choosing a purpose keeps a fitting type and otherwise switches to one', () => {
    expect(taskTypeForPurpose('formative', 'activity')).toBe('activity');
    expect(taskTypeForPurpose('summative', 'activity')).toBe('quiz');
    expect(taskTypeForPurpose('essay', 'quiz')).toBe('assignment');
  });
  it('the request carries the purpose only when it fits; without one it is unchanged', () => {
    expect(buildRequestBody({ ...base, taskType: 'quiz', itemCount: 10, purpose: 'summative' }))
      .toEqual({ ...base, taskType: 'quiz', itemCount: 10, purpose: 'summative' });
    expect(buildRequestBody({ ...base, taskType: 'activity', purpose: 'essay' })).toEqual({ ...base, taskType: 'activity' });
    expect(buildRequestBody({ ...base, taskType: 'assignment' })).toEqual({ ...base, taskType: 'assignment', itemCount: 3 });
  });
});
