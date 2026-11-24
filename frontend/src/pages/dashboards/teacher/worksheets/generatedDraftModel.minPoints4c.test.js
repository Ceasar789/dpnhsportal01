// 4c (QA ID-102, Q15): at least 0.5 points per question when the teacher saves.
import { describe, expect, it } from 'vitest';
import { minimumPointsErrors, MIN_ITEM_POINTS, validateGeneratedWorksheet } from './generatedDraftModel';

const draft = (...points) => ({ questions: points.map((value, i) => ({ localId: `q${i}`, points: value })) });

describe('minimumPointsErrors', () => {
  it('the minimum is 0.5', () => expect(MIN_ITEM_POINTS).toBe(0.5));
  it('0 and 0.25 are refused, 0.5 and up are fine', () => {
    expect(minimumPointsErrors(draft(0, 0.25, 0.5, 1, '2'))).toEqual([
      { field: 'question-1-points', message: 'Give question 1 at least 0.5 points.' },
      { field: 'question-2-points', message: 'Give question 2 at least 0.5 points.' },
    ]);
    expect(minimumPointsErrors(draft('0'))).toHaveLength(1);
  });
  it('leaves empty, negative and non-numbers to the existing check (no double message)', () => {
    expect(minimumPointsErrors(draft('', null, -1, 'x'))).toEqual([]);
  });
  it('is NOT part of validateGeneratedWorksheet, so older 0-point worksheets still load', () => {
    const errors = validateGeneratedWorksheet({ title: 'T', instructions: '', questions: [
      { localId: 'a', question: 'Q', item_type: 'identification', points: 0, options: [] }], answerKey: [{ localId: 'a', answer: 'x' }] });
    expect(errors.some(e => /at least 0\.5/.test(e.message))).toBe(false);
  });
});
