import { describe, expect, it } from 'vitest';
import {
  ESSAY_FIXTURE, evaluateSyntheticEssay, reviewFingerprint, sumPoints, validateMarks, validateRubric,
} from './essayReviewModel';

const question = ESSAY_FIXTURE.questions[0];
const response = ESSAY_FIXTURE.responses[0];
const rubric = ESSAY_FIXTURE.rubric;

describe('fictional essay review contract', () => {
  it('calculates the rubric and rejects mismatch with the question maximum', () => {
    expect(sumPoints(rubric.map(item => item.maxPoints))).toBe(5);
    expect(validateRubric(rubric, question.points)).toEqual({});
    expect(validateRubric(rubric, 4).total).toContain('must equal');
  });

  it('requires titles, distinct identities, finite nonnegative point allocations and at least one criterion', () => {
    expect(validateRubric([], 5).rubric).toBeTruthy();
    expect(validateRubric([{ ...rubric[0], title: '' }, { ...rubric[1], id: rubric[0].id }], 5)).toMatchObject({
      'title-0': expect.any(String), 'id-1': expect.any(String),
    });
    for (const value of ['', '-1', 'NaN', 'Infinity', '101']) {
      expect(validateRubric([{ ...rubric[0], maxPoints: value }], 5)['max-0']).toBeTruthy();
    }
  });

  it('requires every criterion mark to stay within its maximum', () => {
    expect(validateMarks(rubric, { content: 3, clarity: 1.5 })).toEqual({});
    expect(validateMarks(rubric, { content: 4, clarity: 2 }).content).toBeTruthy();
    expect(validateMarks(rubric, { content: -1, clarity: 2 }).content).toBeTruthy();
    expect(validateMarks(rubric, { content: 'abc', clarity: 2 }).content).toBeTruthy();
    expect(validateMarks(rubric, { content: 2 }).clarity).toBeTruthy();
    expect(sumPoints([3, 1.5])).toBe(4.5);
    expect(sumPoints([3, 'not-a-number'])).toBeNull();
  });

  it('returns one known fictional suggestion and no result for arbitrary responses or edited rubrics', () => {
    const input = { fixtureId: ESSAY_FIXTURE.id, response, question, criteria: rubric };
    expect(evaluateSyntheticEssay(input)).toMatchObject({ label: 'Simulated evaluation — not live AI', total: 5,
      marks: { content: 3, clarity: 2 } });
    expect(() => evaluateSyntheticEssay({ ...input, response: { ...response, answer: 'Another answer' } })).toThrow('No local evaluation fixture');
    expect(() => evaluateSyntheticEssay({ ...input, response: ESSAY_FIXTURE.responses[1] })).toThrow('No local evaluation fixture');
    expect(() => evaluateSyntheticEssay({ ...input, criteria: rubric.map(item => ({ ...item, description: 'Changed' })) })).toThrow('No local evaluation fixture');
  });

  it('changes the review fingerprint on critical question, response, rubric and fixture changes', () => {
    const input = { fixtureId: ESSAY_FIXTURE.id, response, question, criteria: rubric };
    const original = reviewFingerprint(input);
    expect(reviewFingerprint({ ...input, response: { ...response, answer: 'Edited' } })).not.toBe(original);
    expect(reviewFingerprint({ ...input, response: ESSAY_FIXTURE.responses[1] })).not.toBe(original);
    expect(reviewFingerprint({ ...input, question: ESSAY_FIXTURE.questions[1] })).not.toBe(original);
    expect(reviewFingerprint({ ...input, criteria: [{ ...rubric[0], maxPoints: 2 }, rubric[1]] })).not.toBe(original);
    expect(reviewFingerprint({ ...input, fixtureId: 'new-fixture' })).not.toBe(original);
  });
});
