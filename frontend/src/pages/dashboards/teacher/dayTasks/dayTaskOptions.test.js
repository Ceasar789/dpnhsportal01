import { describe, expect, it } from 'vitest';
import { TASK_TYPES } from '../../../../lib/taskFormatting';
import { ASSIGNMENT_DEFAULT, ASSIGNMENT_MAX, ASSIGNMENT_MIN, buildRequestBody, DAY_TASK_TYPE_LABELS, DAY_TASK_TYPES,
  defaultQuizSplit, QUIZ_DEFAULT, QUIZ_MAX, QUIZ_MIN, toStoredTaskType, validateOptions } from './dayTaskOptions';

const ok = options => validateOptions(options).ok;
const split = (multiple_choice, true_false, identification, enumeration = 0) =>
  ({ multiple_choice, true_false, identification, enumeration });

describe('constants', () => {
  it('match the backend contract', () => {
    expect(DAY_TASK_TYPES).toEqual(['activity', 'quiz', 'assignment']);
    expect(DAY_TASK_TYPES.every(type => DAY_TASK_TYPE_LABELS[type])).toBe(true);
    expect([QUIZ_MIN, QUIZ_MAX, QUIZ_DEFAULT]).toEqual([10, 20, 10]);
    expect([ASSIGNMENT_MIN, ASSIGNMENT_MAX, ASSIGNMENT_DEFAULT]).toEqual([1, 5, 3]);
  });
});

describe('defaultQuizSplit', () => {
  it('matches the documented splits', () => {
    expect(defaultQuizSplit(10)).toEqual(split(5, 3, 2));
    expect(defaultQuizSplit(15)).toEqual(split(8, 4, 3));
    expect(defaultQuizSplit(20)).toEqual(split(10, 6, 4));
  });

  it('always sums to n', () => {
    for (let n = QUIZ_MIN; n <= QUIZ_MAX; n += 1) {
      expect(Object.values(defaultQuizSplit(n)).reduce((sum, count) => sum + count, 0)).toBe(n);
    }
  });
});

describe('validateOptions', () => {
  it('rejects an unknown or missing task type', () => {
    expect(ok({ taskType: 'exam' })).toBe(false);
    expect(ok({ taskType: null })).toBe(false);
    expect(ok({})).toBe(false);
  });

  it('activity takes no counts', () => {
    expect(ok({ taskType: 'activity' })).toBe(true);
    expect(ok({ taskType: 'activity', itemCount: 1 })).toBe(false);
    expect(ok({ taskType: 'activity', typeCounts: {} })).toBe(false);
  });

  it('quiz boundaries are 10 to 20, default allowed', () => {
    expect(ok({ taskType: 'quiz' })).toBe(true);
    expect(ok({ taskType: 'quiz', itemCount: 9 })).toBe(false);
    expect(ok({ taskType: 'quiz', itemCount: 10 })).toBe(true);
    expect(ok({ taskType: 'quiz', itemCount: 20 })).toBe(true);
    expect(ok({ taskType: 'quiz', itemCount: 21 })).toBe(false);
  });

  it('assignment boundaries are 1 to 5, default allowed', () => {
    expect(ok({ taskType: 'assignment' })).toBe(true);
    expect(ok({ taskType: 'assignment', itemCount: 0 })).toBe(false);
    expect(ok({ taskType: 'assignment', itemCount: 1 })).toBe(true);
    expect(ok({ taskType: 'assignment', itemCount: 5 })).toBe(true);
    expect(ok({ taskType: 'assignment', itemCount: 6 })).toBe(false);
    expect(ok({ taskType: 'assignment', typeCounts: { essay: 3 } })).toBe(false);
  });

  it('rejects decimals, NaN, negatives, strings, and null as counts', () => {
    for (const itemCount of [10.5, NaN, -10, '10', null, Infinity]) {
      expect(ok({ taskType: 'quiz', itemCount })).toBe(false);
    }
    for (const itemCount of [1.5, NaN, -1, '3', null]) {
      expect(ok({ taskType: 'assignment', itemCount })).toBe(false);
    }
    for (const bad of [1.5, NaN, -1, '5', null, 21]) {
      expect(ok({ taskType: 'quiz', typeCounts: { multiple_choice: bad, true_false: 10 } })).toBe(false);
    }
  });

  it('accepts typeCounts summing to 10-20, with or without a matching itemCount', () => {
    expect(ok({ taskType: 'quiz', typeCounts: split(10, 0, 0) })).toBe(true);
    expect(ok({ taskType: 'quiz', typeCounts: split(10, 5, 3, 2) })).toBe(true);
    expect(ok({ taskType: 'quiz', typeCounts: { true_false: 12 } })).toBe(true);
    expect(ok({ taskType: 'quiz', itemCount: 12, typeCounts: { true_false: 12 } })).toBe(true);
  });

  it('rejects a sum out of range or mismatched', () => {
    expect(ok({ taskType: 'quiz', typeCounts: split(5, 4, 0) })).toBe(false);
    expect(ok({ taskType: 'quiz', typeCounts: split(10, 6, 5) })).toBe(false);
    expect(ok({ taskType: 'quiz', itemCount: 11, typeCounts: split(5, 3, 2) })).toBe(false);
  });

  it('rejects essay, unknown keys, and non-object typeCounts in a quiz', () => {
    expect(ok({ taskType: 'quiz', typeCounts: { multiple_choice: 9, essay: 1 } })).toBe(false);
    expect(ok({ taskType: 'quiz', typeCounts: { multiple_choice: 10, essay: 0 } })).toBe(false);
    expect(ok({ taskType: 'quiz', typeCounts: { matching: 10 } })).toBe(false);
    expect(ok({ taskType: 'quiz', typeCounts: [10] })).toBe(false);
    expect(ok({ taskType: 'quiz', typeCounts: null })).toBe(false);
  });

  it('always gives a message when invalid and none when valid', () => {
    expect(validateOptions({ taskType: 'quiz', itemCount: 9 }).error).toMatch(/10 to 20/);
    expect(validateOptions({ taskType: 'quiz' }).error).toBe('');
  });
});

describe('buildRequestBody', () => {
  const base = { lessonPlanId: 'plan', day: 'Monday' };

  it('activity sends no counts, even if some are passed', () => {
    expect(buildRequestBody({ ...base, taskType: 'activity', itemCount: 5, typeCounts: split(5, 3, 2), customized: true }))
      .toEqual({ ...base, taskType: 'activity' });
  });

  it('quiz not customized sends itemCount only', () => {
    expect(buildRequestBody({ ...base, taskType: 'quiz', itemCount: 15, typeCounts: split(5, 3, 2), customized: false }))
      .toEqual({ ...base, taskType: 'quiz', itemCount: 15 });
    expect(buildRequestBody({ ...base, taskType: 'quiz' })).toEqual({ ...base, taskType: 'quiz', itemCount: 10 });
  });

  it('quiz customized sends all four typeCounts and no itemCount', () => {
    expect(buildRequestBody({ ...base, taskType: 'quiz', itemCount: 15, typeCounts: { true_false: 12 }, customized: true }))
      .toEqual({ ...base, taskType: 'quiz', typeCounts: split(0, 12, 0) });
  });

  it('assignment sends itemCount only', () => {
    expect(buildRequestBody({ ...base, taskType: 'assignment', itemCount: 4, typeCounts: {}, customized: true }))
      .toEqual({ ...base, taskType: 'assignment', itemCount: 4 });
    expect(buildRequestBody({ ...base, taskType: 'assignment' })).toEqual({ ...base, taskType: 'assignment', itemCount: 3 });
  });
});

describe('toStoredTaskType', () => {
  it('maps each type to a stored task type', () => {
    expect(DAY_TASK_TYPES.map(toStoredTaskType)).toEqual(['worksheet', 'quiz', 'assignment']);
    for (const type of DAY_TASK_TYPES) expect(TASK_TYPES).toContain(toStoredTaskType(type));
  });
});
