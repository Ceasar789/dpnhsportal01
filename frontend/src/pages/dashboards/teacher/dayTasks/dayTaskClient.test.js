import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/backendApi', () => ({ backendRequest: vi.fn() }));

import { backendRequest } from '../../../../lib/backendApi';
import { isCancelError, requestDayTask } from './dayTaskClient';

const params = { lessonPlanId: 'plan-1', day: 'Monday', taskType: 'quiz', itemCount: 10 };
const question = { localId: 'draft-1', question: 'Cells live.', item_type: 'true_false', options: [], points: 1 };
const quiz = (extra = {}) => ({ status: 'generated-day-task', saved: false, taskType: 'quiz', day: 'Monday',
  sourceLessonPlan: { id: 'plan-1', title: 'Cells' }, title: 'Quiz', instructions: 'Answer.', questions: [question],
  answerKey: [{ localId: 'draft-1', correct_answer: 'True' }], activity: null, providerCalls: 1, ...extra });
const activity = (extra = {}) => quiz({ taskType: 'activity', questions: [], answerKey: [], activity: { language: 'en', title: 'Map' }, ...extra });
const essayQuestion = (essay) => ({ ...question, item_type: 'essay', points: 5, essay });
const essay = { referenceAnswer: 'Model.', minWords: 10, maxWords: 20, rubric: [{ criterion: 'Accuracy', points: 5 }] };
const assignment = (extra = {}) => quiz({ taskType: 'assignment', questions: [essayQuestion(essay)], answerKey: [], ...extra });
const responding = value => vi.fn(async () => value);

describe('requestDayTask request', () => {
  it('posts the exact body per task type', async () => {
    const cases = [
      [{ ...params, taskType: 'activity', itemCount: 10 }, activity(), { lessonPlanId: 'plan-1', day: 'Monday', taskType: 'activity' }],
      [params, quiz(), { lessonPlanId: 'plan-1', day: 'Monday', taskType: 'quiz', itemCount: 10 }],
      [{ ...params, itemCount: undefined, customized: true, typeCounts: { multiple_choice: 10 } }, quiz(),
        { lessonPlanId: 'plan-1', day: 'Monday', taskType: 'quiz',
          typeCounts: { multiple_choice: 10, true_false: 0, identification: 0, enumeration: 0 } }],
      [{ ...params, taskType: 'assignment', itemCount: 2 }, assignment(), { lessonPlanId: 'plan-1', day: 'Monday', taskType: 'assignment', itemCount: 2 }],
    ];
    for (const [input, response, expected] of cases) {
      const request = responding(response);
      await requestDayTask(input, { request });
      const [path, options] = request.mock.calls[0];
      expect(path).toBe('/api/ai/day-tasks');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual(expected);
    }
  });

  it('passes the signal and defaults to backendRequest', async () => {
    backendRequest.mockResolvedValueOnce(quiz());
    const { signal } = new AbortController();
    await expect(requestDayTask(params, { signal })).resolves.toEqual(quiz());
    expect(backendRequest.mock.calls[0][1].signal).toBe(signal);
  });

  it('returns valid responses of every type', async () => {
    await expect(requestDayTask({ ...params, taskType: 'activity' }, { request: responding(activity()) })).resolves.toEqual(activity());
    await expect(requestDayTask({ ...params, taskType: 'assignment' }, { request: responding(assignment()) })).resolves.toEqual(assignment());
  });
});

describe('requestDayTask response validation', () => {
  const unexpected = 'The server returned an unexpected response. Nothing was saved.';
  const rejects = (value, input = params) => expect(requestDayTask(input, { request: responding(value) })).rejects.toThrow(unexpected);

  it('rejects non-objects', async () => {
    for (const value of [null, undefined, 'text', 7, []]) await rejects(value);
  });

  it('rejects wrong status, saved, taskType, or day', async () => {
    await rejects(quiz({ status: 'generated-draft' }));
    await rejects(quiz({ saved: true }));
    await rejects(quiz({ saved: undefined }));
    await rejects(quiz({ taskType: 'assignment' }));
    await rejects(quiz({ day: 'Tuesday' }));
  });

  it('rejects wrong top-level shapes', async () => {
    await rejects(quiz({ title: 5 }));
    await rejects(quiz({ instructions: null }));
    await rejects(quiz({ questions: {} }));
    await rejects(quiz({ answerKey: 'x' }));
  });

  it('rejects malformed questions', async () => {
    for (const bad of [null, { ...question, question: 5 }, { ...question, item_type: 7 }, { ...question, item_type: 'matching' },
      { ...question, item_type: 'constructor' }, { ...question, options: 'A' }, { ...question, options: [{}] },
      { ...question, points: '1' }, { ...question, localId: undefined }]) {
      await rejects(quiz({ questions: [bad] }));
    }
  });

  it('rejects malformed or missing answer keys', async () => {
    await rejects(quiz({ answerKey: [] }));
    await rejects(quiz({ answerKey: [{ localId: 'draft-1', correct_answer: {} }] }));
    await rejects(quiz({ answerKey: [null] }));
  });

  it('rejects malformed essays', async () => {
    const input = { ...params, taskType: 'assignment' };
    for (const bad of [undefined, { ...essay, referenceAnswer: 1 }, { ...essay, minWords: '1' },
      { ...essay, rubric: {} }, { ...essay, rubric: [{ criterion: {}, points: 5 }] }]) {
      await rejects(assignment({ questions: [essayQuestion(bad)] }), input);
    }
  });

  it('needs an activity object for activities and null otherwise', async () => {
    const input = { ...params, taskType: 'activity' };
    for (const bad of [null, undefined, 'x', []]) await rejects(activity({ activity: bad }), input);
    await rejects(quiz({ activity: { title: 'Map' } }));
    await rejects(quiz({ activity: undefined }));
  });

  it('never puts response text in the thrown message', async () => {
    const error = await requestDayTask(params, { request: responding(quiz({ status: 'RAW-RESPONSE-TEXT', title: 'RAW-RESPONSE-TEXT' })) })
      .catch(failure => failure);
    expect(error.message).toBe(unexpected);
    expect(JSON.stringify({ message: error.message, cause: error.cause })).not.toContain('RAW-RESPONSE-TEXT');
  });
});

describe('cancel and failures', () => {
  it('recognizes an abort directly or through a request error cause', () => {
    const abort = new DOMException('Aborted', 'AbortError');
    expect(isCancelError(abort)).toBe(true);
    expect(isCancelError(Object.assign(new Error('The server response could not be received.'), { cause: abort }))).toBe(true);
    expect(isCancelError(new Error('Other'))).toBe(false);
    expect(isCancelError(undefined)).toBe(false);
  });

  it('rethrows an abort so it stays recognizable', async () => {
    const failure = Object.assign(new Error('x'), { cause: new DOMException('Aborted', 'AbortError') });
    const error = await requestDayTask(params, { request: vi.fn(async () => { throw failure; }) }).catch(value => value);
    expect(error).toBe(failure);
    expect(isCancelError(error)).toBe(true);
  });

  it('passes a safe server message through unchanged', async () => {
    await expect(requestDayTask(params, { request: vi.fn(async () => { throw new Error('This saved lesson plan is unavailable.'); }) }))
      .rejects.toThrow('This saved lesson plan is unavailable.');
  });
});
